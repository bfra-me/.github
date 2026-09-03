---
title: "fix: Make settings-sync failures diagnosable and verify applied state"
type: fix
status: active
date: 2026-09-03
deepened: 2026-09-03
origin: docs/brainstorms/2026-09-03-settings-sync-diagnosability-requirements.md
---

# fix: Make settings-sync failures diagnosable and verify applied state

## Overview

`update-repository-settings` collapses every plugin failure to `err.message`. A GitHub 500 with an empty message renders as an empty bullet, so an operator learns nothing about which request failed or why. This plan enriches the reported error, logs a scrubbed request payload, verifies that branch protection was actually applied, and retries server errors.

## Problem Frame

The action applies settings-as-code across the `@bfra-me` organization. `applySettings` catches each plugin's error, keeps only `err.message`, and renders the aggregate as `  - ${e.message}` bullets. For a 500 whose message is empty, that produces an empty bullet.

`bfra-me/ha-addon-repository` fails this way in 14 of its last 60 sync runs — 23% — always on `PUT /repos/.../branches/main/protection` returning 500 after roughly 8.3 seconds. Diagnosing it required replaying the API calls by hand.

A settings-sync failure is not a self-contained CI failure. The repository's configuration no longer matches its declared config, and the divergence persists until someone notices (see origin: `docs/brainstorms/2026-09-03-settings-sync-diagnosability-requirements.md`).

## Requirements Trace

- R1. Reported errors include HTTP status when the underlying error carries one.
- R2. Reported errors include a redacted, length-bounded response body.
- R3. Reported errors include the GitHub request ID.
- R4. The aggregate failure names which setting types applied and which did not.
- R5. A scrubbed subset of the branch-protection request payload is logged at debug level.
- R6. Applied branch protection is read back and compared against declared intent using an explicit equivalence rule.
- R7. Divergence is reported and does not fail the run.
- R8. Verification covers branch protection only.
- R9. Branch-protection operations retry on server errors, bounded.
- R10. Each retry attempt is logged with its attempt number and triggering error.
- R11. A test asserts an enriched, non-empty aggregate error.
- R12. A test asserts divergence is reported without failing the run.
- R13. A fixture proves expected read-versus-write shape differences produce no divergence.
- R14. A test asserts bounded retry occurs with per-attempt logging.

## Scope Boundaries

- Verification is not extended to repository, labels, teams, or any other plugin.
- Divergence in fields the config never declares is out of scope and stays undetected. A manual change to `allow_force_pushes` or `allow_deletions` reports clean. Detecting unrequested change is drift detection against a full desired state — a different tool from verifying that a write landed, and one that would generate false positives before any real data exists.
- Divergence does not gate the run. Whether it should is decided after this reporting produces data.
- Root-causing GitHub's server-side failure is out of scope; it is upstream.

### Deferred to Separate Tasks

- The deprecated `app-id` input on `actions/create-github-app-token`: separate issue and PR, spans eight workflow files.

## Context & Research

### Relevant Code and Patterns

- `.github/actions/update-repository-settings/src/plugins/index.ts` — `PLUGIN_REGISTRY` and `applySettings`; the single seam where every plugin error is caught and flattened.
- `.github/actions/update-repository-settings/src/plugins/branches.ts` — `branchesPlugin` reads current protection, normalizes, deep-merges declared config, then issues the update.
- `sanitizeBranchProtection` in the same file normalizes the read shape: drops `url` and `*_url`, unwraps `{enabled}` objects to booleans, prefers `checks` over `contexts`, removes `required_signatures`.
- `cleanupMergedProtection` normalizes the write shape: strips `url`/`contexts_url` from `required_status_checks`, drops `contexts` when `checks` is present, forces `restrictions = null` on user-owned repositories, strips `dismissal_restrictions`, strips org-only users and teams from bypass allowances.
- `.github/actions/update-repository-settings/src/index.ts` — constructs a bare `new Octokit({auth: token})` with no plugins, and collapses failures via `core.setFailed(error.message)`.
- `.github/actions/renovate-changesets/src/git-operations.ts` — the repository's only bounded-backoff retry, for git subprocesses. Adjacent, not directly reusable for HTTP.
- Tests live in `src/plugins/__tests__/`, Vitest, hoisted `vi.mock('@octokit/rest', ...)`, asserting exact mocked REST calls and payloads.

