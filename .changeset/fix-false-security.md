---
'renovate-changesets': patch
---

Fix false security classification triggered by OpenSSF Scorecard badge URLs in Renovate PR bodies

- Strip URLs and markdown link targets from PR content before checking security keywords
- Prevents badge URLs like `securityscorecards.dev` from triggering false positives
