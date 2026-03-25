---
"@bfra.me/.github": patch
---

Fix self-checkout in reusable workflows: use `GITHUB_WORKFLOW_REF` to resolve the correct ref instead of `github.workflow_sha`, which resolves to the caller's SHA during `workflow_call`.
