# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-10
**Commit:** 371e4b5
**Branch:** main

## OVERVIEW

Organization defaults, reusable workflows, custom GitHub Actions, and workflow templates for the @bfra-me GitHub organization. Treated as a full TypeScript monorepo with pnpm workspaces, not just static config files.

## STRUCTURE

```
./
├── .github/
│   ├── actions/
│   │   ├── renovate-changesets/   # Complex action: auto-generates changesets for Renovate PRs (21 src files)
│   │   └── update-metadata/       # Simple action: generates/updates repo metadata (1 src file)
│   ├── workflows/                 # 14 CI/CD workflows for THIS repo
│   ├── instructions/              # Dev guidelines consumed by AI assistants and code review
│   └── settings.yml               # Repo settings via Repository Settings App
├── workflow-templates/            # Org-wide workflow templates (with .properties.json metadata)
├── scripts/                       # TypeScript utilities (tsx): release, build perf, workspace validation
├── docs/workflows/                # Workflow documentation and troubleshooting
├── metadata/                      # Renovate config shared across org repos
├── .ai/plan/                      # AI implementation plans (not code)
├── common-settings.yaml           # Org-wide repo settings and labels
└── profile/                       # GitHub org profile README
```

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Add/edit CI workflow | `.github/workflows/` | Pin actions to SHA. Use `bfra-me[bot]` app auth |
| Create org workflow template | `workflow-templates/` | Requires matching `.properties.json` |
| Modify renovate-changesets action | `.github/actions/renovate-changesets/` | Has own AGENTS.md. Build with `pnpm build` |
| Modify update-metadata action | `.github/actions/update-metadata/` | Has own AGENTS.md |
| Add/edit automation script | `scripts/` | Use `#!/usr/bin/env tsx`. Follow existing patterns |
| Change org-wide Renovate config | `metadata/renovate.yaml` | Inherited by all org repos |
| Change THIS repo's Renovate config | `.github/renovate.json5` | Extends bfra-me/renovate-config |
| Edit repo settings | `.github/settings.yml` + `common-settings.yaml` | Applied by elstudio/actions-settings |
| Add dev guidelines | `.github/instructions/` | `*.instructions.md` format |
| Release | `scripts/release.ts` | Multi-package tagging: private=`v{ver}`, public=`{name}@{ver}` |

## CONVENTIONS

- **Actions pinned to commit SHAs** — never floating tags (`@main`, `@v1`)
- **Changesets created manually** — `DO NOT` use `pnpm changeset` CLI (creates inconsistent format)
- **ESM only** — `"type": "module"` everywhere, `import`/`export` syntax
- **Shared configs** — `@bfra.me/eslint-config`, `@bfra.me/prettier-config`, `@bfra.me/tsconfig`
- **GitHub App auth** — `bfra-me[bot]` via `actions/create-github-app-token` for automated workflows
- **120 char line limit** — enforced via `.editorconfig`
- **2-space indent** — for TS/JS/JSON/YAML/Markdown
- **Vitest exclusively** — no Jest. Coverage thresholds: 80% statements/branches/functions/lines
- **Workspace scripts via tsx** — `#!/usr/bin/env tsx`, function-based, typed with interfaces

## ANTI-PATTERNS (THIS PROJECT)

- `pnpm changeset` CLI — use manual `.changeset/*.md` files
- Floating action versions — always pin to SHA with version comment
- Hardcoded secrets — use GitHub Secrets + App tokens
- Workflow templates without `.properties.json` — GitHub requires metadata
- `contexts` in branch protection — deprecated, use `checks` instead
- Cancelling Renovate jobs that push to main
- `@ts-ignore` / `as any` — strict TypeScript enforced

## COMMANDS

```bash
pnpm bootstrap                    # Install deps (prefer-offline)
pnpm run quality-check            # type-check + lint + build + test (full CI loop)
pnpm run fix                      # Auto-fix ESLint issues
pnpm build                        # Build all workspace packages
pnpm test                         # Vitest run
pnpm run type-check               # tsc --noEmit
pnpm run lint                     # ESLint
pnpm run release                  # Multi-package release with tag management
pnpm run workspace:validate       # Dependency analysis + consistency check
pnpm run build:monitor            # Build performance analysis
```

## NOTES

- `dist/` directories are committed for actions (GitHub requires pre-built JS)
- Root `tsconfig.json` uses `noEmit: true` — type-checking only. Actions have own build configs
- HACK in `scripts/release.ts`: monorepo root tagged as `{name}@{ver}` format (workaround)
- `common-settings.yaml` has deprecated `contexts` field — migrate to `checks`
- `.github/instructions/` files are consumed by AI tools, not by build system
- `pnpm` override: `jiti` pinned to `<2.7.0` due to compatibility issue
