# CodeQL Analysis Workflow

This workflow uses GitHub's CodeQL analysis tool to perform static code analysis, identifying potential security vulnerabilities and coding errors. It supports multiple languages and can be configured for various code scanning needs.

## Usage

```yaml
name: CodeQL

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday

jobs:
  analyze:
    name: CodeQL Analysis
    secrets: inherit
    uses: bfra-me/.github/.github/workflows/codeql-analysis.yaml@v2.3.5
```

## Configuration

### Required Parameters

| Parameter | Description | Required | Default |
|-----------|-------------|----------|---------|
| `secrets: inherit` | Inherits secrets from the caller workflow | Yes | - |

### Optional Parameters

No additional parameters are required for basic usage. Advanced configurations are defined in the workflow template variables.

### Triggers

1. **Pull Request**: Runs on pull requests to specified branches
2. **Push**: Runs on pushes to specified branches
3. **Schedule**: Runs on a defined schedule (default: weekly)

## Permissions

The workflow requires the following permissions:
- `security-events: write` - For uploading results to code-scanning dashboard
- `actions: read` - For private repositories
- `contents: read` - For accessing repository content
- `packages: read` - For fetching internal or private CodeQL packs

## Supported Languages

CodeQL Analysis supports scanning code written in:
- C/C++ (use `c-cpp`)
- C# (use `csharp`)
- Go (use `go`)
- Java/Kotlin (use `java-kotlin`)
- JavaScript/TypeScript (use `javascript-typescript`)
- Python (use `python`)
- Ruby (use `ruby`)
- Swift (use `swift`)

The workflow detects languages automatically based on the repository content.

## Examples

### Basic Usage
```yaml
jobs:
  run-codeql:
    uses: bfra-me/.github/.github/workflows/codeql-analysis.yaml@v2.3.5
```

### Custom Schedule
```yaml
on:
  schedule:
    - cron: '0 0 1 * *'  # Monthly on the 1st
jobs:
  run-codeql:
    uses: bfra-me/.github/.github/workflows/codeql-analysis.yaml@v2.3.5
```

### Specific Branches
```yaml
on:
  pull_request:
    branches: [main, release/*]
  push:
    branches: [main, release/*]
jobs:
  run-codeql:
    uses: bfra-me/.github/.github/workflows/codeql-analysis.yaml@v2.3.5
```

## Capabilities

1. **Security Vulnerability Detection**
   - Identifies common security vulnerabilities
   - Detects unsafe coding patterns
   - Finds potential injection points

2. **Code Quality Analysis**
   - Identifies code quality issues
   - Detects potential bugs and errors
   - Finds performance issues

3. **Language-Specific Analysis**
   - Customized analysis for each supported language
   - Language-specific vulnerability detection
   - Tailored code quality checks

## Build Modes

CodeQL supports different build modes depending on the language:

1. **Automatic Build**
   - Default for most languages
   - CodeQL automatically attempts to build the code
   - Works for many standard project configurations

2. **Manual Build**
   - For projects with custom build systems
   - Requires specifying build commands
   - Provides more control over the analysis process

3. **No Build**
   - For interpreted languages like JavaScript, Python
   - No build step required
   - Analysis runs directly on source code

## Outputs

The workflow provides the following outputs:
- Code scanning alerts in the GitHub Security tab
- SARIF format analysis results
- Detailed information about each identified issue
- Suggestions for fixing detected problems

## Advanced Configuration

1. **Custom Queries**
   ```yaml
   - name: Initialize CodeQL
     uses: github/codeql-action/init@v3
     with:
       languages: ${{ matrix.language }}
       queries: security-extended,security-and-quality
   ```

2. **Custom Build Commands**
   ```yaml
   - if: matrix.build-mode == 'manual'
     run: |
       make bootstrap
       make release
   ```

3. **Database Path Customization**
   ```yaml
   - name: Initialize CodeQL
     uses: github/codeql-action/init@v3
     with:
       languages: ${{ matrix.language }}
       db-location: /tmp/codeql-db
   ```

## Error Handling

Common errors and solutions:

1. **Build Failures**
   - Check if the correct build mode is selected
   - Verify build dependencies are installed
   - Consider switching to manual build mode

2. **Memory Issues**
   - Increase runner memory if available
   - Break analysis into smaller parts
   - Exclude large generated files

3. **Timeout Issues**
   - Optimize build process
   - Use caching for build artifacts
   - Consider breaking analysis into steps

## Best Practices

1. **Performance Optimization**
   - Use path filters to exclude irrelevant files
   - Cache build artifacts when possible
   - Schedule resource-intensive analysis outside peak hours

2. **Integration**
   - Set as a required check for pull requests
   - Review alerts regularly
   - Prioritize fixing high-severity issues

3. **Maintenance**
   - Keep CodeQL version updated
   - Review false positives and adjust configuration
   - Document custom configurations and exclusions

## Troubleshooting

### Common Issues

1. **Unable to Automatically Build**
   - Switch to manual build mode
   - Provide explicit build commands
   - Check for missing dependencies

2. **Analysis Taking Too Long**
   - Exclude large generated files
   - Use path filters to focus analysis
   - Split analysis across multiple runners

3. **False Positives**
   - Customize query suites
   - Add inline suppressions with comments
   - Create custom CodeQL queries

## Support

For additional support:
1. Check the [troubleshooting guide](./troubleshooting.md)
2. Review [existing issues](https://github.com/bfra-me/.github/issues)
3. Visit the [GitHub CodeQL documentation](https://docs.github.com/en/code-security/code-scanning/automatically-scanning-your-code-for-vulnerabilities-and-errors/about-code-scanning-with-codeql)
4. Create a new issue with:
   - Workflow version
   - Language and build system details
   - Error messages
   - Steps to reproduce
