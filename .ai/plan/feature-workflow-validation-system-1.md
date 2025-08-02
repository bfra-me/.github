---
goal: Create a comprehensive validation system for workflow-templates directory ensuring organizational standards compliance
version: 1.0
date_created: 2025-08-02
last_updated: 2025-08-02
owner: Marcus R. Brown (marcusrbrown)
status: 'Planned'
tags: ['feature', 'validation', 'workflow-templates', 'security', 'automation', 'governance']
---

# Workflow Templates Validation System Implementation Plan

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

This implementation plan creates a comprehensive validation system for the workflow-templates directory that ensures all template workflows follow organizational standards and best practices. The system validates proper permissions configuration, security scanning integration, authentication patterns, metadata completeness, and generates adoption reports across the organization.

## 1. Requirements & Constraints

**Security & Authentication Requirements:**

- **REQ-001**: All workflow templates must use minimal required permissions following principle of least privilege
- **REQ-002**: Templates using authentication must implement the bfra-me[bot] pattern with GitHub App tokens
- **REQ-003**: All third-party actions must be pinned to specific commit SHAs for security
- **REQ-004**: Security scanning templates must integrate OpenSSF Scorecard, CodeQL, and dependency review

**Template Standards Requirements:**

- **REQ-005**: Every workflow template (.yaml/.yml) must have a corresponding .properties.json metadata file
- **REQ-006**: Templates must use standardized placeholder variables ($default-branch, $protected-branches, $cron-weekly)
- **REQ-007**: Workflow syntax must be valid and parseable YAML following GitHub Actions schema
- **REQ-008**: Templates must follow naming conventions and organizational structure patterns

**Reporting & Adoption Requirements:**

- **REQ-009**: System must generate adoption reports showing which repositories use each template
- **REQ-010**: Validation reports must be machine-readable (JSON) and human-readable (Markdown)
- **REQ-011**: System must identify templates that are outdated or not following current standards

**Technical Constraints:**

- **CON-001**: Validation system must be implemented as reusable GitHub Actions workflows and TypeScript scripts
- **CON-002**: System must integrate with existing CI/CD pipeline without breaking current workflows
- **CON-003**: All validation must be automated and require no manual intervention
- **CON-004**: System must be extensible to accommodate future organizational standards

**Performance Guidelines:**

- **GUD-001**: Validation should complete within 5 minutes for the current template set
- **GUD-002**: Adoption reports should leverage GitHub API efficiently to avoid rate limiting
- **GUD-003**: System should cache results where appropriate to improve performance

**Pattern Compliance:**

- **PAT-001**: Follow Repository Settings App configuration model for organization-wide standards
- **PAT-002**: Use conventional commit messages and semantic versioning for all changes
- **PAT-003**: Implement proper error handling and logging for all validation processes

## 2. Implementation Steps

### Implementation Phase 1: Core Validation Infrastructure

- GOAL-001: Establish the foundational validation framework and core validation logic

| Task | Description | Completed | Date |
| --- | --- | --- | --- |
| TASK-001 | Create validation schema definitions for workflow templates in `scripts/validation/schemas/` |  |  |
| TASK-002 | Implement core validation engine in TypeScript (`scripts/validation/core/validator.ts`) |  |  |
| TASK-003 | Create permissions validation module to check minimal permissions compliance |  |  |
| TASK-004 | Implement security validation module for action pinning and authentication patterns |  |  |
| TASK-005 | Create metadata validation module for .properties.json file completeness |  |  |
| TASK-006 | Implement YAML syntax validation using GitHub Actions schema |  |  |

### Implementation Phase 2: Security & Authentication Validation

- GOAL-002: Implement comprehensive security and authentication pattern validation

| Task | Description | Completed | Date |
| --- | --- | --- | --- |
| TASK-007 | Create bfra-me[bot] authentication pattern validator checking for proper GitHub App token usage |  |  |
| TASK-008 | Implement security scanning integration validator for OpenSSF Scorecard, CodeQL, dependency review |  |  |
| TASK-009 | Create action security validator to ensure all actions are pinned to commit SHAs |  |  |
| TASK-010 | Implement permissions audit module to flag overprivileged workflows |  |  |
| TASK-011 | Create Repository Settings App compliance checker |  |  |

