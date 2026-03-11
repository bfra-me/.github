# GitHub Copilot Instructions for bfra-me/.github

Read `AGENTS.md` at the repo root for project structure, conventions, commands, and anti-patterns. Each action in `.github/actions/*/` has its own `AGENTS.md` with module-specific guidance. Scoped guidelines live in `.github/instructions/*.instructions.md` (TypeScript, pnpm, GitHub Actions, changesets, Renovate).

## Critical Rules

### Actions Must Be Pinned to Commit SHAs

```yaml
# CORRECT
- uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2

# WRONG — never use floating tags
- uses: actions/checkout@v4
- uses: actions/checkout@main
```

### Changesets Are Manual

Create `.changeset/{name}.md` by hand. Do NOT run `pnpm changeset` CLI — it produces inconsistent format.

```markdown
---
"@bfra.me/.github": patch
---

Description of what changed
```

### ESM Only

All code uses `"type": "module"`. Use `import`/`export` syntax exclusively. Never use `require()`.

### Strict TypeScript

Never use `as any`, `@ts-ignore`, or `@ts-expect-error`. Use type guards and explicit null checks instead of implicit truthiness:

```typescript
// CORRECT
if (value != null) { ... }
if (typeof str === 'string' && str.length > 0) { ... }

// WRONG
if (value) { ... }
if (str) { ... }
```

### Error Handling in Actions

Always use `core.setFailed()` for action entry points:

```typescript
try {
  // action logic
} catch (error) {
  core.setFailed(error instanceof Error ? error.message : String(error))
}
```

### Authentication

Use the `bfra-me[bot]` GitHub App for automated workflows. Never hardcode tokens or secrets.

## Verification Commands

Run these before considering work complete:

```bash
pnpm run type-check    # tsc --noEmit
pnpm run lint          # ESLint
pnpm build             # Build all workspace packages (dist/ must be committed for actions)
pnpm test              # Vitest

# Full CI loop (same as what runs in CI)
pnpm run quality-check
```

## Build Artifacts

`dist/` directories in `.github/actions/*/` are committed — GitHub Actions requires pre-built JS. After modifying action source, always rebuild and include `dist/` changes.

## Workspace Structure

This is a pnpm monorepo. Workspace packages: root (`.`) + `.github/actions/*`. Scripts use `#!/usr/bin/env tsx` for direct TypeScript execution. Shared configs: `@bfra.me/eslint-config`, `@bfra.me/prettier-config`, `@bfra.me/tsconfig`.

## Workflow Templates

Templates in `workflow-templates/` always require a matching `.properties.json` metadata file. Use placeholder variables: `$default-branch`, `$protected-branches`, `$cron-weekly`.

## What NOT to Do

- Use `pnpm changeset` CLI
- Use floating action versions (`@main`, `@v1`)
- Hardcode secrets in code or workflows
- Use `contexts` in branch protection (deprecated — use `checks`)
- Cancel Renovate jobs that push to main
- Add `@ts-ignore` or `as any` to suppress type errors
- Create workflow templates without `.properties.json`
- Skip rebuilding `dist/` after modifying action source
