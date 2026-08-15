---
title: Renovate silently stops updating SHA-pinned actions when a repo publishes two tag families
module: .github/renovate.json5
date: 2026-08-15
problem_type: integration_issue
component: development_workflow
severity: high
symptoms:
  - Pinned action version comment stays frozen across multiple upstream releases
  - No Renovate PR, no warning, and no Dependency Dashboard entry for the pin
  - Renovate still updates other dependencies in the same workflow file
root_cause: config_error
resolution_type: config_change
related_components:
  - tooling
  - documentation
tags:
  - renovate
  - github-actions
  - sha-pin
  - monorepo-tags
  - extract-version
  - custom-manager
---

`bfra-me/.github` tags every release commit twice: `v{ver}` for the repository and `{action}@{ver}` for each released action. Renovate's built-in `github-actions` manager enumerates only the `v{ver}` family, so a consumer that SHA-pins an action and comments the action version gets no updates at all — and no indication that anything is wrong.

`marcusrbrown/infra` sat on `renovate-changesets@0.2.31` for four months. `0.2.32` shipped 2026-04-15 and was never picked up.

## Symptoms

The defining symptom is absence. Nothing fails, nothing warns, and the pin simply stops moving:

- no Renovate PR for the pinned action
- no Dependency Dashboard entry
- no error in the Renovate log

