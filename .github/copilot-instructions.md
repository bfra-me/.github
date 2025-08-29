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

- **TypeScript 5.9.2** (strict mode, ESM modules) + **pnpm 10.15.0** (workspaces)
- **ESLint 9.34.0** (@bfra.me/eslint-config) + **Prettier 3.6.2** (@bfra.me/prettier-config)
- **Changesets 2.29.6** (versioning) + **Husky 9.1.7** (pre-commit hooks)
- **Node.js** version via `.node-version` file

### Project Structure

```
.ai/                   # AI-driven development and planning
├── plan/             # Implementation plans and specifications
└── notes/           # Development notes and prompts

.github/
├── workflows/              # Reusable workflows for this organization
├── actions/               # Custom internal actions (Node.js-based)
│   ├── renovate-changesets/   # Renovate-Changeset integration
│   └── update-metadata/       # Metadata management
├── instructions/    # Project development guidelines
└── copilot-instructions.md    # This file

docs/                      # Comprehensive documentation
└── workflows/            # Workflow-specific documentation

workflow-templates/       # GitHub workflow templates for other repos
├── *.yaml              # Template workflows
└── *.properties.json   # Template metadata

scripts/                 # Utility scripts
├── release.ts          # Automated release management
└── *.ts               # Other automation scripts

metadata/               # Project metadata and configurations
├── renovate.yaml      # Renovate configuration
└── *.yaml            # Other configurations
```

## Essential Development Commands

### Quality & Development Workflow
```bash
# Core development loop
pnpm bootstrap              # Install dependencies efficiently
pnpm run quality-check     # TypeScript + ESLint + build + test
pnpm run fix               # Auto-fix all linting issues

# Individual quality checks
pnpm run type-check        # TypeScript compilation check
pnpm run lint              # ESLint validation
pnpm run test              # Run test suite with Vitest

# Release management
pnpm run release           # Custom multi-package release script
```

### Project Context Commands
```bash
# Check implementation plans and AI specifications
cat .ai/plan/feature-workflow-validation-system-1.md
cat .ai/plan/infrastructure-org-health-monitoring-1.md

# Review project development guidelines
cat .github/instructions/github-actions.instructions.md
cat .github/instructions/typescript.instructions.md
cat .github/instructions/pnpm.instructions.md

# Check project documentation and status
cat README.md
cat CONTRIBUTING.md
cat llms.txt

# Review workflow templates and their metadata
ls workflow-templates/
cat workflow-templates/*.properties.json
```

## Custom Internal Actions

### `renovate-changesets/` Action
**Location**: `.github/actions/renovate-changesets/`
**Purpose**: Automatically creates changesets for Renovate dependency updates
**Key Files**:
- `src/index.ts`: Main action logic with TypeScript
- `action.yaml`: Action definition with inputs/outputs
- `package.json`: Dependencies including @actions/core, @octokit/rest

**Configuration Pattern**:
```typescript
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
```

**Integration**: Used by `renovate-changeset.yaml` workflow to convert dependency updates into proper semantic versioning changesets.

### `update-metadata/` Action
**Purpose**: Manages project metadata and configuration files
**Usage**: Updates package.json, workflow templates, and other metadata
**Automation**: Keeps organizational standards synchronized

## Workflow Templates System

### Template Structure
Each workflow template requires:
- **`*.yaml`**: The workflow template file with placeholder variables
- **`*.properties.json`**: Metadata describing the template
- **`*.svg`** (optional): Icon for GitHub's workflow template UI

### Placeholder Variables Used
- `$default-branch`: Repository's default branch (usually 'main')
- `$protected-branches`: Branches requiring protection
- `$cron-weekly`: Weekly cron schedule

### Key Security Patterns
```yaml
# All actions pinned to commit SHAs
- uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0

# Minimal permissions pattern
permissions:
  contents: read
  # Only add specific permissions as needed

# Security scanning integration
- uses: ossf/scorecard-action@05b42c624433fc40578a4040d5cf5e36ddca8cde # v2.4.2
```

## Release Management System

### Custom Release Script (`scripts/release.ts`)
**Pattern**: Multi-package tagging with different strategies:
- **Private root packages**: Tagged as `v{version}` (e.g., `v4.1.0`)
- **Public packages**: Tagged as `{name}@{version}` (e.g., `@bfra.me/config@1.0.0`)

**Key Functions**:
```typescript
// Check for untagged packages
async function getUntaggedPackages(packages: Package[], cwd: string, tool: Tool)

// Handle both local and remote tag existence
const tagExists = (await getExecOutput('git', ['tag', '-l', tagName], {cwd})).stdout.trim() !== ''
const remoteTagExists = (await getExecOutput('git', ['ls-remote', '--tags', 'origin', '-l', tagName], {cwd})).stdout.trim() !== ''
```

