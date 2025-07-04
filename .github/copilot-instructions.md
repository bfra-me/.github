# @bfra.me/.github Coding Best Practices

This is a GitHub organization template repository that defines defaults and settings for the @bfra-me GitHub Organization. The project uses TypeScript with strict ESLint and Prettier configurations.

## Project Context

- This is a template repository for GitHub organization settings and workflows
- Uses TypeScript with ESM modules
- Follows strict ESLint and Prettier configurations from @bfra.me
- Uses pnpm as the package manager
- Implements changesets for versioning and releases

## Coding Standards

- Use ESM modules with TypeScript (`"type": "module"` in package.json)
- Follow the @bfra.me/eslint-config and @bfra.me/prettier-config rules
- Use strict TypeScript configurations
- Prefer `const` over `let` for variable declarations
- Use camelCase for variable and function names
- Prefer kebab-case for file names

## Development Workflow

- All changes must pass linting and formatting checks
- Changes should be documented using changesets
- Pull requests must pass required status checks
- Main branch requires linear history
- Renovate handles dependency updates automatically
- Release process is automated through GitHub Actions

## Testing and Validation

- Run `pnpm lint` for ESLint and Prettier checks
- Run `pnpm fix` to automatically fix linting issues and format code
- Ensure all GitHub Actions workflows pass

## Error Handling and Logging

- Use TypeScript's strict type checking
- Implement proper error boundaries in workflows
- Log errors appropriately in GitHub Actions
- Handle async operations with proper error catching

## Documentation

- Maintain clear README files
- Use JSDoc comments for TypeScript functions
- Keep workflow YAML files well-documented
- Update changelogs through changesets

## Security Considerations

- Follow security best practices for GitHub Actions
- Use proper token permissions
- Implement dependency scanning
- Follow OpenSSF Scorecard recommendations
- Use Renovate for automated security updates

## Coding Best Practices

- **Do not modify code or UI elements that already work**, unless explicitly instructed.
- Avoid duplicating existing functionality; reuse working components whenever possible.
- Write comprehensive tests for all new or modified functionality.
- **Never unintentionally delete data or code**; confirm explicitly before destructive actions.
- Commit frequently to maintain a reliable project history.
- Always ask clarifying questions if tasks or requirements are unclear.

## User Interface (UI)

- **Never change or affect the UI unintentionally.**
- Only alter UI components if explicitly instructed or clearly part of the assigned task.
- Always ensure UI changes are fully tested and validated.
