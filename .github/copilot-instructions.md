# GitHub Copilot Instructions for bfra.me/.github

## Repository Overview

This repository serves as the organizational defaults and templates for the @bfra.me GitHub organization. It provides:

- Reusable GitHub Actions workflow templates with automated Renovate-Changeset integration
- Organization-wide repository settings and configurations via Repository Settings App
- Security policies and compliance workflows (OpenSSF Scorecard, CodeQL, dependency review)
- Development tools and shared configurations for TypeScript/pnpm monorepos
- Custom internal actions for specialized workflows
- Automated release management with multi-package support

### Core Architecture Patterns

- **Automated Release System**: Custom `scripts/release.ts` handles multi-package tagging and GitHub releases
- **Renovate-Changeset Integration**: Automatic changeset creation for dependency updates via `renovate-changeset.yaml`
- **GitHub App Authentication**: Uses `bfra-me[bot]` with scoped tokens for automated workflows
- **Template Inheritance**: Workflow templates in `workflow-templates/` provide organization-wide defaults
- **Internal Actions**: Custom actions in `.github/actions/` for reusable workflow components

## Development Environment

### Core Technologies

- **TypeScript 5.8.3** with strict mode enabled and ESM modules
- **pnpm 10.8.1** as the package manager with workspaces support
- **ESLint 9.24.0** with @bfra.me/eslint-config for consistent code quality
- **Prettier 3.5.3** with @bfra.me/prettier-config for code formatting
- **Changesets 2.29.5** for semantic versioning and changelog generation
- **Husky 9.1.7** with lint-staged for pre-commit hooks
- **Node.js** version controlled via `.node-version` file

### Project Structure

```
.github/
├── workflows/              # Reusable workflows for this organization
├── actions/               # Custom internal actions (Node.js-based)
│   ├── renovate-changesets/   # Renovate-Changeset integration
│   └── update-metadata/       # Metadata management
└── copilot-instructions.md    # This file

docs/                      # Comprehensive documentation
├── workflows/            # Workflow-specific documentation
├── architecture.md       # System architecture
├── technical.md         # Technical specifications
└── adr/                 # Architectural Decision Records

tasks/                    # Reference documentation (legacy)
├── tasks_plan.md        # Historical project roadmap
└── *.md                # Task implementation details

workflow-templates/       # GitHub workflow templates for other repos
├── *.yaml              # Template workflows
└── *.properties.json   # Template metadata

scripts/                 # Utility scripts
├── release.ts          # Automated release management
└── *.ts               # Other automation scripts

metadata/               # Project metadata and configurations
├── renovate.yaml      # Renovate configuration
└── *.yaml            # Other configurations

.ai/plans/             # AI-powered workflow plans (work in progress)
```

## Internal Actions & Custom Workflows

### Custom Internal Actions

Located in `.github/actions/`, these provide reusable components for specialized workflows:

#### `renovate-changesets/`
- **Purpose**: Automatically creates changesets for Renovate dependency updates
- **Integration**: Used by `renovate-changeset.yaml` workflow
- **Key Feature**: Converts dependency updates into proper semantic versioning changesets

#### `update-metadata/`
- **Purpose**: Manages project metadata and configuration files
- **Usage**: Updates package.json, workflow templates, and other metadata
- **Automation**: Keeps organizational standards synchronized

### Internal Workflows (`.github/workflows/`)

These workflows manage this repository itself:

- **`renovate.yaml`**: Self-hosted Renovate bot for dependency management
- **`renovate-changeset.yaml`**: Integrates Renovate with Changesets system
- **`auto-release.yaml`**: Automated releases triggered by changeset merges
- **`update-repo-settings.yaml`**: Synchronizes repository settings across organization

## Reusable Workflows for Organization

These workflows can be called by other repositories in the organization:

### Workflow Usage Pattern
```yaml
jobs:
  workflow-name:
    uses: bfra-me/.github/.github/workflows/[workflow-name].yaml@v4.0.9
    secrets: inherit
    with:
      # Optional parameters
```

