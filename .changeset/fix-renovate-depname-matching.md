---
"@bfra.me/.github": patch
---

Fix Renovate config for internal actions: use correct `depName` (`bfra-me/.github`), explicitly disable digest update type to stop recursive self-referencing PRs, and change version comments to bare semver so Renovate can parse `currentValue` for release-based version tracking.
