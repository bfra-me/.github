# GitHub Copilot Instructions for bfra.me/.github

## Repository Overview

This repository serves as the organizational defaults and templates for the @bfra.me GitHub organization. It provides:

- Reusable GitHub Actions workflow templates with automated Renovate-Changeset integration
- Organization-wide repository settings and configurations via Repository Settings App
- Security policies and compliance workflows (OpenSSF Scorecard, CodeQL, dependency review)
- Development tools and shared configurations for TypeScript/pnpm monorepos
- Documentation templates and standards with AI-optimized cursor rules system

### Key Architecture Patterns

- **Automated Release System**: Custom `scripts/release.ts` handles multi-package tagging and GitHub releases
- **Renovate-Changeset Integration**: Automatic changeset creation for dependency updates via `renovate-changeset.yaml`
- **GitHub App Authentication**: Uses `bfra-me[bot]` with scoped tokens for automated workflows
- **Template Inheritance**: Workflow templates in `workflow-templates/` provide organization-wide defaults

## Development Environment

### Core Technologies

- **TypeScript 5.8.3** with strict mode enabled and ESM modules
- **pnpm** as the package manager with workspaces support
- **ESLint** with @bfra.me/eslint-config for consistent code quality
- **Prettier** with @bfra.me/prettier-config for code formatting
- **Changesets** for semantic versioning and changelog generation
- **Husky** with lint-staged for pre-commit hooks

### Project Structure

```
.github/
├── workflows/           # Reusable workflow templates
│   ├── renovate.yaml           # Self-hosted Renovate bot
│   ├── renovate-changeset.yaml # Auto-creates changesets for deps
│   ├── auto-release.yaml       # Automated releases via changesets
│   └── update-repo-settings.yaml # Repository settings management
├── actions/            # Custom composite actions
└── instructions/       # Individual instruction files

docs/                   # Comprehensive documentation
├── workflows/         # Workflow-specific documentation
└── architecture.md    # System architecture

workflow-templates/     # GitHub workflow templates for other repos
scripts/               # Utility scripts (release.ts for automated releases)
metadata/              # Project metadata and configurations
.cursor/rules/         # AI-optimized development guidelines
```

### Critical Workflows Integration

- **Renovate → Changesets**: Dependency updates automatically generate appropriate changesets
- **Changesets → Releases**: Manual changeset creation triggers automated version bumps and releases
- **Repository Settings**: Declarative configuration via `common-settings.yaml` applied by workflows

## TypeScript Development Standards

### Configuration and Setup

```json
{
  "compilerOptions": {
    "strict": true,
    "module": "esnext",
    "target": "esnext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "type": "module",
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### Best Practices

- **Always use strict mode**: Enable `strict: true` in tsconfig.json
- **Avoid `any` type**: Use `unknown`, union types, or specific interfaces instead
- **Leverage type inference**: Let TypeScript infer simple types, annotate complex ones
- **Use ES modules**: Import/export with ES6 syntax for better tree-shaking
- **Document with JSDoc**: Add comprehensive JSDoc comments for public APIs
- **Prefer interfaces over types**: Use interfaces for object shapes, types for unions

### Code Organization

- Organize code into logical modules with clear separation of concerns
- Use barrel exports (`index.ts`) to create clean public APIs
- Follow consistent naming conventions: `PascalCase` for classes/interfaces, `camelCase` for functions/variables
- Group related functionality into cohesive modules

## Package Management with pnpm

### Installation and Dependencies

```bash
# Install dependencies
pnpm install

# Add new dependency
pnpm add <package>

# Add dev dependency
pnpm add -D <package>

# Remove dependency
pnpm remove <package>

