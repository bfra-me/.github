# update-repository-settings Action

Applies repository settings from YAML config (typically `.github/settings.yml` with optional `_extends` for remote inheritance). Plugin-based architecture — each GitHub resource type is a separate plugin.

## STRUCTURE

```
src/
├── index.ts              # Entry point — delegates to run()
├── config.ts             # Config loading: YAML parse, remote extends, base64 decode, deepMerge
├── diff.ts               # deepMerge + diffCollections (detect add/update/remove)
├── normalize.ts          # Normalize comma-delimited strings and hex colors
├── plugins/
│   ├── index.ts          # Plugin registry + applySettings() orchestrator
│   ├── branches.ts       # Branch protection: status checks, reviews, restrictions
│   ├── collaborators.ts  # Collaborator permissions (admin/push/pull)
│   ├── environments.ts   # Deployment environments + protection rules
│   ├── labels.ts         # Issue/PR labels (color, description)
│   ├── milestones.ts     # Milestones (state, due date, description)
│   ├── repository.ts     # Core repo settings (description, topics, visibility, features)
│   ├── rulesets.ts       # Branch/tag rulesets
│   └── teams.ts          # Team permissions
├── __tests__/            # Unit tests for config, diff, normalize, index
└── plugins/__tests__/    # Per-plugin test suites (branches, collaborators, etc.)
```

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Add new resource type | `src/plugins/` | Create plugin fn, register in `PLUGIN_REGISTRY` |
| Fix branch protection | `src/plugins/branches.ts` | `cleanupMergedProtection` handles org vs user repos |
| Fix status check sync | `src/plugins/branches.ts` | `resolveStatusCheckConflict()` resolves checks/contexts |
| Change config loading | `src/config.ts` | `loadConfig()` supports `_extends` + remote configs |
| Fix collection diffing | `src/diff.ts` | `diffCollections()` returns add/update/remove sets |
| Add/modify plugin tests | `src/plugins/__tests__/` | Each plugin has own test file |
| Change repo settings fields | `src/plugins/repository.ts` | Topics and security toggles use separate API endpoints |

## CONVENTIONS

- **Plugin pattern** — each resource type exports a `Plugin` function: `(octokit, owner, repo, config) => Promise<void>`
- `PLUGIN_REGISTRY` maps config keys to plugin functions
- `applySettings()` iterates config keys, skips unknown keys, aggregates errors
- Config supports `_extends` for remote YAML inheritance via `loadConfig()`
- `branchesPlugin` merges GET response with config via `deepMerge` (from `diff.ts`) before applying — sends full merged payload, not a minimal diff
- `branchesPlugin` determines `isOrganization` internally by checking the repo owner type
- `cleanupMergedProtection` for user-owned repos: sets `restrictions = null`, deletes `dismissal_restrictions`, strips org-only `users`/`teams` from `bypass_pull_request_allowances`
- `resolveStatusCheckConflict()` runs between merge and cleanup — keeps whichever field (`checks` or `contexts`) the config specifies
- Tests use `createOctokit()` helpers with `vi.fn()` methods, no real API calls
- Build: `tsup` (not tsc) → single bundled `dist/index.js`

## COMMANDS

```bash
pnpm build     # tsup → dist/index.js (must commit dist/)
pnpm test      # vitest run
pnpm lint      # eslint
```

## NOTES

- `dist/index.js` is committed — GitHub Actions requires pre-built JS
- GitHub API returns both `checks` and `contexts` on GET for branch protection — `sanitizeStatusChecks` normalizes this before merge
- For user-owned repos (non-org), the API rejects non-null `restrictions` and org-only sub-fields in `required_pull_request_reviews`
- `stripUrlFields` removes `*_url` fields from API responses before comparison
- `BOOLEAN_PROTECTION_FIELDS` lists branch protection fields that wrap booleans as `{enabled: bool}` objects
- `repository.ts`: topics use `repos.replaceAllTopics()`, security features use `repos.enableVulnerabilityAlerts()` — not just `repos.update()`
