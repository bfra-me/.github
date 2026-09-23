---
'update-repository-settings': minor
---

`_extends` now merges `labels` and `branches` with the base config by name instead of replacing them. A same-name label replaces the base label; a same-name branch is deep-merged, so overriding only status checks keeps the base's other protection settings. Label deletion is skipped with a warning when a run would delete more labels than it keeps. Duplicate label/branch names now emit a warning instead of silently picking a winner, and a failed label delete or step-summary write no longer fails the whole run.
