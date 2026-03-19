---
'renovate-changesets': patch
---

Cap changeset type by per-manager config instead of using raw bump decision

- The bump decision engine's output (e.g., `minor` for a 4.11→4.12 semver impact) is now capped by the configured `changesetType` for the detected manager (e.g., `patch` for `github-actions`)
- Fixes changesets being generated as `minor` when the config specifies `patch` for that update type
