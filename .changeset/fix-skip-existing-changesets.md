---
'renovate-changesets': patch
---

Fix changeset regeneration and version display for major updates

- Remove early exit when changeset files already exist on the PR branch, allowing the action to always regenerate with the latest logic
- Sync enhanced detector versions (inline version comments like `# 9.0.0`) back into prContext.dependencies before summary generation, fixing missing version text in changeset bodies