### Institutional Learnings

- `docs/solutions/best-practices/test-fixtures-underspecified-in-ignored-dimension-2026-08-19.md` — a fixture underspecified in the dimension the code ignores encodes the bug it was meant to guard. Directly load-bearing for R13: a "no divergence" fixture that omits the fields GitHub actually reshapes proves nothing.
- `docs/solutions/best-practices/contract-testing-actions-that-run-in-foreign-repos-2026-08-19.md` — local success is not evidence for an action that runs in consumer repositories.
- No documented solution exists for error enrichment, 5xx retry, or log redaction in this repository. There is no local prior art to inherit for those.

### External References

- `@octokit/plugin-retry` v7 retries all 4xx/5xx except 400, 401, 403, 404, 410, 422, 451 — so 500 is retried by default. Three attempts, quadratic backoff. Not bundled by `@octokit/rest` v22; compatible with it.
- `RequestError` exposes `status`, `request`, `response`, `response.data`, `response.headers`. The GitHub request ID is reachable at `error.response.headers['x-github-request-id']`.
- `core.debug` output is hidden at display time rather than omitted from log storage, so the debug gate is not an exposure control. `core.setSecret` masking is literal-string based and cannot redact an arbitrary response body.
- Terraform, Pulumi, and Kubernetes converge on the same drift shape: write model → read model → normalized model → compare, with server-populated fields on an explicit ignore list.

### Verified Against the Live API

`GET /repos/bfra-me/.github/branches/main/protection` returns **both** `checks` and `contexts` under `required_status_checks`, while `.github/settings.yml` declares only `checks`. `enforce_admins` returns as an object where the config declares a boolean. A naive read-back diff would report drift on every run for both reasons.

## Prior-Art Survey

```json
{
  "schema_version": 2,
  "verdict": "extend",
  "scope": ".github/actions/update-repository-settings",
  "freshness": {
    "vcs_reference": "9cd0a745",
    "scope_baseline": "workspace-root monorepo; update-repository-settings src/plugins registry + branch-protection normalization; scanned at 2026-09-03"
  },
  "budget": {
    "max_search_passes": 3,
    "max_candidate_inspections": 10,
    "exhausted": false
  },
  "candidates": [
    {
      "path_or_symbol": ".github/actions/update-repository-settings/src/plugins/index.ts::applySettings",
      "description": "Plugin registry dispatcher that owns per-setting plugin execution, logs progress, accumulates failures, and emits the aggregate error for the action seam.",
      "disposition": "extend"
    },
    {
      "path_or_symbol": ".github/actions/update-repository-settings/src/plugins/branches.ts::branchesPlugin",
      "description": "Branch protection sync path that already reads current state, sanitizes read-versus-write shape differences, merges declared config, and writes branch protection.",
      "disposition": "extend"
    },
    {
      "path_or_symbol": ".github/actions/update-repository-settings/src/plugins/branches.ts::sanitizeBranchProtection / cleanupMergedProtection",
      "description": "Normalization helpers that reconcile GitHub branch-protection read and write shape differences before the update.",
      "disposition": "extend"
    },
    {
      "path_or_symbol": ".github/actions/update-repository-settings/src/index.ts::run",
      "description": "Action entrypoint that constructs the Octokit client and collapses thrown errors to a bare message.",
      "disposition": "insufficient",
      "insufficiency_reason": "Owns entrypoint wiring but not diagnostic enrichment, retry policy, or post-write verification."
    },
    {
      "path_or_symbol": ".github/actions/renovate-changesets/src/git-operations.ts::GitOperations",
      "description": "Bounded exponential-backoff retry implementation for git subprocess operations.",
      "disposition": "insufficient",
      "insufficiency_reason": "Retries subprocesses, not HTTP requests; no awareness of status codes or response bodies."
    }
  ]
}
```

## Key Technical Decisions

