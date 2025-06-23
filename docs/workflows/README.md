# Workflow Documentation

This directory contains comprehensive documentation for all reusable workflows provided by @bfra-me/.github repository.

## Available Workflows

1. [Repository Settings Update](./update-repo-settings.md)
   - Automates repository settings management using configuration files

2. [Dependency Review](./dependency-review.md)
   - Analyzes dependencies for security vulnerabilities

3. [OpenSSF Scorecard](./scorecard.md)
   - Evaluates repository security and maintenance status

4. [CodeQL Analysis](./codeql-analysis.md)
   - Performs security and code quality analysis

5. [Renovate Configuration](./renovate.md)
   - Manages dependency updates automatically

## Usage Guidelines

### Getting Started

1. Reference workflows using the following format:

   ```yaml
   jobs:
     job-name:
       uses: bfra-me/.github/.github/workflows/[workflow-name].yaml@[version-tag]
   ```

2. Ensure you have the necessary permissions and secrets configured
3. Check individual workflow documentation for specific requirements

### Best Practices

1. Always specify a version tag when referencing workflows
2. Review workflow logs for any configuration issues
3. Keep workflow configurations up to date
4. Test workflows in a development environment first

### Troubleshooting

For common issues and solutions, refer to the [Troubleshooting Guide](./troubleshooting.md).

## Contributing

To contribute to these workflows:

1. Review the [Contributing Guidelines](../CONTRIBUTING.md)
2. Test your changes thoroughly
3. Update relevant documentation
4. Submit a pull request

## Support

- Create an issue for bugs or feature requests
- Check existing issues for known problems
- Review the troubleshooting guide for common solutions
