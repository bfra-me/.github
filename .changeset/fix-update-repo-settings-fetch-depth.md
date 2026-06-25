---
'@bfra.me/.github': patch
---

Fix intermittent `git exit 128` in the `update-repo-settings` reusable workflow's `Filter Changed Files` step on push events. The push-event checkout now uses `fetch-depth: 0` so `dorny/paths-filter` always has the history it needs to diff against the parent commit, instead of the default shallow clone that could fail the diff.
