# update-metadata Action

Scans all `@bfra-me` org repos for Renovate workflows, writes `metadata/renovate.yaml` listing which repos have Renovate enabled.

## STRUCTURE

```
src/index.ts             # All logic (56 lines): org scan → YAML output
dist/index.js            # Pre-built output (committed)
test/index.test.ts       # Vitest tests
action.yaml              # Single input: token
```

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Change scan logic | `src/index.ts` → `generateMetadata()` | Paginates org repos, checks for `.github/workflows/renovate.yaml` |
| Change output format | `src/index.ts` → `MetadataConfig` | Interface defines YAML structure |
| Change workflow trigger | `.github/workflows/update-metadata.yaml` | Daily cron + manual dispatch |
| Change PR behavior | `.github/workflows/update-metadata.yaml` | Uses `peter-evans/create-pull-request` |

## HOW IT WORKS

1. `generateMetadata(token)` lists all org repos via `octokit.paginate`
2. For each repo, probes `repos.getContent` for `.github/workflows/renovate.yaml`
3. Repos with Renovate → `metadata.repositories['with-renovate']` array
4. Writes `metadata/renovate.yaml` via `js-yaml` `dump()`

## WORKFLOW INTEGRATION

- **Trigger**: daily at midnight UTC (`0 0 * * *`) or manual dispatch
- **Uses local action path**: `./.github/actions/update-metadata` (no self-checkout — only runs in this repo)
- **Job-level permissions**: `contents: write, pull-requests: write` (safe — not a reusable workflow)
- **Changeset target**: `@bfra.me/.github` (correct — output is `metadata/renovate.yaml` at repo root, not inside this package)
- **PR branch**: `ci/update-metadata` with auto-delete

## CONVENTIONS

- Same build toolchain as other actions: `tsup` → `dist/index.js`
- `dist/` committed for GitHub Actions runtime
- Errors handled via `core.setFailed()`
- Org name derived from `GITHUB_REPOSITORY` env var, falls back to `bfra-me`

## COMMANDS

```bash
pnpm build     # tsup → dist/index.js
pnpm test      # vitest run
```