- **Equivalence is a subset match against declared config, not a full diff.** Only fields the config declares are compared; anything else GitHub returns is ignored. This is what makes the rule survive GitHub adding response fields, and it is the only shape that tolerates the `contexts` mirror confirmed live. The cost is stated in Scope Boundaries: divergence detects fields GitHub dropped, not fields GitHub added unasked.
- **Canonicalization is observed-side only.** The comparison runs raw declared config against a normalized read-back. `sanitizeBranchProtection` is reused to normalize the GitHub response; `cleanupMergedProtection` is not applied to the comparison at all. Normalizing both sides would let a bug in the normalizer distort intent and observation identically, so verification could not see the class of bug it exists to catch — and reusing the write path's merged intent would compare the action against itself rather than against the config.
- **Retry is an Octokit client plugin, not a local wrapper.** `@octokit/plugin-retry` already retries 500 with bounded quadratic backoff, and installing it at the client covers the read-back GET symmetrically. A wrapper around only the update would leave verification fragile against the same transient failures.
- **Read-back runs once per branch, only after the update finally succeeds.** Running it per retry attempt would issue GETs against state that was never written and pollute the log with secondary failures.
- **A read-back failure is a warning, never a run failure.** Verification exists to observe; a fragile observer that fails runs which actually applied their settings is worse than no observer.
- **Redaction is explicit, not delegated to masking.** `core.setSecret` matches literal strings and cannot redact an arbitrary response body.
- **A minimum never-log set is named here, not deferred.** Principal-identifying fields must never reach any log at any level: team slugs, app slugs and IDs, user logins under `restrictions`, bypass allowances, and `dismissal_restrictions`. Redaction runs before truncation, so a bound can never expose a field the denylist would have removed. Branch names and repository identifiers stay in the log — they are already public and removing them makes the diagnostic useless.

## Open Questions

### Resolved During Planning

- Is the request ID reachable from the thrown error? Yes — `error.response.headers['x-github-request-id']`. R3 is implementable as written.
- Does `@octokit/plugin-retry` retry 500? Yes, by default; 500 is not in its `doNotRetry` list.
- Is `checks` actually supported, given the docs still center `contexts`? Yes — confirmed live against this repository. GET returns both.
- Does retry apply to the read-back GET? Yes, symmetrically, as a consequence of installing retry at the client.
- Where is divergence reported? `core.warning` plus a Step Summary table.

### Deferred to Implementation

- The exact truncation bound for response bodies, and the specific key denylist for scrubbing. Both need a real 500 body to calibrate against, and the current sample is empty.
- How per-attempt retry logging (R10) is captured. `@octokit/plugin-retry` logs internally through `octokit.log`; supplying a custom `log` to the constructor is the likely seam. This stays deferred because the package is not installed — confirmed absent from the workspace store — so the hook cannot be read from source until the dependency lands in Unit 2.
- Whether the Step Summary table should aggregate across branches or emit one table per diverging branch. Depends on how noisy real divergence turns out to be.

## High-Level Technical Design

> _This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce._

The ordering of retry, read-back, and error aggregation is the load-bearing part of this plan, and prose spread across three sections does not make it legible. Read-back runs once, after the update finally succeeds; a read-back failure never reaches the aggregate.

```mermaid
sequenceDiagram
  participant Loop as applySettings
  participant BP as branchesPlugin
  participant GH as GitHub

  Loop->>BP: branches config
  loop per declared branch
    BP->>BP: log scrubbed payload (once, pre-retry)
    BP->>GH: PUT protection (retry on 5xx, bounded)
    alt update finally succeeds
      BP->>GH: GET protection (same retry policy)
      alt read-back succeeds
        BP->>BP: normalize observed side only
        BP->>BP: subset match vs raw declared config
        opt divergence
          BP-->>Loop: warning + Step Summary row
        end
      else read-back fails
        BP-->>Loop: warning only, never fatal
      end
    else retries exhausted
      BP-->>Loop: enriched failure (status, request ID, body)
    end
  end
  Loop->>Loop: record per-key outcome
  opt any plugin failed
    Loop-->>Loop: throw aggregate naming applied and failed keys
  end
```

