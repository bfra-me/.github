---
'@bfra.me/.github': patch
---

Reusable workflows mint GitHub App tokens with the caller's `APPLICATION_CLIENT_ID` variable when it is set, falling back to the `APPLICATION_ID` secret otherwise.
