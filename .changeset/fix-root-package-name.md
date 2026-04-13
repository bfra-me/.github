---
"renovate-changesets": patch
---

Fix `getRootPackageName` to include private workspace roots in the resolution order, reverting the #2012 regression that caused changesets to use the repo slug (`.github`) instead of the root package name (`@bfra.me/.github`).
