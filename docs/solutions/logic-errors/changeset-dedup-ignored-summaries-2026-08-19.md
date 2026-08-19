---
title: Changeset deduplication compared release sets but not summaries
date: 2026-08-19
category: logic-errors
module: .github/actions/renovate-changesets
problem_type: logic_error
component: tooling
symptoms:
  - Generated changeset silently skipped as a duplicate
  - Lockfile-maintenance entry missing from the changelog
  - Unrelated pending changeset for the same package and bump type suppressed a real one
root_cause: logic_error
resolution_type: code_fix
severity: high
related_components:
  - development_workflow
tags:
  - renovate-changesets
  - changesets
  - deduplication
  - release-automation
  - idempotency
---

## Problem

`isChangesetDuplicateOfExisting` compared only release entries — package name plus bump type (`src/deduplicator/changeset-comparator.ts:65-79`). The summary was never read.

That is unsafe because `analyzeExistingChangesets` scans **every** recent `.changeset/*.md` on disk, excluding only `README*` and entries older than `maxExistingChangesetAge` (`src/deduplicator/existing-changeset-analyzer.ts:14-34`). It does not know which files the current PR added.

Any pending `pkg: patch` changeset could therefore suppress a genuinely different change for the same package. This repository normally carries 7–18 pending changesets between releases, so the collision surface is large.

## Symptoms

The action generated a valid changeset, then skipped it because an existing changeset shared its release set — even when the summaries described unrelated work.

The old comparison could not distinguish:

```md
---
'renovate-changesets': patch
---

Refresh pnpm lockfile dependencies
```

from:

```md
---
'renovate-changesets': patch
---

Unrelated package maintenance
```

In production, a lockfile-maintenance PR lost its entry: four unrelated pending `renovate-changesets: patch` changesets from earlier work swallowed it, and the change never reached the changelog.

## What Didn't Work

**Comparing release sets alone.** Package and bump type identify the release _target_, not the change being released. Two unrelated updates to the same package at the same bump level are indistinguishable under that rule.

**Scoping the scan to PR-added files** would address the collision at its root — but that is not what this fix does. `analyzeExistingChangesets` still scans the directory, subject only to the README and age filters. The fix narrows the match without pretending to solve scoping.

## Solution

`isChangesetDuplicateOfExisting` now requires **both** an equal normalized release set and an equal normalized summary:

```ts
return (
  newReleases.every((release, index) => release === existingReleases[index]) &&
  normalizeSummary(changeset.summary) === normalizeSummary(existing.summary)
)
```

Normalization is deliberately small and deterministic:

```ts
function normalizeSummary(summary: string): string {
  return summary.trim().replaceAll(/\s+/gu, ' ')
}
```

Trim, collapse internal whitespace. Case-sensitive, no fuzzy matching (`changeset-comparator.ts:82-84`).

`calculateChangesetContentHash` uses the same helper rather than duplicating the logic inline — two copies ten lines apart would have drifted the first time either was touched.

## Why This Works

The deduplication mechanism exists for idempotency: Renovate force-pushes constantly and the action re-runs on the same PR. A re-run produces the same release set **and** the same generated summary, so an identical pending changeset still suppresses duplicate work.

A genuinely different summary no longer collides merely because it targets the same package at the same bump level.

The summary includes the generated multi-package footer:

```md
**Multi-package update** for package `renovate-changesets`.
```

So re-run idempotency now depends on the complete generated summary being **byte-deterministic, footer included**. If that footer's wording, punctuation, package interpolation, or ordering ever varies between runs, summary equality fails and duplicate suppression silently stops working.

## Prevention

- Compare release sets **and** normalized summaries for exact duplicate detection
- Keep normalization centralized in `normalizeSummary`; `calculateChangesetContentHash` must keep using it
- Preserve both contract scenarios in `test/contract/lockfile-maintenance.contract.test.ts` — the unrelated-pending case and the identical-pending case. The second one pins re-run idempotency and must never be weakened
- Treat the multi-package footer as part of the idempotency contract
- Do not claim existing-changeset analysis is PR-scoped. It is still a directory scan, and that remains an open design question — summary comparison reduces the blast radius, it does not fix scoping

## Related Issues

- [Release propagation walked the dependency graph backwards](./release-propagation-walked-dependency-graph-backwards-2026-08-19.md)
- [Test fixtures underspecified in the dimension the code ignores](../best-practices/test-fixtures-underspecified-in-ignored-dimension-2026-08-19.md)
- [Contract-first testing for actions that run in foreign repos](../best-practices/contract-testing-actions-that-run-in-foreign-repos-2026-08-19.md)
