---
'@bfra.me/.github': patch
---

Auto-update internal action SHA pins during release

- When `renovate-changesets` or `update-repository-settings` is released, automatically update the SHA pin and version comment in the corresponding workflow file
- Eliminates the Renovate follow-up PR that previously updated the SHA pin, which generated an unnecessary patch changeset and extra release cycle
