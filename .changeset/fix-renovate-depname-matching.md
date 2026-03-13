---
"@bfra.me/.github": patch
---

Fix Renovate `matchDepNames` for internal actions to use the actual `depName` (`bfra-me/.github`) instead of the full subdirectory path. Adds `matchFileNames` to scope `extractVersion` patterns per action, enabling proper release-based version tracking and stopping self-referential digest update PRs.