### Changeset Workflow
**Manual Creation**: Create `.changeset/{feature-name}.md` files manually (DO NOT use CLI)
**Automation**: Dependency updates handled automatically via `renovate-changeset.yaml`

**Format**:
```markdown
---
"@bfra.me/.github": patch|minor|major
---

Clear description of changes for users
```

## GitHub App Authentication Pattern

### bfra-me App Usage
All automated workflows use the `bfra-me[bot]` GitHub App with scoped tokens:
```yaml
- name: Generate Token
  uses: actions/create-github-app-token@v1
  with:
    app-id: ${{ secrets.APPLICATION_ID }}
    private-key: ${{ secrets.APPLICATION_PRIVATE_KEY }}
```

This pattern provides:
- Scoped permissions per workflow
- Better security than personal access tokens
- Audit trail for automated actions

## Project Development Guidelines

### Instruction System
**Location**: `.github/instructions/*.instructions.md`
**Purpose**: Comprehensive development guidelines for the project

**Key Guidelines**:
- **github-actions.instructions.md**: Best practices for GitHub Actions workflows including automation, testing, security, and CI/CD integration
- **typescript.instructions.md**: Comprehensive TypeScript development guidelines covering code organization, patterns, performance, and security
- **pnpm.instructions.md**: Package management best practices including dependency management, security, and performance optimization
- **changesets.instructions.md**: Guidelines for using Changesets to manage versioning and changelogs effectively
- **renovate.instructions.md**: Best practices for configuring Renovate Bot including automated dependency updates and review processes

**Integration**: These instructions are referenced by AI coding assistants and enforced through automated workflows and code review processes.

## Monitoring & Validation Systems

### Planned Validation System
**Location**: `.ai/plans/feature-workflow-validation-system-1.md`
**Purpose**: Comprehensive validation system for workflow templates
**Components**:
- Security pattern validation (action pinning, permissions)
- Template metadata completeness checks
- Adoption reporting across organization
- GitHub Actions schema compliance

### Organization Health Monitoring
**Location**: `.ai/plans/infrastructure-org-health-monitoring-1.md`
**Purpose**: Centralized monitoring for repository health
**Metrics**: OpenSSF Scorecard ratings, dependency vulnerabilities, workflow adoption

## TypeScript Development Patterns

### Configuration Standards
```json
{
  "compilerOptions": {
    "strict": true,
    "module": "esnext",
    "target": "esnext",
    "type": "module",        // ESM modules only
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### Action Development Pattern
```typescript
// Standard action entry point
import * as core from '@actions/core'
import {getExecOutput} from '@actions/exec'
import {Octokit} from '@octokit/rest'

// Use interfaces for configuration
interface Config {
  // Define structured configuration
}

// Always handle errors with core.setFailed
try {
  // Action logic
} catch (error) {
  core.setFailed(error instanceof Error ? error.message : String(error))
}
```

## Security & Compliance Standards

### Action Pinning
- All third-party actions pinned to specific commit SHAs
- Security scanning integrated (OpenSSF Scorecard, CodeQL, dependency review)
- Branch protection enforced with required status checks

### Dependency Management
- Renovate automated updates with changeset creation
- Security priority for vulnerability fixes
- Auto-merge for patch/minor, manual review for major updates

### Workflow Security
```yaml
# Standard security pattern
permissions:
  contents: read  # Minimal permissions
  # Add specific permissions only as needed

# Concurrency control
concurrency:
  group: ${{ github.workflow }}-${{ github.event.number || github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}
```

## Common Patterns & Anti-Patterns

### ✅ DO:
- Pin all action versions to commit SHAs with version comments
- Use minimal required permissions following principle of least privilege
- Create changesets for all user-facing changes
- Use the `bfra-me[bot]` pattern for authentication
- Include comprehensive metadata in workflow templates
- Follow conventional commit patterns for automated processing

### ❌ DON'T:
- Use floating action versions (avoid `@main`, `@v1`)
- Grant broad permissions without justification
- Skip changeset creation for dependency updates (automated via Renovate)
- Hardcode sensitive data (use secrets and GitHub App tokens)
- Create workflow templates without corresponding `.properties.json` files
- Use manual changeset CLI (creates inconsistent format)

This repository exemplifies organizational automation at scale - study the patterns in `scripts/release.ts`, `actions/renovate-changesets/`, and workflow templates for advanced GitHub ecosystem integration.
