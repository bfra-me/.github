---
title: Release propagation walked the dependency graph backwards
date: 2026-08-19
category: logic-errors
module: .github/actions/renovate-changesets
problem_type: logic_error
component: tooling
symptoms:
  - Release PR bumped a package that consumed nothing in the update
  - Package with no release history gained a first-ever CHANGELOG entry
  - Changesets CLI stayed green because an over-broad release set is legal input
root_cause: logic_error
resolution_type: code_fix
severity: critical
related_components:
  - development_workflow
tags:
  - renovate-changesets
  - changesets
  - dependency-graph
  - monorepo
  - release-automation
---

## Problem

`findRelatedPackages` treated package relationships as traversable in both directions. That is wrong for release membership.

`analyzeInternalDependencies` records `{source: consumer, target: provider}` — a package that declares `shared` produces `source: gateway`, `target: shared` (`src/multi-package/relationship-analyzer.ts:37-59`). Walking `source → target` after a consumer changed therefore selected the **provider**. The action was answering "what does this package consume?" and using the answer as Changesets release frontmatter.

Propagation was removed in `9ee029e7`. `determineAffectedPackages` now stops at changed files and packages declaring changed external dependencies (`src/multi-package/impact-analyzer.ts:4-34`).

## Symptoms

A dependency update under `apps/gateway` pulled `@marcusrbrown/infra-shared` into the release set even though shared consumed nothing that changed.

The fixture makes the direction explicit:

- `apps/gateway/package.json` declares `@marcusrbrown/infra-shared` and receives `@aws-sdk/client-s3`
- `packages/shared/package.json` declares only `yaml` and `zod`

In production, `marcusrbrown/infra`'s release PR added `@marcusrbrown/infra-shared` — a package with no release history in that repo, where every prior release bumped `packages/cli` alone. The generating PR updated three AWS SDK packages; shared consumed none of them.

## What Didn't Work

**Reversing the traversal to `target → source`.** That fixes the direction error and preserves the wrong abstraction.

`affectedPackages` is not an impact report. `run-generation.ts` filters it into releasable packages and passes it to changeset generation — it _becomes_ release membership.

Changesets already propagates internal releases when `.changeset/config.json` sets `"updateInternalDependencies": "patch"`, and does it **transitively**: a changeset naming only `c` in an `a → b → c` chain releases `c`, `b`, and `a`. Runtime, optional, and peer dependents participate; dev-only dependents do not.

The action's traversal wasn't even doing that job. It snapshotted the affected set and expanded exactly **one** hop — directionally wrong and semantically incomplete.

## Solution

Propagation was removed entirely: 27 deletions across `src/multi-package-analyzer.ts` (1) and `src/multi-package/impact-analyzer.ts` (26), with no replacement traversal.

`determineAffectedPackages` now has two responsibilities:

1. Add the package owning each changed file (`impact-analyzer.ts:11-16`)
2. Add packages declaring a changed external dependency, across runtime, dev, peer, and optional maps (`impact-analyzer.ts:18-30`)

`performImpactAnalysis` was deliberately left intact (`impact-analyzer.ts:36-90`). It computes reporting fields — direct vs indirect impact, risk. Impact reporting and release membership are different questions and should not share a code path.

Five unit tests asserted the old behavior and were corrected. In every one, the fixture showed the removed package consumed nothing that changed.

## Why This Works

The action emits only packages identified by a changed path or a dependency declaration. Changesets owns dependent propagation, including transitivity and dependency-type rules.

The contract test verifies the boundary from both sides:

```ts
expect(authoredReleases(oracle.releasePlan).map(({name}) => name)).toEqual([
  '@marcusrbrown/infra-gateway',
])
expect(effectiveReleases(oracle.releasePlan).map(({name}) => name)).toEqual([
  '@marcusrbrown/infra-gateway',
])
```

Both assertions are necessary. **The Changesets CLI oracle stays green for an over-broad release set** — extra releases are legal input, so the CLI cannot detect that the action selected an unchanged provider. Release-membership assertion is the only gate for this class.

## Prevention

- Treat relationship records as directed declarations: `source` declares a dependency on `target` (`relationship-analyzer.ts:44-59`)
- Keep release selection separate from impact analysis
- Do not add local graph propagation unless the action is intentionally replacing Changesets' release algorithm
- Preserve `test/contract/release-propagation-direction.contract.test.ts`
- Assert **both** authored and effective release membership. Checking only that Changesets accepts the output is insufficient
- When changing dependency analysis, verify runtime/optional/peer/dev-only behavior against Changesets rather than inferring release semantics from the relationship graph

## Related Issues

- [Changeset deduplication compared release sets but not summaries](./changeset-dedup-ignored-summaries-2026-08-19.md)
- [Contract-first testing for actions that run in foreign repos](../best-practices/contract-testing-actions-that-run-in-foreign-repos-2026-08-19.md)
- [Test fixtures underspecified in the dimension the code ignores](../best-practices/test-fixtures-underspecified-in-ignored-dimension-2026-08-19.md)
- [renovate-changesets fix workflow](../process/renovate-changesets-fix-workflow.md)
