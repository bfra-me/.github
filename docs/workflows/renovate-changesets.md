# Renovate Changesets Action

This document describes the enhanced Renovate Changesets action that automatically generates changeset files for Renovate dependency updates.

## Overview

The `renovate-changesets` action intelligently parses Renovate changes from PR contexts and generates appropriate changeset files. It supports multiple dependency ecosystems including:

- **GitHub Actions** - Workflow and action updates
- **NPM/pnpm** - JavaScript/TypeScript dependencies
- **Docker** - Container image updates
- **Python** - pip dependencies
- **Go** - Go modules
- **JVM** - Maven/Gradle dependencies

## Features

- **Smart Detection**: Automatically detects update types from changed files
- **Semver Assessment**: Determines appropriate bump type (patch/minor/major)
- **Security Awareness**: Flags security-related updates
- **Multi-package Support**: Handles monorepo updates correctly
- **Grouped Updates**: Supports Renovate's grouped/batch PRs
- **Auto-commit**: Optionally commits changesets back to Renovate branches
- **PR Management**: Can update PR descriptions and post comments

## Usage

### Basic Usage

```yaml
- name: Generate Renovate changesets
  uses: bfra-me/.github/.github/actions/renovate-changesets@v1
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
```

### With Auto-commit

```yaml
- name: Generate Renovate changesets
  uses: bfra-me/.github/.github/actions/renovate-changesets@v1
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    commit-back: "true"
    max-retries: "3"
```

### Full Configuration

```yaml
- name: Generate Renovate changesets
  uses: bfra-me/.github/.github/actions/renovate-changesets@v1
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    commit-back: "true"
    comment-pr: "true"
    update-pr-description: "true"
    default-changeset-type: patch
    max-retries: "3"
```

## Inputs

| Input | Description | Required | Default |
| --- | --- | --- | --- |
| `token` | GitHub token for API access | No | `${{ github.token }}` |
| `branch-prefix` | Renovate branch prefix | No | `renovate/` |
| `commit-back` | Auto-commit changesets to branch | No | `false` |
| `comment-pr` | Post comment with changeset details | No | `false` |
| `update-pr-description` | Update PR description | No | `false` |
| `default-changeset-type` | Default semver bump type | No | `patch` |
| `config-file` | Path to configuration file | No | - |
| `config` | Inline configuration (YAML/JSON) | No | - |
| `max-retries` | Max retry attempts for git ops | No | `3` |
| `working-directory` | Working directory | No | `.` |

## Outputs

| Output               | Description                            |
| -------------------- | -------------------------------------- |
| `changesets-created` | Number of changesets created           |
| `changeset-files`    | List of created changeset files (JSON) |
| `update-type`        | Detected update type                   |
| `dependencies`       | List of detected dependencies (JSON)   |
| `commit-success`     | Whether commit succeeded               |
| `commit-sha`         | SHA of the commit (if committed)       |

## Configuration

### Inline Configuration

```yaml
- name: Generate Renovate changesets
  uses: bfra-me/.github/.github/actions/renovate-changesets@v1
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    config: |
      updateTypes:
        github-actions:
          changesetType: patch
          filePatterns:
            - '.github/workflows/**/*.yaml'
        npm:
          changesetType: patch
          filePatterns:
            - '**/package.json'
      defaultChangesetType: patch
```

### Configuration File

Create `.github/renovate-changesets.yaml`:

```yaml
updateTypes:
  github-actions:
    changesetType: patch
    filePatterns:
      - ".github/workflows/**/*.yaml"
      - ".github/actions/**/action.yaml"
  npm:
    changesetType: patch
    filePatterns:
      - "**/package.json"
      - "**/pnpm-lock.yaml"
defaultChangesetType: patch
```

## Migration from @scaleway/changesets-renovate

This action is a drop-in replacement for `@scaleway/changesets-renovate`:

### Before

```yaml
- name: Generate Renovate changesets
  run: pnpx @scaleway/changesets-renovate
```

### After

```yaml
- name: Generate Renovate changesets
  uses: bfra-me/.github/.github/actions/renovate-changesets@v1
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    commit-back: "true"
```

## Troubleshooting

### No changesets created

- Verify the PR is from Renovate (actor must be `renovate[bot]` or your bot)
- Check that changed files match configured patterns
- Review action logs for detection details

### Commit fails

- Ensure `token` has `contents: write` permission
- Check for merge conflicts (action auto-resolves when possible)
- Verify branch is not protected

### Rate limiting

- The action handles GitHub API rate limits automatically
- Use `max-retries` to increase retry attempts

## Best Practices

1. **Use `commit-back: true`** for automatic changeset commits
2. **Enable `comment-pr: true`** after initial validation
3. **Pin action to SHA** for security (not floating tags)
4. **Use GitHub App tokens** for better rate limits and permissions

## Related

- [Renovate Configuration](./renovate.md)
- [Implementation Plan](/.ai/plan/feature-enhanced-renovate-changesets-action-1.md)
