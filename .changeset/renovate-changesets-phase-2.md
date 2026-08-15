---
'renovate-changesets': patch
---

Derive updates from Renovate's PR body instead of re-deriving them from lockfiles and Dockerfiles. The new `emoji` input defaults to disabled, so summary lines no longer include an emoji by default; set `emoji: true` to restore the previous appearance. PR comment and description risk scores and confidence values are now derived from the bump level, while package names, versions, bump level, and security status remain exact.
