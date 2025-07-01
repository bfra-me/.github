# Renovate Changesets Action

This GitHub Action automatically generates changeset files for Renovate dependency updates. It supports multiple dependency types including GitHub Actions, NPM packages, Docker images, and more.

## Features

- **Multi-platform support**: GitHub Actions, NPM, Docker, and custom dependency types
- **Configurable**: Use inline config or config files to customize behavior
- **Smart detection**: Automatically detects update types based on changed files
- **Flexible templates**: Custom changeset templates for different update types

## Usage

```yaml
- name: Create Renovate Changeset
  uses: ./.github/actions/renovate-changesets
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    config: |
      updateTypes:
        github-actions:
          changesetType: patch
          filePatterns:
            - '.github/workflows/**/*.yaml'
            - '.github/actions/**/action.yaml'
        npm:
          changesetType: patch
          filePatterns:
            - '**/package.json'
            - '**/pnpm-lock.yaml'
      defaultChangesetType: patch
```

## Inputs

| Input | Description | Required | Default |
| --- | --- | --- | --- |
| `config-file` | Path to configuration file | No | - |
| `config` | Inline configuration (JSON/YAML) | No | - |
| `dry-run` | Log planned changeset without writing any files | No | `false` |
| `comment-pr` | Post a comment on the PR with changeset details | No | `true` |
| `token` | GitHub token for API access | No | `${{ github.token }}` |
| `working-directory` | Working directory | No | `.` |

## Outputs

| Output               | Description                                                   |
| -------------------- | ------------------------------------------------------------- |
| `changesets-created` | Number of changesets created (0 in dry-run mode)              |
| `changeset-files`    | List of created changeset files (empty array in dry-run mode) |

The action will also post a comment on the pull request with details about the changeset when `comment-pr` is enabled. This comment includes:

- A summary of the changeset
- The list of releases that will be updated
- Whether this is a dry run or an actual changeset

## Configuration

The action can be configured using either a configuration file or inline configuration. The configuration supports:

### Update Types

Define different dependency types and how they should be handled:

```yaml
updateTypes:
  github-actions:
    changesetType: patch
    filePatterns:
      - '.github/workflows/**/*.yaml'
      - '.github/actions/**/action.yaml'
    template: 'Update GitHub Actions {dependencies}{version}'
  npm:
    changesetType: patch
    filePatterns:
      - '**/package.json'
      - '**/pnpm-lock.yaml'
  docker:
    changesetType: patch
    filePatterns:
      - '**/Dockerfile'
      - '**/docker-compose.yaml'
```

### Default Configuration

```yaml
updateTypes:
  github-actions:
    changesetType: patch
    filePatterns:
      - '.github/workflows/**/*.yaml'
      - '.github/workflows/**/*.yml'
      - '.github/actions/**/action.yaml'
      - '.github/actions/**/action.yml'
  npm:
    changesetType: patch
    filePatterns:
      - '**/package.json'
      - '**/package-lock.json'
      - '**/pnpm-lock.yaml'
      - '**/yarn.lock'
  docker:
    changesetType: patch
    filePatterns:
      - '**/Dockerfile'
      - '**/docker-compose.yaml'
      - '**/docker-compose.yml'
defaultChangesetType: patch
```

## Examples

### Basic Usage

```yaml
- name: Create Renovate Changeset
  uses: ./.github/actions/renovate-changesets
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
```

### With Custom Configuration

```yaml
- name: Create Renovate Changeset
  uses: ./.github/actions/renovate-changesets
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    config-file: .github/renovate-changesets.yaml
```

### With Inline Configuration

```yaml
- name: Create Renovate Changeset
  uses: ./.github/actions/renovate-changesets
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    config: |
      updateTypes:
        github-actions:
          changesetType: minor
          template: 'chore: update GitHub Actions dependencies'
        npm:
          changesetType: patch
          template: 'chore: update NPM dependencies'
      defaultChangesetType: patch
      excludePatterns:
        - '**/test/**'
```

### Using Dry Run Mode

```yaml
- name: Preview Renovate Changesets (Dry Run)
  uses: ./.github/actions/renovate-changesets
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    dry-run: true
```

### Without PR Comments

```yaml
- name: Create Renovate Changeset (No Comments)
  uses: ./.github/actions/renovate-changesets
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    comment-pr: false
```

## Development

To build the action:

```bash
cd .github/actions/renovate-changesets
pnpm install
pnpm build
```

To run tests:

```bash
pnpm test
```

To run linting:

```bash
pnpm lint
```

## License

MIT