The sharpest diagnostic is a contrast within the same file. Renovate opened PRs against `.github/workflows/renovate-changesets.yaml` in July (#758, #895) to bump `actions/checkout`, while never touching the `renovate-changesets` pin two lines away. Renovate was parsing the file correctly — it just had no resolvable version for that one dependency.

Confirm it by comparing the pin against upstream tags:

```bash
# what the consumer is pinned to
grep -r 'actions/renovate-changesets@' .github/workflows/

# what upstream has actually released
gh api repos/bfra-me/.github/git/matching-refs/tags/renovate-changesets@ --jq '.[].ref'

# both tag families land on the same commit
gh api repos/bfra-me/.github/git/matching-refs/tags/v4.16.47 --jq '.[].object.sha'
gh api repos/bfra-me/.github/git/matching-refs/tags/renovate-changesets@0.2.33 --jq '.[].object.sha'
```

## What Didn't Work

**Bumping the SHA by hand.** Fixes today and rots again on the next release. This is what had been happening.

**Re-pointing the pin at the repo tag.** Both tags resolve to the same commit, so pinning the action and commenting `# v4.16.47` makes the built-in manager track it immediately. It works, and it is wrong: it labels an action pin with an unrelated repository version, and it drags in churn from every org release that does not touch the action. Tried and reverted.

**The existing digest-disable rule.** `marcusrbrown/infra` already carried a rule from #157 disabling digest updates for `bfra-me/.github`. That rule suppresses bare-SHA churn, which is a different problem — it never addressed version resolution, and being scoped to `matchManagers: ['github-actions']` it does not affect a custom manager either way.

## Solution

Two forms work. Prefer the first.

### Preferred: scope `extractVersion` to the pinning file

This is the pattern `bfra-me/.github` used on its own self-pins in #1717, later moved into the publishable `internal.json5` preset by #1983:

```json5
{
  description: 'Track released versions of renovate-changesets action via release tags.',
  matchDepNames: ['bfra-me/.github'],
  matchFileNames: ['.github/workflows/renovate-changeset.yaml'],
  extractVersion: '^renovate-changesets@(?<version>.+)$',
  pinDigests: false,
  commitMessageTopic: 'renovate-changesets action',
}
```

`matchFileNames` is load-bearing. A consumer typically references `bfra-me/.github` from several files — reusable workflows pinned with `# v4.16.x` alongside the action pinned with `# renovate-changesets@x.y.z`. Applying `extractVersion` by dep name alone would impose the action's tag family on the reusable-workflow pins and break them. Scoping by file keeps each reference on its own tag family.

### Alternative: a regex `customManager`

Used in `marcusrbrown/infra` #1102. More verbose, but it rewrites the SHA and the version comment as one unit and does not depend on how the built-in manager assigns dep names:

```json5
{
  customType: 'regex',
  managerFilePatterns: ['/^\\.github/workflows/renovate-changesets\\.yaml$/'],
  matchStrings: [
    'uses:\\s*bfra-me/\\.github/\\.github/actions/renovate-changesets@(?<currentDigest>[a-f0-9]{40})\\s*#\\s*renovate-changesets@(?<currentValue>\\d+\\.\\d+\\.\\d+)',
  ],
  depNameTemplate: 'bfra-me/.github',
  datasourceTemplate: 'github-tags',
  extractVersionTemplate: '^renovate-changesets@(?<version>.+)$',
  versioningTemplate: 'semver',
}
```

Notes that cost time to establish:

- `managerFilePatterns` replaced `fileMatch` in Renovate 40.2.0. Bare strings are treated as globs, so a path regex must be wrapped in `/.../` delimiters.
- Capturing `currentDigest` and `currentValue` in a single match is what keeps the SHA and its comment in sync; capturing only the digest produces exactly the bare-SHA churn that #157 disabled.
- `extractVersionTemplate` reshapes candidate tags rather than filtering the datasource. `v4.16.47` fails the pattern and is therefore not a version candidate.

## Why This Works

Renovate resolves `bfra-me/.github/.github/actions/renovate-changesets` through the `github-tags` datasource against the repository `bfra-me/.github`. That returns every tag, dominated by the `v4.16.x` family. Nothing in that list parses as `0.2.31`, so there is no upgrade path and Renovate correctly concludes there is nothing to do — which is indistinguishable, from the outside, from being up to date.

`extractVersion` (or `extractVersionTemplate`) reshapes each candidate tag before comparison. Restricting to `^renovate-changesets@(?<version>.+)$` yields a list of `0.2.x` versions that the pinned `0.2.31` can actually be compared against.

## Prevention

**Prefer the reusable workflow over pinning the action.** `bfra-me/.github` reusable workflows resolve action code by self-checkout at `GITHUB_WORKFLOW_REF`, so there is no SHA pin to go stale. Consumers calling the reusable workflow are structurally immune to this failure.

**Assume per-package tags need explicit configuration.** Any monorepo publishing `{package}@{ver}` tags alongside repo-level tags will exhibit this. The built-in manager does not warn that it has no resolvable version — it just goes quiet.

**Audit pins periodically, because silence is not evidence of currency.** A pin that has not moved in months while upstream keeps releasing is the signal:

```bash
gh api repos/OWNER/REPO/git/matching-refs/tags/ACTION@ --jq '.[].ref' | tail -3
```

**Keep the configuration alive when the internal use case disappears.** The rules in `internal.json5` are now dead in their home repository: they target `.github/workflows/renovate-changeset.yaml`, which no longer pins the action since it moved to self-checkout. The pattern was correct, the internal need for it went away, and no signal remained for external consumers who still pin directly.

## Related Issues

- [`docs/solutions/process/renovate-changesets-fix-workflow.md`](../process/renovate-changesets-fix-workflow.md) — the release and re-pin chain for this action. Its statement that "Renovate updates the action SHA reference" holds only when the consumer's Renovate can resolve the action tag family; this document is the failure mode when it cannot.
- [`docs/solutions/integration-issues/shallow-checkout-breaks-paths-filter-on-push-events-2026-06-25.md`](./shallow-checkout-breaks-paths-filter-on-push-events-2026-06-25.md) — another workflow-level failure that surfaced as silently wrong behavior rather than an error.
- `bfra-me/.github` #1717 established the `extractVersion` pattern; #1983 moved it into `internal.json5`; `marcusrbrown/infra` #1102 applied the custom-manager variant.
