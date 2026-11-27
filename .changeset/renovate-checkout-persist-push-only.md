---
'@bfra.me/.github': patch
---

Persist the Renovate workflow's checkout credentials only for push runs, where the path filter fetches over them, so other events no longer leave the job token in the workspace git config
