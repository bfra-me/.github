---
'renovate-changesets': patch
---

Grouped multi-package changesets were silently dropped when `@changesets/write` failed, such as when a consumer's Prettier config could not be resolved. They now fall back to manual creation like single-package changesets already did.
