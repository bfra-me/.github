# Technical Documentation

## Development Environment

### Core Technologies
- **Node.js**: Version specified in `.node-version`
- **Package Manager**: pnpm@10.8.1
- **Language**: TypeScript 5.8.3
- **Module System**: ESM (specified in package.json `"type": "module"`)

### Development Tools
- **ESLint**: v9.24.0 with @bfra.me/eslint-config
- **Prettier**: v3.5.3 with @bfra.me/prettier-config
- **TypeScript**: v5.8.3 with @bfra.me/tsconfig
- **Husky**: v9.1.7 for git hooks
- **Changesets**: v2.29.0 for versioning
- **lint-staged**: v15.5.1 for pre-commit linting
- **tsx**: v4.19.3 for running TypeScript files directly

## Technical Stack Details

### TypeScript Configuration
```json
{
  "compilerOptions": {
    "strict": true,
    "module": "esnext",
    "target": "esnext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "jsx": "react-jsx",
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### Code Quality Tools
1. **ESLint**
   - Extended from @bfra.me/eslint-config
   - Integrated with Prettier
   - Strict TypeScript rules enabled
   - Pre-commit enforcement via Husky

2. **Prettier**
   - Configuration from @bfra.me/prettier-config
   - Enforced through pre-commit hooks
   - Integrated with ESLint
   - Consistent formatting across all files

3. **EditorConfig**
   - Ensures consistent coding style
   - Cross-editor compatibility
   - Basic formatting rules
   - Complements Prettier configuration

4. **Memory Files Framework**
   - Documentation structure for project knowledge
   - Core files for project management
   - Error tracking and resolution documentation
   - Lessons learned and project intelligence

## Automation and Workflows

### GitHub Actions
1. **Renovate Workflow**
   - Self-hosted Renovate bot
   - Automated dependency updates
   - Changeset integration
   - Customizable update schedule

2. **Repository Settings Workflow**
   - Automated settings management
   - Uses elstudio/actions-settings
   - Template-based configuration
   - Branch protection rules enforcement

3. **Security Workflows**
   - OpenSSF Scorecard integration
   - CodeQL analysis
   - Dependency review
   - Security policy enforcement

4. **Release Workflows**
   - Changesets-based versioning
   - Automated changelog generation
   - Release publishing
   - Tag and GitHub release creation

### Development Workflow
1. **Installation**
   ```bash
   pnpm bootstrap
   ```

2. **Pre-commit Hooks**
   - ESLint checks
   - Prettier formatting
   - TypeScript type checking
   - Automated by Husky and lint-staged

3. **Release Process**
   - Managed by Changesets
   - Automated changelog generation
   - Semantic versioning
   - GitHub Releases integration

## Security Implementation

### OpenSSF Scorecard
- Automated security scoring
- Best practices enforcement
- Regular security audits
- Vulnerability scanning

### Access Control
- Branch protection rules
- Required reviews
- Status checks enforcement
- Minimal permission principle

### Dependency Management
- Automated updates via Renovate
- Security vulnerability scanning
- Version pinning for stability
- Lockfile validation

## Development Scripts

```json
{
  "bootstrap": "pnpm install --prefer-offline --loglevel error",
  "bump": "changeset version && pnpm bootstrap && pnpm run fix",
  "fix": "pnpm run lint --fix",
  "format": "prettier --write .",
  "lint": "eslint .",
  "update-metadata": "pnpm tsx ./scripts/generate-metadata.ts",
  "release": "tsx ./scripts/release.ts",
  "prepare": "husky",
  "type-check": "tsc --noEmit",
  "quality-check": "pnpm run type-check && pnpm run lint"
}
```

## Project Structure
```
.
├── .github/          # GitHub specific files
├── .changeset/       # Changeset configurations
├── scripts/          # Utility scripts
├── workflow-templates/ # Reusable workflow templates
├── docs/             # Documentation
│   ├── architecture.md       # System architecture
│   ├── technical.md          # Technical documentation
│   ├── product_requirement_docs.md # Product requirements
│   └── workflows/            # Workflow documentation
├── tasks/            # Task management
│   ├── active_context.md     # Current development focus
│   └── tasks_plan.md         # Task planning and tracking
├── metadata/         # Project metadata
└── .cursor/          # Cursor AI rules and documentation
    └── rules/
        ├── error-documentation.mdc # Error tracking
        └── lessons-learned.mdc     # Project intelligence
```

## Technical Decisions and Rationale

### ESM Modules
- Better tree-shaking
- Native async/await support
- Future-proof architecture
- Improved module resolution

### Strict TypeScript
- Enhanced type safety
- Better developer experience
- Reduced runtime errors
- Self-documenting code

### pnpm
- Efficient dependency management
- Strict dependency resolution
- Faster installation times
- Reduced disk space usage

### Changesets
- Automated versioning
- Structured change tracking
- Integrated with CI/CD
- Developer-friendly workflow

### Memory Files Framework
- Centralized project knowledge
- Structured documentation approach
- Error tracking and resolution
- Project intelligence and patterns

## Performance Considerations

### Workflow Optimization
- Minimal dependency installation
- Efficient script execution
- Caching strategies for CI/CD
- Resource usage optimization

### Development Efficiency
- Automated development tools
- Consistent environment configuration
- Quick onboarding process
- Self-documented codebase

## Monitoring and Maintenance

### Workflow Monitoring
- Execution time tracking
- Error rate monitoring
- Success/failure metrics
- Resource usage analysis

### Health Checks
- Regular dependency updates
- Security vulnerability scanning
- Performance benchmarking
- Documentation completeness checks
