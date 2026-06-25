# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-13 **Branch:** main

## OVERVIEW

Organization defaults, reusable workflows, custom GitHub Actions, and workflow templates for the @bfra-me GitHub organization. Treated as a full TypeScript monorepo with pnpm workspaces, not just static config files.

## STRUCTURE

```
./
├── .github/
│   ├── actions/
│   │   ├── renovate-changesets/   # Complex action: auto-generates changesets for Renovate PRs (125 src files)
│   │   ├── update-metadata/       # Simple action: generates/updates repo metadata (1 src file)
│   │   └── update-repository-settings/ # Plugin-based action: syncs repo settings from YAML config
│   ├── workflows/                 # 16 workflows: CI/CD, Fro Bot agent, Copilot setup, security scanning
│   ├── instructions/              # Dev guidelines consumed by AI assistants and code review
│   └── settings.yml               # Repo settings via Repository Settings App
├── workflow-templates/            # Org-wide workflow templates (with .properties.json metadata)
├── scripts/                       # TypeScript utilities (tsx): release, build perf, workspace validation
├── docs/
│   ├── workflows/                 # Workflow documentation and troubleshooting
│   └── solutions/                 # Solved-problem documentation (learnings, patterns)
├── metadata/                      # Renovate config shared across org repos
├── common-settings.yaml           # Org-wide repo settings and labels
└── profile/                       # GitHub org profile README
```

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Add/edit CI workflow | `.github/workflows/` | Pin actions to SHA. Use `bfra-me[bot]` app auth |
| Fro Bot agent config | `.github/workflows/fro-bot.yaml` | Single workflow: PR review + one daily oversight/autoheal pass (repo + org). Prompts in env vars |
| Copilot coding agent | `.github/workflows/copilot-setup-steps.yaml` | Setup steps for Copilot agent. Instructions in `copilot-instructions.md` |
| Create org workflow template | `workflow-templates/` | Requires matching `.properties.json` |
| Modify renovate-changesets action | `.github/actions/renovate-changesets/` | Has own AGENTS.md. Build with `pnpm build` |
| Modify update-metadata action | `.github/actions/update-metadata/` | Has own AGENTS.md |
| Modify update-repository-settings action | `.github/actions/update-repository-settings/` | Has own AGENTS.md. Build with `pnpm build` |
| Add/edit automation script | `scripts/` | Use `#!/usr/bin/env tsx`. Follow existing patterns |
| Change org-wide Renovate config | `metadata/renovate.yaml` | Inherited by all org repos |
| Change THIS repo's Renovate config | `.github/renovate.json5` | Extends bfra-me/renovate-config |
| Edit repo settings | `.github/settings.yml` + `common-settings.yaml` | Applied by update-repository-settings action |
| Add dev guidelines | `.github/instructions/` | `*.instructions.md` format |
| Release | `scripts/release.ts` | Multi-package tagging: private=`v{ver}`, public=`{name}@{ver}` |

## CONVENTIONS

- **Actions pinned to commit SHAs** — never floating tags (`@main`, `@v1`)
- **Changesets created manually** — `DO NOT` use `pnpm changeset` CLI (creates inconsistent format)
- **Changesets scoped to closest package** — target the package being changed (`renovate-changesets`, `update-metadata`, `update-repository-settings`). Only use `@bfra.me/.github` for root-level changes (reusable workflows, scripts, repo config)
- **ESM only** — `"type": "module"` everywhere, `import`/`export` syntax
- **Shared configs** — `@bfra.me/eslint-config`, `@bfra.me/prettier-config`, `@bfra.me/tsconfig`
- **GitHub App auth** — `bfra-me[bot]` via `actions/create-github-app-token` for automated workflows
- **120 char line limit** — enforced via `.editorconfig`
- **2-space indent** — for TS/JS/JSON/YAML/Markdown
- **Vitest exclusively** — no Jest. Coverage thresholds: 80% statements/functions/lines, 75% branches
- **Workspace scripts via tsx** — `#!/usr/bin/env tsx`, function-based, typed with interfaces
- **Self-checkout pattern** — reusable workflows that call internal actions use `GITHUB_WORKFLOW_REF` to resolve the correct ref for cross-repo checkout (not `github.workflow_sha`, which resolves to the caller's SHA)

## ANTI-PATTERNS (THIS PROJECT)

- `pnpm changeset` CLI — use manual `.changeset/*.md` files
- Floating action versions — always pin to SHA with version comment
- Hardcoded secrets — use GitHub Secrets + App tokens
- Workflow templates without `.properties.json` — GitHub requires metadata
- `contexts` in branch protection — deprecated, use `checks` instead
- Cancelling Renovate jobs that push to main
- `@ts-ignore` / `as any` — strict TypeScript enforced
- `github.workflow_sha` for cross-repo checkout — resolves to caller's SHA in `workflow_call`; use `GITHUB_WORKFLOW_REF` instead

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

## WORKSPACE

- **4 packages**: root (`@bfra.me/.github`) + 3 actions (renovate-changesets, update-repository-settings, update-metadata)
- **Root in workspace** — `packages: ["."]` with `ignoreWorkspaceRootCheck: true` (uncommon but intentional)
- **Aggressive hoisting** — `shamefullyHoist: true` for faster installs
- **No inter-package deps** — actions are self-contained; root provides shared dev tooling
- **Parallel builds** — `pnpm -r run build` (no dependency ordering needed)

## NOTES

- `dist/` directories are committed for actions (GitHub requires pre-built JS)
- Root `tsconfig.json` uses `noEmit: true` — type-checking only. Actions have own build configs
- `scripts/release.ts`: monorepo root package is tagged as `v{ver}` (private), but also logs `{name}@{ver}` so the Changesets action can detect it as a published package
- All actions use Node.js 24 runtime (`using: node24` in action manifests)
- All action manifests use `action.yaml` (standardized)
- `.github/instructions/` files are consumed by AI tools, not by build system
- `pnpm` overrides: `jiti` pinned to `<2.7.0` (compatibility), `undici@<6.23.0` forced to `>=6.23.0`
- Fro Bot uses `FRO_BOT_PAT` + `OPENCODE_AUTH_JSON` secrets (separate from `bfra-me[bot]` app)
- Fro Bot runs one daily unified pass (cron `30 15 * * *`) that does both proactive oversight (detect/report) and reactive autohealing (fix safe), for this repo and across the bfra-me org; there is no separate maintenance schedule or org-autoheal workflow
- Fro Bot uses ONE perpetual report issue titled `Daily Fro Bot Report` (the prompt closes superseded `Daily Maintenance Report`, `Daily Autohealing Report`, and `Org Autohealing Report` issues into it)
- Org-wide scanning can be narrowed to one repo via the `target-repo` workflow_dispatch input
- `copilot-instructions.md` references AGENTS.md — keep both in sync
- Reusable workflows resolve action code via self-checkout at `GITHUB_WORKFLOW_REF` — no hardcoded SHA pins needed for internal actions
- `update-metadata.yaml` workflow uses local action path without self-checkout pattern (action only runs in this repo)