### Implementation Phase 3: Template Standards & Compliance

- GOAL-003: Ensure all templates follow organizational standards and conventions

| Task | Description | Completed | Date |
| --- | --- | --- | --- |
| TASK-012 | Implement placeholder variable validator for standardized template variables |  |  |
| TASK-013 | Create naming convention validator for workflow and job names |  |  |
| TASK-014 | Implement organizational structure pattern validator |  |  |
| TASK-015 | Create template completeness checker ensuring all required files exist |  |  |
| TASK-016 | Implement version compatibility validator for action dependencies |  |  |

### Implementation Phase 4: Adoption Reporting & Analytics

- GOAL-004: Create comprehensive adoption reporting system across the organization

| Task | Description | Completed | Date |
| --- | --- | --- | --- |
| TASK-017 | Implement GitHub API integration for organization repository discovery |  |  |
| TASK-018 | Create template usage analyzer to identify which repos use which templates |  |  |
| TASK-019 | Implement adoption report generator (JSON and Markdown formats) |  |  |
| TASK-020 | Create outdated template identifier comparing versions and patterns |  |  |
| TASK-021 | Implement usage analytics dashboard data generation |  |  |

### Implementation Phase 5: Automation & CI/CD Integration

- GOAL-005: Integrate validation system into automated workflows and CI/CD pipeline

| Task | Description | Completed | Date |
| --- | --- | --- | --- |
| TASK-022 | Create GitHub Actions workflow for automated template validation |  |  |
| TASK-023 | Implement validation report publishing to GitHub Pages or repository |  |  |
| TASK-024 | Create scheduled workflow for periodic adoption report generation |  |  |
| TASK-025 | Implement validation status badges and indicators |  |  |
| TASK-026 | Create notification system for validation failures and compliance issues |  |  |

## 3. Alternatives

**Alternative Approaches Considered:**

- **ALT-001**: **External validation service**: Considered using external tools like Checkov or custom Docker containers, but rejected due to increased complexity and external dependencies
- **ALT-002**: **Manual validation process**: Considered manual review processes with checklists, but rejected due to scalability issues and human error potential
- **ALT-003**: **GitHub marketplace action**: Considered using existing marketplace actions for workflow validation, but rejected due to lack of organization-specific customization
- **ALT-004**: **Webhook-based validation**: Considered real-time validation via webhooks, but rejected due to complexity and potential reliability issues
- **ALT-005**: **Shell script implementation**: Considered bash/shell scripts for validation, but rejected in favor of TypeScript for better maintainability and error handling

## 4. Dependencies

**Runtime Dependencies:**

- **DEP-001**: TypeScript 5.8.3+ for validation script implementation
- **DEP-002**: GitHub Actions environment for workflow execution
- **DEP-003**: GitHub API access with appropriate permissions for organization repository scanning
- **DEP-004**: YAML parsing library (js-yaml) for workflow syntax validation
- **DEP-005**: JSON Schema validation library (ajv) for metadata validation

**Development Dependencies:**

- **DEP-006**: Node.js 18+ runtime environment
- **DEP-007**: pnpm package manager for dependency management
- **DEP-008**: ESLint and Prettier for code quality and formatting
- **DEP-009**: Vitest for unit testing the validation logic
- **DEP-010**: GitHub CLI for testing and development workflows

**External Services:**

- **DEP-011**: GitHub API rate limits and organization access permissions
- **DEP-012**: GitHub Pages or repository storage for validation reports
- **DEP-013**: Repository Settings App for organizational configuration standards

## 5. Files

**Core Validation Files:**

- **FILE-001**: `scripts/validation/core/validator.ts` - Main validation engine and orchestrator
- **FILE-002**: `scripts/validation/schemas/workflow-schema.json` - JSON schema for workflow template validation
- **FILE-003**: `scripts/validation/schemas/metadata-schema.json` - JSON schema for .properties.json validation
- **FILE-004**: `scripts/validation/modules/permissions-validator.ts` - Permissions compliance checker
- **FILE-005**: `scripts/validation/modules/security-validator.ts` - Security pattern validation
- **FILE-006**: `scripts/validation/modules/metadata-validator.ts` - Metadata completeness validation

