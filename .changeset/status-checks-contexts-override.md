---
"@bfra.me/.github": patch
---

Fix `update-repository-settings` not updating required status checks when the config uses `contexts`. The GET response includes both `checks` and `contexts` (for backward compatibility), and after deep-merging, the cleanup always deleted `contexts` in favor of `checks` — silently discarding the config's desired status checks.