Divergence and failure travel on separate channels by design: divergence reaches warnings and the Step Summary, failures reach the aggregate error. An operator reading the aggregate should never mistake reported drift for the cause of a failure.

## Implementation Units

- [ ] **Unit 1: Enrich plugin error reporting**

**Goal:** Replace the message-only error capture so a failed run names the status, request ID, and a redacted bounded body, and reports which setting types applied.

**Requirements:** R1, R2, R3, R4, R11 (realizes origin AE1, AE2)

**Dependencies:** None

**Files:**

- Create: `.github/actions/update-repository-settings/src/plugins/error-detail.ts`
- Modify: `.github/actions/update-repository-settings/src/plugins/index.ts`
- Test: `.github/actions/update-repository-settings/src/plugins/__tests__/error-detail.test.ts`
- Test: `.github/actions/update-repository-settings/src/plugins/__tests__/index.test.ts`

**Approach:**

- Add a helper that takes an unknown thrown value and produces a diagnostic string: status when present, request ID from the response headers, and a redacted, length-bounded body.
- The helper must degrade cleanly. A plain `Error`, a non-`Error` throw, and a `RequestError` with an empty body all need to produce something more useful than an empty bullet.
- Surface exactly one response header — `x-github-request-id`. Do not serialize `error.response.headers` wholesale; an allowlist of one is the difference between a diagnostic and a header dump.
- The redactor walks nested objects and arrays. A denylisted key buried under `restrictions` or inside a `checks` array must be removed, not missed because the walk only covered top-level keys.
- `applySettings` records per-key outcome as it iterates, and the aggregate names both the applied and the failed keys.

**Patterns to follow:**

- The existing catch and aggregate-throw structure in `applySettings` — extend it, do not restructure the loop.

**Test scenarios:**

- Happy path: an error carrying status, request ID, and a JSON body produces a string containing all three.
- Edge case: an error with status but an empty response body still names the status and request ID, and never renders as an empty string. This is the exact production shape.
- Edge case: a plain `Error` with a message and no response produces the message.
- Edge case: a thrown non-`Error` value produces a usable string rather than `[object Object]`.
- Edge case: a response body longer than the bound is truncated, and the truncation is visible rather than silent.
- Error path: a body containing a denylisted key has that value redacted.
- Error path: redaction runs before truncation — a denylisted value beyond the length bound is still removed rather than merely cut off.
- Edge case: branch and repository names survive redaction; they are diagnostically necessary and already public.
- Edge case: only `x-github-request-id` is surfaced from response headers — an error carrying an `authorization` header produces no trace of it.
- Error path: a denylisted key nested inside an array under `restrictions` is redacted, proving the walk is recursive rather than top-level.
- Happy path: three plugins succeed and one fails; the aggregate names all four with their outcomes.
- Integration: `applySettings` with a mocked failing plugin produces an aggregate whose text is non-empty and contains the status.

**Verification:**

- A simulated 500 with an empty message produces an aggregate error naming the status and request ID.
- The aggregate distinguishes applied setting types from failed ones.

---

- [ ] **Unit 2: Install bounded retry on the Octokit client**

**Goal:** Retry server errors on the action's GitHub requests, bounded, with each attempt visible in the log.

**Requirements:** R9, R10, R14 (realizes origin AE4)

**Dependencies:** None

**Files:**

- Modify: `.github/actions/update-repository-settings/src/index.ts`
- Modify: `.github/actions/update-repository-settings/package.json`
- Test: `.github/actions/update-repository-settings/src/__tests__/index.test.ts`
- Test: `.github/actions/update-repository-settings/src/__tests__/config.test.ts`

**Approach:**

