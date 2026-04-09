---
"renovate-changesets": patch
---

Replace hardcoded bot allowlist with suffix check to support external Renovate runners

The action previously used a hardcoded list (`['renovate[bot]', 'bfra-me[bot]']`) to
identify Renovate PRs, which rejected valid PRs from external bot accounts such as
`mrbro-bot[bot]`. Both `run-init.ts` and `renovate-pr-context-extractor.ts` now use
`login.endsWith('[bot]')` instead, consistent with the fix from #1990. The branch
prefix check (`isValidBranch`) still provides the second gate to ensure it is a
Renovate branch.
