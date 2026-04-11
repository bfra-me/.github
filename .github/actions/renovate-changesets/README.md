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
| `comment-pr` | Post a comment on the PR with changeset details | No | `false` |
| `target-package` | Override the changeset release target for fallback updates (e.g. `github-actions` manager updates that don't touch any workspace member). Required for monorepos whose root `package.json` is private and not in the workspace patterns. Defaults to the first non-private workspace member. | No | - |
| `token` | GitHub token for API access | No | `${{ github.token }}` |
| `working-directory` | Working directory | No | `.` |

### `target-package` and private workspace roots

When Renovate opens a PR that touches files outside any workspace member (for example, a `github-actions` manager update modifying `.github/workflows/*.yaml`), the action falls back to a single workspace-level changeset. By default, the fallback resolution is:

1. The workspace root, if it is **not** marked `"private": true`.
2. Otherwise, the first non-private workspace member discovered.
3. Otherwise, the repository slug.

Set `target-package` to override this resolution explicitly. This is the recommended setting for monorepos with multiple publishable packages where "first non-private member" isn't deterministic enough, or where you want a specific package (e.g. a CLI) to absorb orchestration bumps:

```yaml
- uses: bfra-me/.github/.github/actions/renovate-changesets@v4
  with:
    target-package: "@my-scope/cli"
```

The same input is forwarded by the reusable `bfra-me/.github/.github/workflows/renovate-changeset.yaml` workflow, so consumers of the reusable workflow can pass it directly:

```yaml
jobs:
  renovate-changeset:
    uses: bfra-me/.github/.github/workflows/renovate-changeset.yaml@v4
    with:
      target-package: "@my-scope/cli"
    secrets: inherit
```

## Outputs

| Output               | Description                     |
| -------------------- | ------------------------------- |
| `changesets-created` | Number of changesets created    |
| `changeset-files`    | List of created changeset files |

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
      - ".github/workflows/**/*.yaml"
      - ".github/actions/**/action.yaml"
    template: "Update GitHub Actions {dependencies}{version}"
  npm:
    changesetType: patch
    filePatterns:
      - "**/package.json"
      - "**/pnpm-lock.yaml"
  docker:
    changesetType: patch
    filePatterns:
      - "**/Dockerfile"
      - "**/docker-compose.yaml"
```

### Default Configuration

```yaml
updateTypes:
  github-actions:
    changesetType: patch
    filePatterns:
      - ".github/workflows/**/*.yaml"
      - ".github/workflows/**/*.yml"
      - ".github/actions/**/action.yaml"
      - ".github/actions/**/action.yml"
  npm:
    changesetType: patch
    filePatterns:
      - "**/package.json"
      - "**/package-lock.json"
      - "**/pnpm-lock.yaml"
      - "**/yarn.lock"
  docker:
    changesetType: patch
    filePatterns:
      - "**/Dockerfile"
      - "**/docker-compose.yaml"
      - "**/docker-compose.yml"
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

### With PR Comments

```yaml
- name: Create Renovate Changeset (No Comments)
  uses: ./.github/actions/renovate-changesets
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    comment-pr: true
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