- Add `@octokit/plugin-retry` and construct the client through `Octokit.plugin(retry)`.
- 500 is retried by the plugin's defaults; do not hand-roll a status predicate.
- Bound attempts deliberately. Each failing attempt against the observed endpoint costs roughly 8 seconds, so the ceiling is job duration, not the usual transient-error reasoning.
- Per-attempt logging is the part that needs care — the plugin logs through `octokit.log`, so capturing attempt number and triggering error likely means supplying a custom `log` to the constructor. Verify the seam against the installed version rather than assuming.
- **Update the test mocks first.** `src/__tests__/index.test.ts` and `src/__tests__/config.test.ts` both mock `@octokit/rest` with a plain class exposing no static `plugin()`. Composing the client through `Octokit.plugin(retry)` throws against those mocks, so the suite breaks before any retry logic runs. Give each mock a static `plugin()` passthrough, or mock the composed constructor, as the first change in this unit.

**Patterns to follow:**

- `.github/actions/renovate-changesets/src/git-operations.ts` for the bounded-backoff posture, not its implementation.

**Test scenarios:**

- Happy path: a request failing once with 500 then succeeding resolves, and the run succeeds.
- Happy path: each attempt is logged with its attempt number and the error that triggered it.
- Edge case: retries are bounded — a persistently failing request stops after the configured ceiling rather than retrying indefinitely.
- Error path: a 422 is not retried, confirming client errors terminate immediately.
- Edge case: a successful first attempt logs no retry noise.
- Integration: a non-branches plugin request also retries, confirming the client-wide scope is real and its added call count is bounded.

**Verification:**

- A transient 500 followed by success produces a green run with both attempts visible.
- Total added latency on the failing path stays within the configured bound.

---

- [ ] **Unit 3: Log a scrubbed branch-protection payload**

**Goal:** Make the request that failed inspectable without publishing merged state that the declared config does not already make public.

**Requirements:** R5

**Dependencies:** None

**Files:**

- Modify: `.github/actions/update-repository-settings/src/plugins/branches.ts`
- Test: `.github/actions/update-repository-settings/src/plugins/__tests__/branches.test.ts`

**Approach:**

- Log a scrubbed subset once per branch, before entering the retry loop — not per attempt.
- Scrub rather than log wholesale. The merged payload combines declared config with current state read from the API, so it can carry team slugs and app bypass entries the published config does not.
- Do not treat the debug gate as an exposure control. Debug lines are hidden at display time, not withheld from storage.

**Patterns to follow:**

- The existing `core.info` progress logging in `branchesPlugin`.

**Test scenarios:**

- Happy path: a debug line is emitted once per branch before the update.
- Edge case: two branches in one config produce two debug lines, not one and not four.
- Error path: a payload containing bypass-allowance entries, team slugs, and app IDs has all of them scrubbed from the logged form while the actual request payload is unchanged.
- Error path: principal-identifying fields nested under `restrictions` are scrubbed, not just top-level keys.
- Integration: the logged subset is a strict subset — no key appears in the log that is absent from the payload.

**Verification:**

- The logged form omits the scrubbed keys while the request sent to GitHub still carries them.

---

- [ ] **Unit 4: Branch-protection equivalence rule**

**Goal:** A pure comparison that reports only meaningful divergence, tolerating GitHub's read-shape differences.

**Requirements:** R6, R13

**Dependencies:** None

**Files:**

- Create: `.github/actions/update-repository-settings/src/plugins/branch-protection-equivalence.ts`
- Test: `.github/actions/update-repository-settings/src/plugins/__tests__/branch-protection-equivalence.test.ts`

**Approach:**

- Subset match: walk the declared config and compare each declared field against the normalized read-back. Fields GitHub returns that the config never declared are ignored.
- Normalize the observed side only. Run the read-back through `sanitizeBranchProtection`; compare against the raw declared config, not the merged intent the write path built. Do not apply `cleanupMergedProtection` to either side of the comparison.
- Keep the rule a pure function taking declared intent and read-back state. It is the most test-sensitive part of this plan and should not need an Octokit mock to exercise.

**Execution note:** Implement this unit test-first. The fixture is the deliverable as much as the function — see the test scenarios.

**Patterns to follow:**

- `sanitizeBranchProtection` and `cleanupMergedProtection` in `branches.ts` — reuse them rather than reimplementing their rules.

**Test scenarios:**

