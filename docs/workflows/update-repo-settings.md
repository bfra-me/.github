# Repository Settings Update Workflow

This workflow automates the management of repository settings using configuration files. It ensures consistent settings across all repositories in the organization.

## Usage

```yaml
name: Update Repo Settings

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight
  workflow_dispatch:

jobs:
  update-repo-settings:
    name: Update Repo Settings
    secrets: inherit
    uses: bfra-me/.github/.github/workflows/update-repo-settings.yaml@v2.3.5
```

## Configuration

### Required Files

1. `.github/settings.yml` - Contains repository settings configuration

   ```yaml
   repository:
     # Repository settings
     name: repo-name
     description: Repository description
     private: false
     has_issues: true
     has_projects: false
     has_wiki: false
     has_downloads: false
     default_branch: main
     allow_squash_merge: true
     allow_merge_commit: true
     allow_rebase_merge: true
     delete_branch_on_merge: true

   branches:
     - name: main
       protection:
         required_pull_request_reviews:
           required_approving_review_count: 1
         required_status_checks:
           strict: true
           contexts: []
         enforce_admins: false
         restrictions: null
   ```

### Parameters

| Parameter          | Description                               | Required | Default |
| ------------------ | ----------------------------------------- | -------- | ------- |
| `secrets: inherit` | Inherits secrets from the caller workflow | Yes      | -       |

### Triggers

1. **Push**: Runs on push to the default branch
2. **Schedule**: Runs on a defined schedule (default: daily)
3. **Manual**: Can be triggered manually via workflow_dispatch

## Permissions

The workflow requires the following permissions:

- `admin:org` - For managing organization settings
- `repo` - For managing repository settings

## Examples

### Basic Usage

```yaml
jobs:
  update-settings:
    uses: bfra-me/.github/.github/workflows/update-repo-settings.yaml@v2.3.5
```

### Custom Schedule

```yaml
on:
  schedule:
    - cron: '0 0 * * 1'  # Weekly on Mondays
jobs:
  update-settings:
    uses: bfra-me/.github/.github/workflows/update-repo-settings.yaml@v2.3.5
```

## Outputs

The workflow provides the following outputs:

- Status of each setting update
- Error messages for failed updates
- Summary of changes made

## Error Handling

Common errors and solutions:

1. **Permission Denied**

   - Ensure workflow has required permissions
   - Check organization access settings

2. **Invalid Configuration**

   - Validate settings.yml format
   - Check for required fields

3. **Network Issues**
   - Workflow will automatically retry
   - Check GitHub status for service issues

## Best Practices

1. **Version Control**

   - Always use specific version tags
   - Test updates in development first
   - Review changes before deployment

2. **Configuration**

   - Keep settings.yml up to date
   - Document custom configurations
   - Use organization templates

3. **Monitoring**
   - Review workflow logs regularly
   - Set up notifications for failures
   - Monitor setting changes

## Troubleshooting

### Common Issues

1. **Workflow Fails to Start**

   - Check branch protection rules
   - Verify workflow permissions
   - Validate YAML syntax

2. **Settings Not Applied**

   - Check settings.yml format
   - Verify permission scopes
   - Review error logs

3. **Unexpected Changes**
   - Compare settings.yml versions
   - Check workflow run history
   - Review branch protection rules

## Support

For additional support:

1. Check the [troubleshooting guide](./troubleshooting.md)
2. Review [existing issues](https://github.com/bfra-me/.github/issues)
3. Create a new issue with:
   - Workflow version
   - Configuration files
   - Error messages
   - Steps to reproduce