### Available Workflows
- **Security scanning**: CodeQL analysis, dependency review, OpenSSF Scorecard
- **Repository management**: Settings synchronization, branch protection
- **Dependency management**: Automated updates with changeset integration

## Workflow Templates for Other Repositories

Located in `workflow-templates/`, these provide starting points for new repositories:

### Template Structure
- **`*.yaml`**: The workflow template file
- **`*.properties.json`**: Metadata describing the template
- **`*.svg`**: Optional icon for GitHub's workflow template UI

### Key Templates
- **`renovate.yml`**: Basic Renovate configuration for dependency updates
- **`scorecard.yaml`**: OpenSSF Scorecard security assessment
- **`codeql-analysis.yaml`**: Static application security testing
- **`dependency-review.yaml`**: Pull request dependency vulnerability scanning

## Essential Development Workflows

### Project Status and Context
```bash
# Check current development priorities
cat tasks/active_context.md

# Review completed and planned tasks
cat tasks/tasks_plan.md

# Check for active issues
grep -A 10 "Active Issues" tasks/active_context.md
```

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

### Changeset Creation Guidelines

Create changesets manually for all user-facing changes:

```bash
# Create .changeset/feature-name.md manually (DO NOT use CLI)
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
- Breaking changes
- User-facing documentation updates
- Build/tooling changes affecting consumers

**AUTOMATED via Renovate:**
- Dependency updates are handled by `renovate-changeset.yaml`
- Creates appropriate changesets based on semver impact

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

## Common Patterns and Best Practices

### ✅ DO:
- Use semantic commit messages with conventional commits
- Keep workflow files focused and reusable
- Use TypeScript strict mode consistently
- Pin dependency versions in workflows
- Create changesets for all user-facing changes
- Write descriptive PR descriptions
- Use minimal required permissions for workflows
- Pin action versions to specific commits for security

### ❌ DON'T:
- Use `any` type without justification
- Hardcode secrets or sensitive data
- Skip testing for automated updates
- Ignore security vulnerability warnings
- Create overly complex workflow files
- Commit `node_modules` to version control

### Security Best Practices
- Store all secrets in GitHub Secrets, never in code
- Use minimal required permissions for workflows
- Implement vulnerability scanning in CI pipeline
- Enable branch protection on main branch
- Regular security audits and dependency updates

This document consolidates organizational best practices for the bfra.me/.github repository. Always prioritize security, maintainability, and consistency when making changes to this codebase.

## Metadata & Configuration Management

### Repository Settings
- **`common-settings.yaml`**: Template for organization-wide repository settings
- **Applied via**: `update-repo-settings.yaml` workflow using Repository Settings App
- **Scope**: Branch protection, issue templates, security policies

### Renovate Configuration
- **`metadata/renovate.yaml`**: Organization-wide Renovate presets and rules
- **Integration**: Used by repositories to inherit consistent dependency management
- **Features**: Security priority, auto-merge policies, grouping strategies

### Package Management
- **`pnpm-workspace.yaml`**: Monorepo configuration for multi-package repositories
- **`package.json`**: Root package with shared dependencies and scripts
- **`.npmrc`**: npm/pnpm configuration for consistent package resolution

## Development Workflows & Commands

### Essential Development Scripts
```bash
# Setup and installation
pnpm bootstrap              # Install all dependencies efficiently

# Quality checks (run before commits)
pnpm run quality-check     # TypeScript + ESLint validation
pnpm run type-check        # TypeScript compilation check
pnpm run lint              # ESLint validation
pnpm run fix               # Auto-fix linting issues

# Release workflow
pnpm run release           # Custom release script for multi-package repos

# Workspace operations
pnpm -r run build          # Build all packages in workspace
pnpm -r run test           # Run tests across all packages
```

### Project Reference Documentation
```bash
# Historical task tracking (reference only)
cat tasks/tasks_plan.md    # Historical project roadmap
cat tasks/active_context.md # Legacy development context

# Current documentation
cat docs/architecture.md    # System architecture overview
cat docs/technical.md      # Technical implementation details
```