- Happy path: a read-back matching the declared config reports no divergence.
- Edge case: a read-back containing **both** `checks` and `contexts` where the config declared only `checks` reports no divergence. This is the live-confirmed shape; a naive diff fails here.
- Edge case: `enforce_admins` returned as `{enabled: true, url: ...}` against a config declaring `true` reports no divergence.
- Edge case: a read-back containing a field the config never declared reports no divergence.
- Error path: a declared field GitHub dropped entirely is reported as divergence.
- Error path: a declared field GitHub applied with a different value is reported as divergence, and the report names the field.
- Edge case: a declared list whose read-back order differs reports no divergence.
- Edge case: an empty declared config compares clean against any read-back.

**Verification:**

- The fixture contains every field class GitHub actually reshapes — the `contexts` mirror, the `{enabled}` wrapper, and a server-populated field. A fixture omitting these would pass while proving nothing, which is the documented failure mode in `docs/solutions/best-practices/test-fixtures-underspecified-in-ignored-dimension-2026-08-19.md`.
- Reverting the equivalence rule to a plain deep-equal turns the representational cases red.

---

- [ ] **Unit 5: Wire read-back and report divergence**

**Goal:** Run verification after a successful update and surface divergence where an operator will see it, without ever failing the run.

**Requirements:** R7, R8, R12 (realizes origin AE3)

**Dependencies:** Unit 4; Unit 2 — the decision that a read-back failure is merely a warning assumes the GET already retried transient failures, so landing Unit 5 first would make verification fragile against the exact errors it is meant to observe through

**Files:**

- Modify: `.github/actions/update-repository-settings/src/plugins/branches.ts`
- Test: `.github/actions/update-repository-settings/src/plugins/__tests__/branches.test.ts`

**Approach:**

- Read back once per branch, after the update finally succeeds. Skip verification entirely when the update failed.
- Report divergence through `core.warning` and append a Step Summary table.
- Wrap the whole verification block so that a failed read-back GET, or a throw inside the comparison, logs a warning and continues. Verification must not introduce a failure path into a run that successfully applied its settings.
- Leave the other plugins untouched. Verification is branch-protection-only by design.

**Patterns to follow:**

- The existing 404 handling in `branchesPlugin`, which already distinguishes "no protection yet" from a real error.

**Test scenarios:**

- Happy path: an update whose read-back matches emits no warning and no Step Summary rows.
- Happy path: an update whose read-back diverges emits a warning, writes a Step Summary row, and the run still succeeds.
- Error path: a read-back GET returning 500 emits a warning and does not fail the run.
- Error path: a comparison that throws is caught, warns, and does not fail the run.
- Edge case: a failed update runs no read-back at all.
- Edge case: a branch with no prior protection still verifies after its first successful update.
- Edge case (covers R8): a config exercising labels and teams alongside branches issues read-back requests only for branches.
- Integration: divergence reported alongside an unrelated plugin failure keeps the two distinguishable — divergence in warnings, the failure in the aggregate error.

**Verification:**

- A run with divergence exits successfully with the divergence visible in both the annotations and the Step Summary.
- No read-back request is issued for any non-branches plugin.

---

- [ ] **Unit 6: Build, changeset, and ship**

**Goal:** Land the action in a releasable state.

**Requirements:** All

**Dependencies:** Units 1-5

**Files:**

- Modify: `.github/actions/update-repository-settings/dist/index.js`
- Create: `.changeset/<descriptive-name>.md`

**Approach:**

- Rebuild the committed bundle; `action.yaml` points at `dist/index.js` and the action ships pre-built.
- Write the changeset by hand, scoped to `update-repository-settings`. Do not use the changeset CLI.

**Test expectation:** none — packaging only, no behavioral change.

**Verification:**

- `dist/index.js` contains the new symbols and differs from the committed bundle on main.
- The changeset targets `update-repository-settings`, not the root package.

## System-Wide Impact

