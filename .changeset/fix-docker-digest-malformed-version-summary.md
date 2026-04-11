---
'renovate-changesets': patch
---

Fix malformed version summaries for Docker digest-only updates.

When Renovate opens a digest-only PR for a Docker image pinned with a floating tag
(e.g. `image:latest@sha256:6a454fe...`), `VERSION_PATTERN` in the dependency extractor
previously matched the leading digit `6` of the hex digest as a bare version number.
This produced changeset summaries like `to v6 (6)` instead of omitting the version text.

Two targeted fixes:

1. Add `(?!\w)` negative lookahead to `VERSION_PATTERN` so a single digit that is
   immediately followed by a word character (e.g. the `a` in `6a454fe`) is not
   extracted as a version. Major-only versions with a `v` prefix (e.g. `v4`) are
   unaffected since the digit is followed by whitespace or end-of-string.

2. In `formatVersionText`, omit the redundant parenthetical when `newVersion` equals
   the extracted `majorVersion` (i.e. it is already a single-digit major-only value
   like `4`). This changes `to v4 (4)` → `to v4`, which is cleaner regardless of
   how the version was sourced.
