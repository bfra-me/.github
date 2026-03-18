---
'renovate-changesets': patch
---

Fix false security classification triggered by OpenSSF Scorecard badge URLs in Renovate PR bodies

- Strip URLs and markdown link targets from text before checking security keywords, preventing badge URLs like `securityscorecards.dev` from triggering false positives
- Tighten security keyword matching: require "security update", "security fix", or "security patch" instead of bare "security" which matched too broadly; remove bare "critical" which matched non-security contexts
