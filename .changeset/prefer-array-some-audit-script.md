---
"@bfra.me/.github": patch
---

Use `.some()` instead of `.find()` when checking whether a workspace dependency resolves to another workspace package in `scripts/audit-typescript-references.ts`. The matched package was only used as an existence check, so the lookup now short-circuits instead of scanning for a value it discarded.