# Update dependencies
pnpm update
```

### Workspace Management

- Use `pnpm-workspace.yaml` for monorepo configuration
- Keep `pnpm-lock.yaml` under version control
- Use `pnpm dedupe` to optimize dependency trees
- Leverage `.pnpmfile.cjs` for dependency patching when needed

### Security and Performance

- Regularly audit dependencies with `pnpm audit`
- Pin Docker digests and GitHub Action versions for security
- Use `pnpm install --frozen-lockfile` in CI environments
- Optimize bundle sizes through proper dependency management

## GitHub Actions Workflow Standards

### Workflow Structure

```yaml
name: Descriptive Workflow Name

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read
  # Minimal required permissions only

jobs:
  job-name:
    name: Clear Job Description
    runs-on: ubuntu-latest
    steps:
      - name: Descriptive step name
        uses: actions/checkout@v4
```

### Best Practices

- **Use descriptive names**: Clear, concise names for workflows, jobs, and steps
- **Pin action versions**: Use specific commit SHAs for third-party actions
- **Minimal permissions**: Follow principle of least privilege
- **Cache dependencies**: Use `actions/cache` for faster builds
- **Parallel execution**: Run independent jobs concurrently
- **Secure secrets**: Store sensitive data in GitHub Secrets, never in code

### CI/CD Guidelines

- Run fast tests first to fail fast
- Implement comprehensive test coverage before enabling auto-merge
- Use matrix strategies for multi-environment testing
- Automate security scanning with CodeQL and dependency review
- Implement smoke tests for deployment validation

### Workflow Templates

When creating reusable workflows:

- Include comprehensive parameter documentation
- Provide sensible defaults for optional inputs
- Implement proper error handling and cleanup
- Follow semantic versioning for workflow releases

## Dependency Management with Renovate

### Configuration Strategy

```json
{
  "extends": [
    "config:best-practices",
    ":timezone(America/Los_Angeles)",
    ":semanticCommits",
    "group:monorepos",
    "schedule:weekly"
  ],
  "automerge": true,
  "major": {
    "automerge": false
  },
  "labels": ["dependencies"],
  "reviewers": ["team-member"]
}
```

### Update Management

- **Frequent updates**: Keep dependencies current with small, manageable updates
- **Auto-merge strategy**: Enable for patch/minor updates, manual review for major
- **Security priority**: Prioritize vulnerability fixes over capacity limits
- **Group related updates**: Reduce noise by grouping similar dependency updates
- **Review process**: Establish clear review responsibilities and timelines

### Best Practices

- Read changelogs for major updates to understand breaking changes
- Maintain comprehensive test coverage before enabling auto-merge
- Use semantic commit conventions for clear update tracking
- Configure appropriate update schedules to avoid overwhelming reviewers

## Versioning with Changesets

### Changeset Creation

Create changesets manually for all user-facing changes:

```bash
# DO NOT use CLI - create manually
# Create .changeset/feature-name.md
```

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

### When to Create Changesets

**CREATE for:**

- New features or functionality
- Bug fixes affecting external behavior
- Performance improvements
- Breaking changes
- User-facing documentation updates
- Significant dependency updates
- Build/tooling changes affecting consumers

**SKIP for:**

- Internal documentation updates (`.cursor/rules/`)
- Code comments and minor cleanup
- Test refactoring without functional changes
- Local configuration changes

**AUTOMATED via Renovate:**

- Dependency updates are handled by `renovate-changeset.yaml`
- Creates appropriate changesets based on semver impact
- No manual intervention needed for routine dependency updates

### Changeset Content Standards

- Write clear, user-focused descriptions
- Use imperative mood ("Add feature", "Fix bug")
- Document migration steps for breaking changes
- Include configuration changes when relevant
- Reference related PRs for complex changes

## Security and Compliance

### Security Workflows

- **OpenSSF Scorecard**: Automated security posture assessment
- **CodeQL**: Static application security testing
- **Dependency Review**: Vulnerability scanning for dependencies
- **Branch Protection**: Enforce review requirements and status checks

### Best Practices

- Store all secrets in GitHub Secrets, never in code
- Use minimal required permissions for workflows
- Pin action versions to specific commits for security
- Implement vulnerability scanning in CI pipeline
- Regular security audits and dependency updates

### Access Control

- Enable branch protection on main branch
- Require signed commits for sensitive repositories
- Implement least-privilege access patterns
- Monitor for suspicious activity in Actions logs

## Code Quality Standards

### Linting and Formatting

```bash
# Quality checks
pnpm run lint          # ESLint validation
pnpm run type-check    # TypeScript compilation
pnpm run format        # Prettier formatting

