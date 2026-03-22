---
"@bfra.me/.github": patch
---

Fix branch protection for user-owned repos: force `restrictions` to `null` and fully remove `dismissal_restrictions` and `bypass_pull_request_allowances` — the GitHub API rejects all three fields entirely for personal repositories, not just the `users`/`teams` sub-fields.
