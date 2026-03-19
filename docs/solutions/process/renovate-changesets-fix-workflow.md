---
title: Fixing renovate-changesets — The Standard Workflow
category: process
tags: [renovate-changesets, github-actions, workflow, bugfix, changesets]
severity: reference
components: [action source, dist build, changesets, PRs, release pipeline]
date: 2026-03-18
---

How to diagnose, fix, verify, and ship changes to the `renovate-changesets` GitHub Action.

## Quick Reference

```bash
# 1. Branch
git checkout main && git pull
git checkout -b fix/renovate-changesets-<brief-description>

# 2. Edit source in .github/actions/renovate-changesets/src/

# 3. Verify
pnpm run type-check && pnpm -w test --project renovate-changesets && pnpm run fix && pnpm run lint

# 4. Build dist
pnpm build

# 5. Create changeset (.changeset/<name>.md targeting 'renovate-changesets')

# 6. Commit & push
git add <source files> <dist/index.js> <.changeset/*.md>
git commit -m "fix(renovate-changesets): <description>"
git push -u origin fix/renovate-changesets-<brief-description>

# 7. Create PR
gh pr create --title "fix(renovate-changesets): <description>" --body "..."
```

## Step-by-Step

### 1. Diagnose the Issue

Typical starting point: a Renovate PR with a malformed changeset. You'll need:

- **The PR showing the bad changeset**: Check the `.changeset/*.md` file in the diff
- **The action run that produced it**: Look at the "Create Renovate Changeset" job logs

Key log lines to search for:

```text
Parsed PR context:    → shows manager, updateType, isSecurityUpdate, isGroupedUpdate, dependencyCount
Enhanced dependency:  → shows what detectors found
Changed files:        → shows which files triggered detection
```

### 2. Trace Through the Code

The action's data flow:

```text
PR event
  → extractPRContext()          [parser/renovate-pr-context-extractor.ts]
    → extractDependenciesFromPR()  [parser/renovate-dependency-extractor.ts]
    → parseCommitMessage()         [parser/renovate-title-parser.ts]
    → detectManagerFromFiles()     [parser/renovate-manager-detector.ts]
    → filterPhantomDependencies()  [parser/renovate-pr-context-extractor.ts]
  → runDetectors()              [detector-runner.ts]
    → GitHubActionsChangeDetector  [github-actions-change-detector.ts]
    → NPMChangeDetector            [npm-change-detector.ts]
    → (other ecosystem detectors)
  → SemverImpactAssessor        [semver-impact-assessor.ts]
  → ChangeCategorization        [change-categorization-engine.ts]
  → ChangesetSummaryGenerator   [changeset-summary-generator.ts]
    → generateContextAwareSummary() dispatches by manager
    → structural-summaries.ts / js-ecosystem-summaries.ts
  → writeRenovateChangeset()    [changeset-writer.ts]
  → GitOperations.commit()      [git-operations.ts]
```

### 3. Create a Fix Branch

```bash
git checkout main && git pull
git checkout -b fix/renovate-changesets-<brief-description>
```

Branch naming convention: `fix/renovate-changesets-<what-you're-fixing>`

### 4. Make the Fix

Edit source files under `.github/actions/renovate-changesets/src/`. Key rules:

- **ESM only** — `import`/`export`, never `require()`
- **Strict TypeScript** — no `as any`, no `@ts-ignore`
- **200 LOC limit per file** — extract to sub-modules if needed
- **`import type`** for type-only imports (`verbatimModuleSyntax` is enabled)
- **2-space indent, 120 char line limit**

### 5. Verify

Run in this order — each catches different issues:

```bash
# Type safety
pnpm run type-check

# Tests (baseline: check current count before your changes)
pnpm -w test --project renovate-changesets

# Auto-fix lint issues BEFORE checking lint (lint-staged does this on commit too)
pnpm run fix

# Lint
pnpm run lint
```

Or the all-in-one:

```bash
pnpm run quality-check    # type-check + lint + build + test
```

### 6. Build dist

GitHub Actions requires pre-built JS. Always rebuild after source changes:

```bash
pnpm build
```

This regenerates `.github/actions/renovate-changesets/dist/index.js` which **must be committed**.

### 7. Create a Changeset

Create a manual `.changeset/<descriptive-name>.md` file:

```markdown
---
"renovate-changesets": patch
---

Brief description of what changed
```

**The package name is `renovate-changesets`** — not `@bfra.me/.github`. Check `.github/actions/renovate-changesets/package.json` if unsure.

**Never use `pnpm changeset` CLI** — it produces inconsistent format.

### 8. Commit

```bash
git add \
  .github/actions/renovate-changesets/src/<changed-files> \
  .github/actions/renovate-changesets/dist/index.js \
  .changeset/<name>.md

git commit -m "fix(renovate-changesets): <description>"
```

The pre-commit hook runs lint-staged (`eslint --fix` on all staged files). This can reformat your changes — if the commit fails or lint-staged modifies files, re-stage and commit again.

### 9. Push and Create PR

```bash
git push -u origin fix/renovate-changesets-<description>

gh pr create \
  --title "fix(renovate-changesets): <description>" \
  --body "## Summary
- <what was wrong>
- <what the fix does>
- <verification results>"
```

### 10. Post-Merge: How Changes Propagate

After merge to `main`:

1. The changesets release workflow creates a release PR (`changeset-release/main`)
2. That PR bumps `renovate-changesets` version in `package.json` and updates `CHANGELOG.md`
3. When the release PR merges, a new version tag is created
4. Renovate updates the action SHA reference in `.github/workflows/renovate-changeset.yaml`
5. Subsequent Renovate PRs use the new action version

**Version lag is normal** — a fix merged to `main` won't affect existing Renovate PRs until the SHA reference is updated through this pipeline.

## Common Pitfalls

### Wrong changeset package name

```markdown
# WRONG — targets the monorepo root

'@bfra.me/.github': patch

# CORRECT — targets the action package

'renovate-changesets': patch
```

### Forgetting to rebuild dist

The action won't pick up your source changes until `dist/index.js` is rebuilt and committed. Always run `pnpm build` before committing.

### lint-staged undoes your formatting

The pre-commit hook runs `eslint --fix` which can add blank lines back or reformat code. If you're trimming blank lines to meet LOC limits, verify the committed file after the hook runs:

```bash
wc -l .github/actions/renovate-changesets/src/<your-file>.ts
```

### Pre-existing LSP errors in test files

The test files (`test/integration/components.test.ts`, `test/setup.ts`) have pre-existing LSP diagnostics that are NOT caused by your changes. `pnpm run type-check` (tsc) passes — the LSP uses different settings. Ignore these.

### Version lag on existing PRs

After merging a fix, existing Renovate PRs still reference the old action SHA. The fix propagates through the release pipeline (see Step 10). To test on an existing PR, you'd need to manually update the workflow SHA reference or wait for the pipeline.

## Cross-References

- [Action README](/.github/actions/renovate-changesets/README.md) — usage, configuration, inputs/outputs
- [Action AGENTS.md](/.github/actions/renovate-changesets/AGENTS.md) — module structure, conventions, test patterns
- [Root AGENTS.md](/AGENTS.md) — project-wide conventions, commands
- [Changesets instructions](/.github/instructions/changesets.instructions.md) — changeset creation guidelines
- [GitHub Actions instructions](/.github/instructions/github-actions.instructions.md) — workflow best practices