# Fix automatically
pnpm run fix           # Auto-fix linting issues
```

### Testing Strategy

- **Unit tests**: Test individual components and functions
- **Integration tests**: Test component interactions
- **End-to-end tests**: Test complete user workflows
- **Use Vitest**: Preferred testing framework for this organization

### Documentation Standards

- Maintain comprehensive README files
- Document all public APIs with JSDoc
- Keep architectural decisions in ADRs
- Update documentation with code changes

## Common Patterns and Anti-patterns

### ✅ DO:

- Use semantic commit messages with conventional commits
- Keep workflow files focused and reusable
- Implement comprehensive error handling
- Use TypeScript strict mode consistently
- Pin dependency versions in workflows
- Create changesets for all user-facing changes
- Group related Renovate updates
- Write descriptive PR descriptions

### ❌ DON'T:

- Use `any` type without justification
- Hardcode secrets or sensitive data
- Skip testing for automated updates
- Modify files in `node_modules` directly
- Ignore security vulnerability warnings
- Create overly complex workflow files
- Commit `node_modules` to version control
- Use long-lived feature branches

### Error Handling

- Implement try-catch blocks for async operations
- Use proper error types and messaging
- Log errors appropriately for debugging
- Fail fast in CI/CD pipelines when errors occur

### Performance Optimization

- Use caching strategies in workflows
- Minimize Docker image sizes
- Implement lazy loading where appropriate
- Optimize bundle sizes through tree-shaking

## Release and Publishing

### Automated Release Process

1. Changes merged to main trigger changeset collection
2. Release PR automatically created with version bumps
3. Merge release PR to publish new versions
4. GitHub releases created automatically with changelogs

### Custom Release Script (`scripts/release.ts`)

The release script provides sophisticated multi-package release management:

```sh
# - Handles complex tagging for monorepos and private packages
# - Creates GitHub releases with auto-generated changelogs
# - Manages version bumps across related packages
pnpm run release  # Runs the custom release.ts script
```

**Key Features:**

- Detects untagged packages and creates appropriate Git tags
- Handles both private root packages (`v1.0.0`) and scoped packages (`@scope/pkg@1.0.0`)
- Generates GitHub releases with markdown changelogs
- Validates changeset compliance before releasing

### Renovate Integration

**Automated Dependency Updates:**

- Triggered by renovate-changeset.yaml workflow
- Creates changesets automatically for dependency updates
- Enables auto-merge for patch/minor updates with proper testing

**Manual Override:**

- Major dependency updates require manual review
- Security updates are prioritized and can bypass normal schedules
- Changeset creation is automated but follows the same versioning rules

### Release Validation

- Smoke test deployments after releases
- Monitor for issues post-release
- Implement rollback procedures for critical failures
- Validate semantic versioning compliance

## Troubleshooting Common Issues

### Dependency Conflicts

- Use `pnpm dedupe` to resolve duplicate dependencies
- Check for peer dependency mismatches
- Verify lockfile consistency across environments

### Workflow Failures

- Check action version compatibility
- Validate secret availability and permissions
- Review timeout settings for long-running jobs
- Ensure proper caching configuration

### TypeScript Errors

- Verify tsconfig.json configuration
- Check for missing type definitions
- Ensure proper module resolution
- Validate import/export patterns

This document consolidates organizational best practices for the bfra.me/.github repository. Always prioritize security, maintainability, and consistency when making changes to this codebase.
