---
"@bfra.me/.github": patch
---

Fix version extraction for internal actions by using `matchDepNames` instead of `matchPackageNames` in `renovate.json5`. For GitHub Actions with subdirectory paths, `depName` includes the full path (e.g., `bfra-me/.github/.github/actions/renovate-changesets`), while `matchPackageNames` only matches the normalized `owner/repo` format.
