# Contributing to @bfra-me/.github

Welcome to the bfra.me organization's central configuration repository! This document provides guidelines for contributing to our organizational defaults, workflow templates, and automation systems.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Environment](#development-environment)
- [Contributing Workflow](#contributing-workflow)
- [Code Standards](#code-standards)
- [Testing Guidelines](#testing-guidelines)
- [Security Requirements](#security-requirements)
- [Documentation Standards](#documentation-standards)
- [Release Process](#release-process)

## Getting Started

This repository serves as the organizational hub for:

- Reusable GitHub Actions workflow templates
- Organization-wide repository settings and configurations
- Security policies and compliance workflows
- Custom internal actions for specialized workflows
- Automated release management with multi-package support

### Prerequisites

- **Node.js**: Version specified in `.node-version` file
- **pnpm**: Version 10.8.1 or later
- **Git**: For version control and conventional commits
- **GitHub CLI**: For development workflows (optional but recommended)

## Development Environment

### Initial Setup

1. **Clone and install dependencies**:

   ```bash
   git clone https://github.com/bfra-me/.github.git
   cd .github
   pnpm bootstrap
   ```

2. **Verify setup**:
   ```bash
   pnpm run quality-check
   ```

### Core Technologies

- **TypeScript 5.8.3** (strict mode, ESM modules)
- **pnpm 10.8.1** (workspaces)
- **ESLint 9.24.0** (@bfra.me/eslint-config)
- **Prettier 3.5.3** (@bfra.me/prettier-config)
- **Changesets 2.29.5** (versioning)
- **Husky 9.1.7** (pre-commit hooks)

### Development Commands

```bash
# Quality checks (run before commits)
pnpm run quality-check     # TypeScript + ESLint + build + test
pnpm run type-check        # TypeScript compilation check
pnpm run lint              # ESLint validation
pnpm run fix               # Auto-fix linting issues
pnpm run test              # Run test suite with Vitest

# Release management
pnpm run release           # Custom multi-package release script
```

## Contributing Workflow

### 1. Issue Creation

Before starting work:

- Check existing issues and discussions
- Create an issue describing the proposed changes
- For significant changes, discuss the approach in the issue

### 2. Branch Strategy

```bash
# Create feature branch from main
git checkout main
git pull origin main
git checkout -b feature/your-feature-name

# Or for fixes
git checkout -b fix/issue-description
```

### 3. Development Process

1. **Make changes** following our code standards
2. **Test thoroughly** using `pnpm run quality-check`
3. **Create changesets** for user-facing changes:

   ```bash
   # Create .changeset/feature-name.md manually (DO NOT use CLI)
   ```

4. **Commit using conventional commits**:
   ```bash
   git commit -m "feat: add new workflow template for security scanning"
   git commit -m "fix: resolve issue with renovate changeset creation"
   git commit -m "docs: update contributing guidelines"
   ```

### 4. Pull Request Process

1. **Push your branch** and create a pull request
2. **Fill out the PR template** completely
3. **Ensure all checks pass** (CI, security scanning, code review)
4. **Address review feedback** promptly
5. **Squash and merge** once approved

## Code Standards

### TypeScript Development

```typescript
// Use strict TypeScript configuration
interface Config {
  updateTypes: {
    [key: string]: {
      changesetType: 'patch' | 'minor' | 'major'
      filePatterns: string[]
      template?: string
    }
  }
  defaultChangesetType: 'patch' | 'minor' | 'major'
  excludePatterns?: string[]
}

// Always handle errors with core.setFailed for actions
try {
  // Action logic
} catch (error) {
  core.setFailed(error instanceof Error ? error.message : String(error))
}
```

### Workflow Template Standards

#### Required Structure

Each workflow template must include:

- **`*.yaml`**: The workflow template file with placeholder variables
- **`*.properties.json`**: Metadata describing the template
- **`*.svg`** (optional): Icon for GitHub's workflow template UI

#### Security Patterns

Always pin actions to commit SHAs:

```yaml
- uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0
```

Use minimal permissions:

```yaml
permissions:
  contents: read
  # Only add specific permissions as needed
```

Integrate security scanning:

```yaml
- uses: ossf/scorecard-action@05b42c624433fc40578a4040d5cf5e36ddca8cde # v2.4.2
```

#### Placeholder Variables

Use standardized variables:

- `$default-branch`: Repository's default branch
- `$protected-branches`: Branches requiring protection
- `$cron-weekly`: Weekly cron schedule

### Authentication Patterns

Use the `bfra-me[bot]` GitHub App pattern for automated workflows:

```yaml
- name: Generate Token
  uses: actions/create-github-app-token@v1
  with:
    app-id: ${{ secrets.BFRA_ME_BOT_APP_ID }}
    private-key: ${{ secrets.BFRA_ME_BOT_PRIVATE_KEY }}
```

## Testing Guidelines

### Required Testing

1. **Workflow Templates**: Test in a sandbox repository
2. **Custom Actions**: Unit tests with Vitest
3. **Release Scripts**: Test with dry-run mode
4. **Configuration Changes**: Validate with real repositories

### Test Commands

```bash
pnpm run test              # Run all tests
pnpm run test:coverage     # Run tests with coverage
pnpm run test:watch        # Run tests in watch mode
```

## Security Requirements

### Action Security

- **Pin all third-party actions** to specific commit SHAs
- **Use minimal required permissions** following principle of least privilege
- **Never hardcode secrets** in code or workflows
- **Implement security scanning** with OpenSSF Scorecard, CodeQL, dependency review

### Dependency Management

- **Renovate handles dependency updates** automatically
- **Security vulnerabilities** are prioritized over capacity limits
- **Auto-merge enabled** for patch/minor updates
- **Manual review required** for major updates

### Code Review Requirements

- All PRs require review from code owners
- Security-sensitive changes require additional review
- Automated security scanning must pass

## Documentation Standards

### Required Documentation

1. **README updates** for new features
2. **Workflow documentation** in `docs/workflows/`
3. **Architecture decisions** in `docs/adr/`
4. **API documentation** with JSDoc for TypeScript

### Documentation Format

- Use clear, concise language
- Include code examples where relevant
- Link to related documentation
- Update the `llms.txt` file for significant additions

## Release Process

### Changeset Creation

Create changesets manually for all user-facing changes:

```markdown
---
"@bfra.me/.github": patch|minor|major
---

Clear description of changes for users
```

### Version Guidelines

- **patch**: Bug fixes, documentation updates, dependency updates
- **minor**: New features, backward-compatible enhancements
- **major**: Breaking changes, API modifications

### Automated Release

The release process is automated:

1. Changesets are merged to main
2. Release workflow creates releases automatically
3. Multi-package tagging strategy is applied:
   - Private root packages: `v{version}` (e.g., `v4.1.0`)
   - Public packages: `{name}@{version}` (e.g., `@bfra.me/config@1.0.0`)

## Common Patterns & Anti-Patterns

### ✅ DO

- Pin all action versions to commit SHAs with version comments
- Use minimal required permissions following principle of least privilege
- Create changesets for all user-facing changes
- Use the `bfra-me[bot]` pattern for authentication
- Include comprehensive metadata in workflow templates
- Follow conventional commit patterns for automated processing

### ❌ DON'T

- Use floating action versions (avoid `@main`, `@v1`)
- Grant broad permissions without justification
- Skip changeset creation for dependency updates (automated via Renovate)
- Hardcode sensitive data (use secrets and GitHub App tokens)
- Create workflow templates without corresponding `.properties.json` files
- Use manual changeset CLI (creates inconsistent format)

## Getting Help

### Resources

- [Workflow Documentation](docs/workflows/README.md): Complete guide to available workflows
- [GitHub Copilot Instructions](.github/copilot-instructions.md): AI-optimized development guidance
- [Security Policy](SECURITY.md): Vulnerability reporting and security practices
- [License](LICENSE.md): MIT license terms and conditions

### Support Channels

- **GitHub Issues**: For bugs, feature requests, and questions
- **GitHub Discussions**: For general discussion and ideas
- **Security Issues**: Use [SECURITY.md](SECURITY.md) for vulnerability reports

### Project Context

- [Implementation Plans](.ai/plan/): Detailed implementation specifications for future features

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you are expected to uphold this code.

## License

By contributing to this repository, you agree that your contributions will be licensed under the [MIT License](LICENSE.md).

---

Thank you for contributing to the bfra.me organization's automation and development standards!
