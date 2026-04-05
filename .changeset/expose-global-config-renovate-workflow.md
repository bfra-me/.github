---
"@bfra.me/.github": minor
---

Expose `global-config` input in reusable Renovate workflow

Add a `global-config` input to the `workflow_call` and `workflow_dispatch` triggers in `.github/workflows/renovate.yaml` and pass it through to `bfra-me/renovate-action`. This allows consuming repositories to configure global-only Renovate options such as `gitNoVerify`.
