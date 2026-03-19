---
'renovate-changesets': patch
---

Fix composite action name extraction and cap GitHub Actions changeset type at patch

- Normalize composite action references (`owner/repo/path/to/action-name`) to extract just the last path segment as the dependency name, preventing phantom duplicates from full-path vs short-name mismatches
- Cap GitHub Actions changeset type at `patch` (matching the configured `changesetType`), preventing minor/major escalation for root package workflow reference updates
