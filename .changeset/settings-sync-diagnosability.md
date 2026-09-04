---
'update-repository-settings': minor
---

Report what the GitHub API actually returned when a settings plugin fails, verify that branch protection was applied, and retry transient server errors.

Plugin failures previously collapsed to `err.message`, so a 500 with an empty message rendered as an empty bullet. Failures now carry the status, the GitHub request ID, and a redacted response body, and the aggregate names which setting types applied alongside those that did not. The branch-protection payload is logged at debug level with principal-identifying fields scrubbed.

After each successful branch-protection update, the applied protection is read back and compared against the declared config. Divergence surfaces as a warning and a job summary row; it never fails the run.
