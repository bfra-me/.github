---
'@bfra.me/.github': patch
---

Use local action reference instead of pinned remote action in renovate-changeset workflow

This prevents Renovate from creating PRs on every push to `main` in the `.github` repo.
The workflow now uses `./.github/actions/renovate-changesets` (local path) instead of
`bfra-me/.github/.github/actions/renovate-changesets@<sha>`.