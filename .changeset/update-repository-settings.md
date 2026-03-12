---
"@bfra.me/.github": minor
---

Add `update-repository-settings` action replacing `elstudio/actions-settings` with direct Octokit API calls. Fixes `TypeError: this.topics.split is not a function` when `repository.topics` is a YAML array.
