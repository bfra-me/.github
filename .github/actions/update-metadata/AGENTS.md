# update-metadata Action

Generates and updates repository metadata files. Single-file action used in org-wide automation.

## STRUCTURE

```
src/index.ts          # All logic — reads repo state, writes metadata files
dist/index.js         # Pre-built output (committed)
test/                 # Vitest tests
action.yaml           # Action definition (inputs: token)
```

## CONVENTIONS

- Same build toolchain as renovate-changesets: `tsup` → `dist/index.js`
- `dist/` committed for GitHub Actions runtime
- Uses `@actions/core` for inputs/outputs, `@octokit/rest` for GitHub API
- Errors handled via `core.setFailed()`

## COMMANDS

```bash
pnpm build     # tsup → dist/index.js
pnpm test      # vitest run
```
