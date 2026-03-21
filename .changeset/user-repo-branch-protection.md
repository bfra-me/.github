---
"update-repository-settings": patch
---

Fix branch protection for user-owned repos: force `restrictions` to `null` (entire field is org-only) and fully remove `dismissal_restrictions` (GitHub docs: "Omit this parameter for personal repositories") instead of only stripping `users`/`teams` sub-fields.