**Reporting and Analytics Files:**

- **FILE-007**: `scripts/validation/reporting/adoption-analyzer.ts` - Template adoption analysis
- **FILE-008**: `scripts/validation/reporting/report-generator.ts` - Report generation utilities
- **FILE-009**: `scripts/validation/reporting/github-api.ts` - GitHub API integration utilities

**Workflow Integration Files:**

- **FILE-010**: `.github/workflows/validate-templates.yaml` - Automated validation workflow
- **FILE-011**: `.github/workflows/generate-adoption-reports.yaml` - Adoption reporting workflow
- **FILE-012**: `scripts/validation/cli.ts` - Command-line interface for manual validation

**Configuration Files:**

- **FILE-013**: `scripts/validation/config/standards.json` - Organizational standards configuration
- **FILE-014**: `scripts/validation/config/validation-rules.json` - Validation rules configuration
- **FILE-015**: `docs/validation-system.md` - System documentation and usage guide

## 6. Testing

**Unit Testing:**

- **TEST-001**: Validation engine unit tests covering all validation modules and edge cases
- **TEST-002**: Schema validation tests ensuring proper JSON schema enforcement
- **TEST-003**: Permissions validator tests with various permission configurations
- **TEST-004**: Security validator tests including authentication pattern validation
- **TEST-005**: Metadata validator tests for .properties.json file validation

**Integration Testing:**

- **TEST-006**: End-to-end validation testing with actual workflow template files
- **TEST-007**: GitHub API integration tests (mocked and live with test repositories)
- **TEST-008**: Report generation testing ensuring proper JSON and Markdown output
- **TEST-009**: Workflow integration tests validating CI/CD pipeline integration

**System Testing:**

- **TEST-010**: Performance testing with large numbers of templates and repositories
- **TEST-011**: Error handling testing with malformed templates and API failures
- **TEST-012**: Adoption report accuracy testing against known repository configurations

## 7. Risks & Assumptions

**Technical Risks:**

- **RISK-001**: GitHub API rate limiting could impact adoption report generation for large organizations
- **RISK-002**: Changes to GitHub Actions schema could break workflow syntax validation
- **RISK-003**: Complex validation logic could introduce performance bottlenecks
- **RISK-004**: Authentication token management for GitHub App integration could fail

**Organizational Risks:**

- **RISK-005**: Strict validation could prevent legitimate workflow variations needed by specific repositories
- **RISK-006**: False positives in validation could reduce developer confidence in the system
- **RISK-007**: Maintenance burden of keeping validation rules current with evolving standards

**Security Assumptions:**

- **ASSUMPTION-001**: GitHub App tokens will continue to be the preferred authentication method
- **ASSUMPTION-002**: Organization maintains consistent security standards across all repositories
- **ASSUMPTION-003**: Template users will adopt standardized placeholder variables

**Technical Assumptions:**

- **ASSUMPTION-004**: Current workflow template structure and conventions will remain stable
- **ASSUMPTION-005**: GitHub Actions schema and syntax will maintain backward compatibility
- **ASSUMPTION-006**: TypeScript and Node.js ecosystem will continue to support required validation libraries

## 8. Related Specifications / Further Reading

- [GitHub Actions Workflow Syntax Documentation](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- [OpenSSF Scorecard Documentation](https://github.com/ossf/scorecard)
- [CodeQL Analysis Configuration Guide](https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning/customizing-your-advanced-setup-for-code-scanning)
- [GitHub App Authentication Best Practices](https://docs.github.com/en/developers/apps/building-github-apps/authenticating-with-github-apps)
- [Repository Settings App Documentation](https://github.com/repository-settings/app)
- [bfra.me Organization GitHub Actions Instructions](https://github.com/bfra-me/.github/blob/main/.github/instructions/github-actions.instructions.md)
- [Workflow Templates Documentation](https://docs.github.com/en/actions/using-workflows/creating-starter-workflows-for-your-organization)
- [JSON Schema Specification](https://json-schema.org/specification.html)