- **Interaction graph:** Installing retry at the client changes request behavior for every plugin, not only branches. That is intended and was confirmed, but it means labels, teams, and repository calls also gain retry.
- **Error propagation:** The plugin seam still aggregates and throws once. Enrichment changes the message content, not the control flow.
- **State lifecycle risks:** Retrying an idempotent PUT is safe by the API contract. Read-back is what confirms it in practice, which is part of why both land together.
- **API surface parity:** No action inputs or outputs change. Consumers calling the reusable workflow see no contract change.
- **Integration coverage:** The interaction between retry, read-back, and error aggregation is where the requirement groups collide; Unit 5's integration scenarios exist specifically to cover it.
- **Unchanged invariants:** `applySettings` still runs every plugin and throws one aggregate at the end. `sanitizeBranchProtection` and `cleanupMergedProtection` keep their current behavior — verification consumes them rather than modifying them.

## Risks & Dependencies

| Risk | Mitigation |
| --- | --- |
| The equivalence fixture is tautological — passes without containing the fields GitHub reshapes | Unit 4's verification requires the live-confirmed `contexts` mirror and `{enabled}` wrapper in the fixture, and requires a plain deep-equal to turn those cases red |
| Read-back produces constant false-positive divergence, drowning the real signal | Subset match plus reuse of the existing normalizers; report-only means noise costs attention, not runs |
| Retry triples cost without recovering anything, if the 500 is deterministic | Bounded attempts, and per-attempt logging makes the success-after-retry rate measurable rather than assumed |
| Client-wide retry masks a real failure elsewhere as slowness | Per-attempt logging applies to all retried requests, so masking is visible in the log |
| Adding a dependency to an action whose bundle is committed | Single well-maintained Octokit-official plugin; bundle size change reviewed at build |
| A 500 body is empty in practice, so R2 yields nothing | R3 and R5 are specified independently for exactly this reason; the request ID and the payload carry the diagnosis when the body does not |
| Log exposure — both repositories are public, so the enriched error and the debug payload are world-readable. What leaks is org topology: team slugs, app bypass identities, protected-branch configuration | Named never-log set in Key Technical Decisions, enforced by tests in Units 1 and 3. Redaction precedes truncation. The declared config is already public; the merged payload and failure bodies are what the denylist protects |
| Client-wide retry changes request behavior for every plugin in every consuming repository, raising rate-limit consumption and worst-case job duration org-wide | Bounded attempts; per-attempt logging makes the added call count visible rather than silent. Retry fires only on transient server and network failures, never on 4xx contract errors, so the coupling is bounded |
| Divergence warnings become noise and train operators to ignore real drift | Subset match plus observed-side-only normalization keeps the comparison narrow. Report-only is explicitly an evidence-gathering phase, not a permanent posture — the gating decision is revisited once data exists |

## Documentation / Operational Notes

- **Report-only has an exit condition, not an indefinite life.** Re-evaluate after roughly four weeks of data or the first ten reported divergences, whichever comes first. Three outcomes: no divergence ever reported, so read-back is removed rather than left running; divergence is real and consistent, so it gates; divergence is representational noise, so the equivalence rule is corrected before anything gates. Without a stated trigger the tool becomes a permanent half-reconciler that detects drift and defines no response to it.
- Once divergence data exists, the gating decision from the origin document becomes answerable: whether divergence should fail a run.
- Retry effectiveness is measurable from job logs as a success-after-retry rate — runs where a branch-protection update failed at least once and then succeeded, over all runs where it failed at least once.
- `bfra-me/ha-addon-repository` is the natural validation target at a 23% failure rate. If the upstream failure stops reproducing, the plan loses its primary evidence source and the retry question stays open.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-09-03-settings-sync-diagnosability-requirements.md](docs/brainstorms/2026-09-03-settings-sync-diagnosability-requirements.md)
- Related code: `.github/actions/update-repository-settings/src/plugins/index.ts`, `.github/actions/update-repository-settings/src/plugins/branches.ts`
- Related issues: `bfra-me/.github#2667`, `bfra-me/ha-addon-repository#569`
- Failing runs: `33466423792`, `33595589965`, `33540051450` in `bfra-me/ha-addon-repository`
- Institutional learnings: `docs/solutions/best-practices/test-fixtures-underspecified-in-ignored-dimension-2026-08-19.md`
