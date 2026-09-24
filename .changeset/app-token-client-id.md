---
'@bfra.me/.github': patch
---

Reusable workflows mint GitHub App tokens with the caller's `APPLICATION_CLIENT_ID` variable when it is set, falling back to the `APPLICATION_ID` secret otherwise. `APPLICATION_ID` is now optional for `renovate-changeset`, `update-repo-settings`, and `trigger-org-renovate`; `renovate` still requires it for renovate-action.
