# Renovate Changesets Workflow

Reusable workflow and org-wide template for automatically generating changeset files on Renovate dependency update PRs.

## Overview

The `renovate-changeset` reusable workflow wraps the [`renovate-changesets` action](../../.github/actions/renovate-changesets/README.md) with the standard bfra-me authentication and git setup. It runs on `pull_request_target` and `merge_group` events, or can be called from other workflows via `workflow_call`.

## Workflow Template

Use the org-wide workflow template to adopt this in any `@bfra-me` repository:

```yaml
name: Renovate Changesets

on:
  merge_group:
  pull_request_target:

permissions:
  contents: read

jobs:
  renovate-changesets:
    if: github.actor == 'renovate[bot]' || github.actor == 'bfra-me[bot]'
    name: Renovate Changesets
    secrets: inherit
    uses: bfra-me/.github/.github/workflows/renovate-changeset.yaml@v3
```

The template is available in the GitHub "New workflow" UI for all `@bfra-me` repositories.

### Prerequisites

The calling repository must have these secrets available (typically inherited from the org):

| Secret                    | Description                              |
| ------------------------- | ---------------------------------------- |
| `APPLICATION_ID`          | GitHub App ID for the `bfra-me[bot]` app |
| `APPLICATION_PRIVATE_KEY` | Private key for the `bfra-me[bot]` app   |

When using `secrets: inherit`, org-level secrets are passed automatically.

## Reusable Workflow Inputs

The reusable workflow (`renovate-changeset.yaml`) accepts secrets via `workflow_call`:

| Secret                    | Required | Description                                  |
| ------------------------- | -------- | -------------------------------------------- |
| `APPLICATION_ID`          | Yes      | GitHub App ID for generating tokens          |
| `APPLICATION_PRIVATE_KEY` | Yes      | GitHub App private key for generating tokens |

## What It Does

1. Generates a `bfra-me[bot]` App token for elevated permissions
2. Configures Git with the bot's identity
3. Checks out the PR branch with `fetch-depth: 2`
4. Runs the `renovate-changesets` action with `commit-back: true` to auto-commit generated changesets

## Actor Guard

The workflow only runs when the PR actor is `renovate[bot]` or `bfra-me[bot]`. This prevents unnecessary runs on human-authored PRs.

## Troubleshooting

### Workflow doesn't run on called repos

- Verify the calling workflow uses `secrets: inherit` (or explicitly passes `APPLICATION_ID` and `APPLICATION_PRIVATE_KEY`)
- Verify the actor check matches your Renovate bot name

### No changesets created

- Check that changed files match the action's configured patterns
- Review the action logs for detection details
- See the [action README](../../.github/actions/renovate-changesets/README.md) for action-specific configuration and troubleshooting

### Commit fails

- Ensure the App token has `contents: write` permission on the target repo
- Check for merge conflicts on the PR branch

## Related

- [Action documentation](../../.github/actions/renovate-changesets/README.md) — inputs, outputs, configuration, and ecosystem support
- [Renovate Configuration](./renovate.md)
