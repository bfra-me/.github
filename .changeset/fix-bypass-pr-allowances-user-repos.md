---
"update-repository-settings": patch
---

Fix 422 error when configuring branch protection on user-owned repositories

The action no longer sends `users` and `teams` fields in `bypass_pull_request_allowances`, `dismissal_restrictions`, and `restrictions` for non-organization repositories, as GitHub's API rejects these fields for user-owned repos.
