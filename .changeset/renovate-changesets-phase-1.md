---
'renovate-changesets': patch
---

Remove the unused Go, JVM, and Python detection paths. No consumer repository used them; restore them on request.
The `auto-resolve-conflicts` and `skip-current-pr-in-group` inputs now honour configured `false` values.
