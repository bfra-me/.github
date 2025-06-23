# Renovate Workflow

This workflow runs a self-hosted Renovate bot to automatically update dependencies in your repository. It creates and updates pull requests for dependency updates, ensuring your project stays current with the latest package versions and security patches.

## Usage

```yaml
name: Renovate

on:
  push:
    branches: ['**']
  schedule:
    - cron: '0 * * * *'  # Run every hour
  workflow_dispatch:
    inputs:
      log-level:
        type: string
        default: debug
      print-config:
        type: boolean
        default: false

jobs:
  renovate:
    name: Renovate
    secrets: inherit
    uses: bfra-me/.github/.github/workflows/renovate.yaml@v2.3.5
    with:
      log_level: debug
      print_config: false
```

## Configuration

### Required Parameters

| Parameter          | Description                               | Required | Default |
| ------------------ | ----------------------------------------- | -------- | ------- |
| `secrets: inherit` | Inherits secrets from the caller workflow | Yes      | -       |

### Optional Parameters

| Parameter      | Description                                       | Required | Default   |
| -------------- | ------------------------------------------------- | -------- | --------- |
| `log_level`    | Log level for Renovate (debug, info, warn, error) | No       | debug     |
| `print_config` | Print the resolved Renovate config                | No       | false     |
| `path_filters` | Files that trigger Renovate when changed          | No       | All files |

### Triggers

1. **Push**: Runs on any branch push
2. **Schedule**: Runs on a defined schedule (default: hourly)
3. **Workflow Dispatch**: Can be triggered manually with configurable inputs
4. **Issues/PRs Edited**: Runs when issues or pull requests are edited
5. **Repository Dispatch**: Responds to custom events
6. **Workflow Run**: Runs after successful CI workflow completion

## Permissions

The workflow requires the following permissions:

- `contents: read` - For reading repository content
- Additional permissions are needed for Renovate to create PRs (handled internally)

## Capabilities

1. **Dependency Management**
   - Automatically updates dependencies to latest versions
   - Creates pull requests for dependency updates
   - Groups related updates into single PRs

2. **Security Patching**
   - Prioritizes security vulnerability patches
   - Auto-merges non-breaking security updates
   - Provides detailed changelogs and release notes

3. **Customization**
   - Highly configurable update behavior
   - Supports custom update schedules
   - Can be configured per-dependency

4. **Integration**
   - Works with various package ecosystems
   - Integrates with CI/CD pipelines
   - Respects semantic versioning

## Supported Package Managers

Renovate supports numerous package ecosystems, including:

- npm/yarn/pnpm (JavaScript/TypeScript)
- pip/poetry/conda (Python)
- Composer (PHP)
- Maven/Gradle (Java)
- NuGet (.NET)
- Go modules
- Docker
- GitHub Actions
- Terraform
- Cargo (Rust)
- Many more

## Examples

### Basic Usage

```yaml
jobs:
  dependencies:
    uses: bfra-me/.github/.github/workflows/renovate.yaml@v2.3.5
```

### With Custom Parameters

```yaml
jobs:
  dependencies:
    uses: bfra-me/.github/.github/workflows/renovate.yaml@v2.3.5
    with:
      log_level: info
      print_config: true
      path_filters: >-
        [
          '.github/workflows/renovate.yaml',
          '.github/renovate.json5'
        ]
```

### Custom Schedule

```yaml
on:
  schedule:
    - cron: '0 0 * * 1'  # Weekly on Monday
jobs:
  dependencies:
    uses: bfra-me/.github/.github/workflows/renovate.yaml@v2.3.5
```

## Configuration File

Renovate is configured via a configuration file in your repository. Common locations include:

- `renovate.json`
- `.github/renovate.json`
- `.renovaterc.json`
- `renovate.json5`
- `.github/renovate.json5`

Example configuration file:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "config:base"
  ],
  "packageRules": [
    {
      "matchUpdateTypes": ["minor", "patch"],
      "matchCurrentVersion": "!/^0/",
      "automerge": true
    }
  ]
}
```

## Outputs

The workflow provides the following outputs:

- Pull requests for dependency updates
- Detailed logs of dependency checking
- Resolved configuration (if print_config is true)
- Dependency dashboards (when configured)

## Error Handling

Common errors and solutions:

1. **Authentication Issues**
   - Verify GitHub token permissions
   - Check token expiration
   - Ensure token has repository access

2. **Configuration Problems**
   - Validate Renovate configuration syntax
   - Check for conflicting configuration settings
   - Use schema validation for configuration files

3. **Rate Limiting**
   - Adjust schedule to reduce frequency
   - Use dependency dashboard to batch updates
   - Configure custom schedule for updates

## Best Practices

1. **Configuration Management**
   - Use preset configurations for common scenarios
   - Test configuration changes in a development branch
   - Document your configuration decisions

2. **Update Management**
   - Group related updates when possible
   - Schedule disruptive updates during low-activity periods
   - Set up auto-merge for patch and minor updates

3. **Integration**
   - Set up required CI checks for update PRs
   - Configure automatic rebasing
   - Use changelogs for making update decisions

## Troubleshooting

### Common Issues

1. **Missing Updates**
   - Check Renovate logs for skipped dependencies
   - Verify package manager compatibility
   - Check update schedule configuration

2. **Too Many PRs**
   - Configure grouping for related dependencies
   - Use dependency dashboard to manage updates
   - Adjust update schedule to batch changes

3. **Failed Updates**
   - Check CI logs for build failures
   - Review dependency compatibility issues
   - Verify version constraints in package files

## Support

For additional support:

1. Check the [troubleshooting guide](./troubleshooting.md)
2. Review [existing issues](https://github.com/bfra-me/.github/issues)
3. Visit the [Renovate documentation](https://docs.renovatebot.com/)
4. Check the [bfra-me/renovate-action repository](https://github.com/bfra-me/renovate-action)
5. Create a new issue with:
   - Workflow version
   - Renovate configuration
   - Error messages
   - Steps to reproduce
