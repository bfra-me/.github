---
"@bfra.me/.github": patch
---

Add `commitMessageTopic` to Renovate config for action path visibility in PRs and changesets

Configure `commitMessageTopic` for `renovate-changesets` and `update-repository-settings` actions
so that Renovate PRs and changesets clearly identify the specific action being updated instead of
only showing the repository name (`bfra-me/.github`).

Before: `chore(deps): update bfra-me/.github to v0.1.2`
After: `chore(deps): update action update-repository-settings to v0.1.2`

Also update the `renovate-changesets` action parser to correctly extract the action name from PR
titles that include the `update action <name>` phrase (produced by `commitMessageTopic`).
