---
"@bfra.me/.github": patch
---

Migrate deprecated `contexts` field to `checks` in branch protection

The `contexts` field in branch protection settings is deprecated. This change
migrates to the newer `checks` format using the context property.

- Update .github/settings.yml to use checks format
- Maintain all existing status check requirements
- Fixes GitHub API deprecation warning

refs: https://docs.github.com/en/rest/branches/branch-protection#update-branch-protection
