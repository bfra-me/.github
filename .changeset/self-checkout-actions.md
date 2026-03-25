---
"@bfra.me/.github": minor
---

Replace hardcoded SHA pins for internal actions in reusable workflows with self-checkout at `github.workflow_sha`. Actions now always match the workflow version — no timing gap, no recursive release cycle, no separate "update internal action SHA pins" automation needed for action packages.
