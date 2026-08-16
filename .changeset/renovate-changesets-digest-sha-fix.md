---
'renovate-changesets': patch
---

Fix Docker digest updates using short commit SHAs that could fail changeset generation. Digest rows are now detected from Renovate's `Update` column, with a corrected hex fallback for bodies without that column. Also fix Docker and GitHub Actions updates being labelled as npm and package names containing markdown links being written raw into changesets.
