# OpenSSF Scorecard Workflow

This workflow uses the [OpenSSF Scorecard](https://securityscorecards.dev/) tool to analyze your repository's security health by checking adoption of security best practices. It provides an overall security score and detailed feedback on specific security controls.

## Usage

```yaml
name: Scorecard supply-chain security

on:
  # For Branch-Protection check
  branch_protection_rule:
  # On default branch pushes
  push:
    branches: [main]
  # Regular scheduled runs
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday

jobs:
  scorecard:
    name: Scorecard Analysis
    secrets: inherit
    uses: bfra-me/.github/.github/workflows/scorecard.yaml@v2.3.5
```

## Configuration

### Required Secrets

| Secret | Description | Required | Default |
| --- | --- | --- | --- |
| `SCORECARD_TOKEN` | GitHub PAT token for Branch-Protection check | For private repos or public branch protection | - |

### Parameters

| Parameter          | Description                               | Required | Default |
| ------------------ | ----------------------------------------- | -------- | ------- |
| `secrets: inherit` | Inherits secrets from the caller workflow | Yes      | -       |

### Triggers

1. **Branch Protection Rule**: Runs when branch protection rules are changed
2. **Push**: Runs on pushes to the default branch
3. **Schedule**: Runs on a defined schedule (default: weekly)

## Permissions

The workflow requires the following permissions:

- `security-events: write` - For uploading results to code-scanning dashboard
- `id-token: write` - For publishing results and generating a badge
- All other permissions are read-only by default

## Checks Performed

The Scorecard action performs various security checks including:

1. **Branch Protection**
   - Verifies branch protection rules on default branch
   - Checks required reviews, status checks, etc.

2. **Dependency Management**
   - Checks for dependency update tools (Dependabot, Renovate)
   - Verifies dependency manifest files

3. **Code Review**
   - Analyzes pull request review practices
   - Checks for required reviews on PRs

4. **Security Policy**
   - Verifies presence of SECURITY.md file
   - Checks for responsible disclosure policy

5. **CI/CD**
   - Evaluates CI/CD configuration
   - Checks for pinned dependencies in workflows

6. **Dangerous Workflows**
   - Identifies potentially dangerous workflow patterns
   - Checks for script injection risks

7. **Token Permissions**
   - Analyzes token permission practices
   - Checks for adherence to principle of least privilege

8. **Vulnerabilities**
   - Checks for unpatched vulnerabilities
   - Evaluates vulnerability management practices

9. **Binary Artifacts**
   - Identifies binary artifacts in the repository
   - Flags potential risks from binaries

10. **Maintained**
    - Checks repository maintenance activity
    - Evaluates update frequency and responsiveness

## Examples

### Basic Usage

```yaml
jobs:
  scan:
    uses: bfra-me/.github/.github/workflows/scorecard.yaml@v2.3.5
```

### With Custom Token

```yaml
jobs:
  scan:
    uses: bfra-me/.github/.github/workflows/scorecard.yaml@v2.3.5
    secrets:
      SCORECARD_TOKEN: ${{ secrets.MY_CUSTOM_TOKEN }}
```

### Custom Schedule

```yaml
on:
  schedule:
    - cron: '0 0 1 * *'  # Monthly on the 1st
jobs:
  scan:
    uses: bfra-me/.github/.github/workflows/scorecard.yaml@v2.3.5
```

## Outputs

The workflow provides the following outputs:

- SARIF results file uploaded as an artifact
- Results uploaded to GitHub code scanning dashboard
- Badge URL for public repositories
- Detailed score breakdown by category

## Understanding Results

Scorecard results include:

1. **Overall Score**
   - Numeric score from 0-10
   - Higher is better

2. **Check Scores**
   - Individual scores for each check
   - Detailed reason for each score
   - Improvement recommendations

3. **Risk Assessment**
   - Identification of high-risk areas
   - Prioritized improvement suggestions
   - Comparative community benchmarks

## Badge Integration

For public repositories, you can add a Scorecard badge to your README:

```markdown
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/{owner}/{repo}/badge)](https://securityscorecards.dev/viewer/?uri=github.com/{owner}/{repo})
```

Replace `{owner}` and `{repo}` with your repository information.

## Error Handling

Common errors and solutions:

1. **Authentication Issues**
   - Ensure SCORECARD_TOKEN has correct permissions
   - Check token expiration
   - Verify token access to repository

2. **Branch Protection Check Failures**
   - Check branch protection configuration
   - Verify admin access for token
   - Review protection settings

3. **Rate Limiting**
   - Adjust cron schedule to less frequent runs
   - Check GitHub API rate limits
   - Review API quota usage

## Best Practices

1. **Token Management**
   - Use dedicated token for Scorecard
   - Limit token permissions to minimum required
   - Rotate token regularly

2. **Result Analysis**
   - Review score changes over time
   - Prioritize fixing high-risk areas
   - Document exceptions with justifications

3. **Integration**
   - Add badge to README
   - Set up notifications for score changes
   - Include in security review process

## Troubleshooting

### Common Issues

1. **Workflow Fails to Start**
   - Check permissions configuration
   - Verify secrets are available
   - Review workflow file syntax

2. **Low Scores**
   - Review check-specific documentation
   - Implement recommended fixes
   - Rerun after changes

3. **No Results Published**
   - Check if repository is private (results not published for private repos)
   - Verify token permissions
   - Review publish_results setting

## Support

For additional support:

1. Check the [troubleshooting guide](./troubleshooting.md)
2. Review [existing issues](https://github.com/bfra-me/.github/issues)
3. Visit the [OpenSSF Scorecard documentation](https://github.com/ossf/scorecard)
4. Create a new issue with:
   - Workflow version
   - Repository visibility (public/private)
   - Error messages
   - Steps to reproduce
