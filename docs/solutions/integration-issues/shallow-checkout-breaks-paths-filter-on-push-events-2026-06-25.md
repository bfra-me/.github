---
title: Shallow checkout breaks paths-filter on push events
module: .github/workflows/update-repo-settings.yaml
date: 2026-06-25
problem_type: integration_issue
component: development_workflow
severity: medium
category: docs/solutions/integration-issues/
symptoms:
  - "Filter Changed Files intermittently failed on push events with git exit code 128"
  - "paths-filter could not diff github.event.before against github.sha"
  - "Failure only reproduced on some push shapes (fast-forward, force-push, rebase, squash)"
root_cause: incomplete_setup
resolution_type: config_change
related_components:
  - tooling
tags:
  - github-actions
  - actions-checkout
  - paths-filter
  - shallow-clone
  - push-event
---

## Problem

The `update-repo-settings` reusable workflow intermittently failed on push events, causing caller repos to see unrelated red CI for repository-settings updates. The failure was specific to the push path and came from the changed-files gate, not from the settings logic itself.

## Symptoms

- `Filter Changed Files` fails with `git failed with exit code 128`
- Only on `push` events (both steps gate on `if: github.event_name == 'push'`)
- Intermittent — depends on the shape of the push/history
- No useful action-level error beyond the git exit

## What Didn't Work

Pinning `dorny/paths-filter` (or the workflow) back to `v4.16.17`, `v4.16.18`, or `v4.16.19` didn't help; those releases had identical behavior here. This wasn't a regression in a specific release — it was the combination of a shallow checkout and a push-diff that sometimes needed parent history the runner didn't have.

## Solution

Make the push-event checkout fetch full history before running `paths-filter`. Pins are shown as `@<sha>` placeholders; see [`.github/workflows/update-repo-settings.yaml`](/.github/workflows/update-repo-settings.yaml) for the current pinned versions.

```yaml
- if: github.event_name == 'push'
  name: Checkout Repository
  uses: actions/checkout@<sha> # pinned to a commit SHA
  with:
    # Full history so dorny/paths-filter can diff against the parent
    # commit on push events.
    fetch-depth: 0

- id: filter
  if: github.event_name == 'push'
  name: Filter Changed Files
  uses: dorny/paths-filter@<sha> # pinned to a commit SHA
  with:
    filters: |
      changes:
        - 'common-settings.yaml'
        - '.github/settings.yml'
        - '.github/workflows/update-repo-settings.yaml'
```

`fetch-depth: 2` would cover simple merge commits, but `fetch-depth: 0` is the robust fix for rebases, force-pushes, and squashes.

## Why This Works

`paths-filter` on push events diffs `github.event.before` against `github.sha`, which means the parent commit must be reachable in the checkout. A shallow clone at depth 1 sometimes omits that history, so git can't resolve the diff and exits 128. Full history guarantees the required commit graph is present.

## Prevention

- Any reusable or standalone workflow that runs `paths-filter` on `push` after `actions/checkout` must set `fetch-depth: 0` (or at least `>= 2`).
- The fix here landed in the reusable workflow under `@bfra.me/.github` (a `patch` changeset), so caller repos pick it up on their next pin bump.

## Related Issues

- [#2213](https://github.com/bfra-me/.github/issues/2213) — original bug report (closed by the fix)
- [`docs/workflows/update-repo-settings.md`](/docs/workflows/update-repo-settings.md) — workflow reference for the same reusable workflow
- [`.github/instructions/github-actions.instructions.md`](/.github/instructions/github-actions.instructions.md) — general GitHub Actions guidance
- [`docs/solutions/process/renovate-changesets-fix-workflow.md`](/docs/solutions/process/renovate-changesets-fix-workflow.md) — adjacent workflow-troubleshooting process doc
