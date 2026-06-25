---
'@bfra.me/.github': patch
---

Fix `fro-bot` workflow skipping `issue_comment` events on pull requests. The
`if` condition's `github.event.issue.pull_request == null` clause (added during
PR-fork hardening) filtered out `@fro-bot` mentions on PR conversation threads,
because GitHub populates `issue.pull_request` (with the PR URL) for any comment
on a PR. The clause has been removed; the top-level fork-hardening and
`author_association` (`OWNER`/`MEMBER`/`COLLABORATOR`) check still gate
untrusted triggers.

Also add an explicit "DELIVERY CONTRACT" to the `AUTOHEAL_PROMPT` so future
dispatched runs always finish with `git push` + `gh pr create` instead of
stopping at "the caller will push" — the caller is the agent itself.
