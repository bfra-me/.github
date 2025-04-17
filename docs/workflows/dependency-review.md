# Dependency Review Workflow

This workflow scans dependency manifest files that change as part of Pull Requests, identifying known-vulnerable versions of packages declared or updated in the PR. When configured as required, it blocks merging of PRs that introduce known-vulnerable packages.

## Usage

```yaml
name: Dependency Review

on:
  pull_request:
    # You can optionally specify branches if needed
    # branches: [main]

jobs:
  dependency-review:
    name: Review Dependencies
    secrets: inherit
    uses: bfra-me/.github/.github/workflows/dependency-review.yaml@v2.3.5
```

## Configuration

### Parameters

| Parameter | Description | Required | Default |
|-----------|-------------|----------|---------|
| `secrets: inherit` | Inherits secrets from the caller workflow | Yes | - |

### Triggers

1. **Pull Request**: Runs on any pull request to the repository
   - Can be customized to specific branches if needed

## Permissions

The workflow requires the following permissions:
- `contents: read` - For reading repository contents

## Examples

### Basic Usage
```yaml
jobs:
  review-dependencies:
    uses: bfra-me/.github/.github/workflows/dependency-review.yaml@v2.3.5
```

### With Branch Specification
```yaml
on:
  pull_request:
    branches: [main, develop]
jobs:
  review-dependencies:
    uses: bfra-me/.github/.github/workflows/dependency-review.yaml@v2.3.5
```

## Supported Package Managers

The Dependency Review workflow supports manifest files from:
- npm (package.json, package-lock.json)
- Yarn (yarn.lock)
- pnpm (pnpm-lock.yaml)
- Python (requirements.txt, Pipfile.lock)
- Ruby (Gemfile.lock)
- Maven (pom.xml)
- Gradle (build.gradle)
- NuGet (packages.config, .csproj)
- Go (go.mod, go.sum)
- Rust (Cargo.lock)

## Capabilities

1. **Vulnerability Detection**
   - Identifies known security vulnerabilities in dependencies
   - Provides severity level for each vulnerability
   - Lists affected packages with version information

2. **License Compliance**
   - Detects license changes in dependencies
   - Identifies dependencies with potentially non-compliant licenses
   - Reports new license introductions

3. **Dependency Changes**
   - Shows added, removed, and updated dependencies
   - Highlights version changes
   - Provides context for PR reviewers

## Outputs

The workflow provides the following outputs:
- List of vulnerable dependencies detected
- Severity levels of vulnerabilities
- License compliance information
- Summary of dependency changes

## Customization

To customize the Dependency Review workflow, you can:

1. Configure denial of specific licenses:
   ```yaml
   - name: Dependency Review
     uses: actions/dependency-review-action@v4
     with:
       deny-licenses: GPL-3.0, LGPL-2.0
   ```

2. Set failure thresholds for vulnerability severity:
   ```yaml
   - name: Dependency Review
     uses: actions/dependency-review-action@v4
     with:
       fail-on-severity: moderate
   ```

3. Customize alerts format:
   ```yaml
   - name: Dependency Review
     uses: actions/dependency-review-action@v4
     with:
       comment-summary-in-pr: true
   ```

## Error Handling

Common errors and solutions:

1. **Missing Manifest Files**
   - Ensure package manifest files are committed to the repository
   - Verify that manifest files are in supported formats

2. **False Positives**
   - Update dependency allowlist configuration
   - Use versioning constraints to specify acceptable versions
   - Override specific vulnerability alerts when necessary

3. **Integration Issues**
   - Check GitHub API access
   - Verify action version compatibility
   - Review permission scope settings

## Best Practices

1. **Version Control**
   - Always use specific version tags
   - Test updates in development first
   - Review changes before deployment

2. **Configuration**
   - Set appropriate severity thresholds
   - Configure license policy
   - Document exceptions and overrides

3. **Monitoring**
   - Review scan results regularly
   - Set up notifications for detected vulnerabilities
   - Monitor false positive patterns

## Troubleshooting

### Common Issues

1. **Workflow Fails to Start**
   - Check permissions configuration
   - Verify workflow file syntax
   - Review GitHub Actions permission settings

2. **False Positives**
   - Review dependency allowlist configuration
   - Check for incorrect version detection
   - Update to latest action version

3. **Missing Dependencies**
   - Ensure all manifest files are correctly committed
   - Verify lock files are up to date
   - Check for exclusion patterns that might skip files

## Support

For additional support:
1. Check the [troubleshooting guide](./troubleshooting.md)
2. Review [existing issues](https://github.com/bfra-me/.github/issues)
3. Visit the [actions/dependency-review-action](https://github.com/actions/dependency-review-action) repository
4. Create a new issue with:
   - Workflow version
   - Manifest file examples
   - Error messages
   - Steps to reproduce
