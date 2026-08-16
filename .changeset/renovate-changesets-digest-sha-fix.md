---
'renovate-changesets': patch
---

Fix Docker digest updates using short commit SHAs that could fail changeset generation. Digest rows are now detected from Renovate's `Update` column, with a corrected hex fallback for bodies without that column.
