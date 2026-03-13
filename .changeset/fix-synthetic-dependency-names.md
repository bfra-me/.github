---
'@bfra.me/renovate-changesets': patch
---

Fix changeset body formatting to remove synthetic dependency names

The renovate-changesets action was generating changeset bodies with
synthetic dependency names like "npm-dependencies", "pnpm-dependencies",
and "github-actions-dependencies" instead of actual package names.

This fix:
- Disables file-based dependency extraction that generated synthetic names
- Adds filtering to remove any remaining synthetic patterns
- Ensures only real dependency names from PR title/body parsing appear in changesets

This resolves issues where changesets showed:
"Update unknown dependencies: lint-staged, npm-dependencies, pnpm-dependencies"
When they should show:
"Update dependency `lint-staged` to `16.3.3`."