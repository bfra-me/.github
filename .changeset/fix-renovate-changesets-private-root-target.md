---
'renovate-changesets': patch
---

Fix `renovate-changesets` action targeting the private workspace root for fallback changesets (e.g. `github-actions` manager updates), which broke `changeset version` for downstream monorepo consumers whose root `package.json` is private and not in the workspace patterns.

`getRootPackageName` now skips private workspace roots and falls back to the first non-private workspace member, then the repo slug. A new `target-package` action input (also exposed on the reusable `renovate-changeset.yaml` workflow) lets consumers explicitly override the changeset release target when "first non-private member" isn't the desired default.

Resolves #2012.
