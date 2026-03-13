---
"renovate-changesets": patch
---

Fix changeset summary generation for GitHub Actions dependency updates: infer `github-actions`
manager from workflow files when title/commit parsing yields `unknown`, support major-only version
targets (e.g. `to v4`), extract dependency versions from Renovate markdown tables, and filter
spurious tokens like `update` from the dependency list.
