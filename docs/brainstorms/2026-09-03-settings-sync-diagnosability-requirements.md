---
date: 2026-09-03
topic: settings-sync-diagnosability
---

# Settings Sync Diagnosability

## Summary

Make `update-repository-settings` failures diagnosable instead of silent: surface what the GitHub API actually returned, and verify after each run that the repository matches the config it was given. Retrying server errors ships alongside, as instrumentation whose value the diagnostics will confirm or refute.

---

## Problem Frame

`update-repository-settings` applies settings-as-code across the `@bfra-me` organization. When a plugin fails, `applySettings` collapses the error to `err.message` and re-throws an aggregate. For a GitHub 500 whose message is empty, the operator sees:

```text
##[error]Failed to apply branches settings:
##[error]Failed to apply settings:
```

An empty bullet. No status, no response body, no request ID, no indication of which field or request failed.

`bfra-me/ha-addon-repository` has been failing this way since 2026-08-24 — **14 of its last 60 sync runs, 23%**. Every sampled failure is the same shape: `PUT /repos/bfra-me/ha-addon-repository/branches/main/protection` returning 500 after 8273ms, 8234ms, and 8324ms on three separate days. A ±50ms band across days is hard to explain as random load.

Diagnosing it required replaying the API calls by hand. That cost is paid again every time a repository in the org fails this way, and the org has many repositories under the same workflow.

The status code and request ID are in fact present in the job log — Octokit's bundled request logger emits them. They are absent from the action's own error, which is what an operator reads first and what any downstream alerting would capture.

A settings-sync failure is not a self-contained CI failure. It means a repository's configuration no longer matches its declared config, and the divergence persists until someone notices.

---

## Key Flows

- F1. Branch protection sync succeeds at the API but diverges from intent
  - **Trigger:** A scheduled or dispatched settings sync run.
  - **Steps:** The action merges current protection with declared config, issues the update, receives a success response, and reports success.
  - **Outcome:** The run is green. Whether the repository actually matches the declared config is unverified — GitHub accepts requests and silently drops fields it does not support for the repository's plan or ownership type.
  - **Covered by:** R5, R6, R7

- F2. Branch protection sync fails and the operator diagnoses it
  - **Trigger:** The update returns a server error.
  - **Steps:** The action captures the failure, reports it, and the operator reads the job log.
  - **Outcome:** The operator can tell which request failed, what the API returned, what was sent, and which of the other setting types applied — without replaying API calls by hand.
  - **Covered by:** R1, R2, R3, R4, R8

---

## Requirements

**Error reporting**

- R1. When a plugin fails, the reported error includes the HTTP status when the underlying error carries one.
- R2. When a plugin fails with a response body, a redacted and length-bounded form of that body is included in the reported error. The error reaches `core.error`, which renders in normal job logs on public repositories, so redaction belongs in the requirement rather than in planning.
- R3. When a plugin fails on a GitHub request, the GitHub request ID is included in the reported error.
- R4. The aggregate failure names which setting types applied successfully and which did not, not only the failures.
- R5. Before each branch-protection update, a scrubbed subset of the request payload is logged at debug level. The payload merges declared config with current state read from the API, so it can carry team slugs and app bypass entries that the published config does not.

**Applied-state verification**

- R6. After each branch-protection update, the action reads back the applied protection and compares it against declared intent using an explicit equivalence rule naming which fields are ignored, normalized, or compared structurally.
- R7. Divergence between applied state and declared intent is reported, and does not fail the run.
- R8. Verification covers branch protection only. Repository, labels, and teams settings are not read back.

**Retry**

- R9. Branch-protection updates retry on server errors, bounded to a small number of attempts.
- R10. Each retry attempt is logged with its attempt number and the error that triggered it, so retry effectiveness is measurable from job logs.

**Regression coverage**

- R11. A test asserts that a plugin failure carrying status and response data produces a non-empty, informative aggregate error.
- R12. A test asserts that read-back divergence is reported without failing the run.
- R13. A fixture proves that expected GitHub read-versus-write shape differences produce no reported divergence.
- R14. A test asserts that a server error triggers a bounded retry and that each attempt is logged with its attempt number and triggering error.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R3.** Given a branch-protection update that returns 500 with an empty message, when the run fails, the reported error names the status, the request ID, and a redacted bounded response body if present — not an empty bullet.
- AE2. **Covers R4.** Given a run where repository, labels, and teams apply cleanly but branches fails, when the aggregate error is reported, it states that three setting types applied and one did not.
- AE3. **Covers R6, R7.** Given a branch-protection update that GitHub accepts but partially ignores, when the run completes, the divergence is reported and the run's conclusion is success.
- AE4. **Covers R9, R10.** Given a branch-protection update that returns 500 on the first attempt and succeeds on the second, when the run completes, both attempts are visible in the log and the run succeeds.

---

## Success Criteria

- An operator reading a failed sync log can tell which request failed, what the API returned, and what was sent — without replaying API calls by hand.
- Retry effectiveness is measurable from job logs as a success-after-retry rate: runs where a branch-protection update failed at least once and then succeeded, over all runs where it failed at least once.
- Read-back divergence data exists for runs that currently report success, making it possible to judge whether the existing merge and cleanup logic produces the configuration it claims to.
- A planner reading this document does not need to invent what is reported, what is verified, or what fails the run.

---

## Scope Boundaries

- The deprecated `app-id` input on `actions/create-github-app-token` ships as a separate issue and PR. It spans eight workflow files and is unrelated to this failure mode.
- Read-back verification does not gate the run in this iteration. Whether divergence should fail a run is decided after the reporting produces data.
- Verification is not extended to repository, labels, or teams settings.
- Root-causing GitHub's server-side 8.3-second failure is out of scope. It is upstream and not fixable here.

---

## Key Decisions

- **Diagnostics are the primary requirement; retry is a hypothesis.** Three same-duration failures are a hypothesis of a deterministic server-side timeout, not a finding — three samples cannot separate a fixed upstream timeout from queueing or a slow downstream dependency. A retry that succeeds after a delayed attempt falsifies it. If the hypothesis holds, retry repeats the failure at triple the cost; it ships because it is cheap and may help, and the diagnostics settle it.
- **Read-back reports before it enforces.** Gating on divergence from day one risks false failures, because GitHub's read response shape differs from the update payload — `sanitizeBranchProtection` exists to bridge exactly that gap. Reporting first produces the evidence needed to make gating safe.
- **Verification is scoped to branch protection.** That is where the failures are, and where GitHub's silent field-dropping is documented behavior. Extending it is a later decision informed by whether the first implementation produces signal or noise.
- **The `app-id` deprecation splits out.** It is org-wide config cleanup, not a production failure, and coupling them would put an eight-file rename in the same review as a bugfix.

---

## Dependencies / Assumptions

- The 500 response body may itself be empty — that is the likely reason `err.message` is empty today. If so, R2 yields nothing and the diagnostic value comes from R3 and R5 instead. This does not weaken those requirements; it is why the payload and request ID are named separately rather than folded into "serialize the error."
- Branch-protection update is a PUT and idempotent by definition, so retry is safe with respect to the API contract. Read-back is what confirms it in practice.
- Octokit's bundled request logger already emits status, request ID, and duration. The requirements move that information into the action's own error rather than introducing it.
- `bfra-me/ha-addon-repository` continues to reproduce the failure at a rate high enough to validate the fix within days.

---

## Outstanding Questions

### Deferred to Planning

- **Affects R6, R7** · _Needs research_ — What counts as acceptable divergence between read-back and declared intent? GitHub returns fields never set by the config, so a naive comparison reports drift on every run. `sanitizeBranchProtection` and `cleanupMergedProtection` encode part of this already and are the starting point.
- **Affects R9** · _Technical_ — How many retry attempts, and what backoff? Each attempt currently costs ~8s, so the ceiling is bounded by acceptable job duration rather than by the usual transient-error reasoning.
- **Affects R9** · _Technical_ — Retry at the Octokit client level or around the single call? A client-level plugin covers other transient calls for free; a local wrapper keeps the blast radius smaller.
- **Affects R2, R5** · _Technical_ — What specific truncation bound and redaction rules satisfy R2 and R5? The requirement to redact is settled; the exact rules are not.

---

## Sources / Research

- `.github/actions/update-repository-settings/src/plugins/index.ts:61-65` — the catch that keeps only `err.message`; `:69` builds the aggregate bullets.
- `.github/actions/update-repository-settings/src/plugins/branches.ts:63-68` — the unretried `updateBranchProtection` call. `:80` `sanitizeBranchProtection` and `:61` `cleanupMergedProtection` encode the known read-vs-write shape differences.
- `.github/actions/update-repository-settings/src/index.ts:10` — `new Octokit({auth: token})`, no retry or throttling plugins. Action dependencies are `@actions/core`, `@actions/github`, `@octokit/rest`, `js-yaml`.
- Failing runs in `bfra-me/ha-addon-repository`: `33466423792` (8273ms), `33595589965` (8234ms), `33540051450` (8324ms). Failure rate 14/60 across the last 60 runs of the `Update Repo Settings` workflow.
- `bfra-me/ha-addon-repository#569` — the originating report.
- `bfra-me/.github#2667` — the issue this document refines, including its triage comment.
