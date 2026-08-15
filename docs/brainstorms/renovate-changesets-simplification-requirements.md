---
date: 2026-08-15
topic: renovate-changesets-simplification
---

# Renovate Changesets Simplification

## Summary

Rebuild `renovate-changesets` around Renovate's own pull request body as the source of truth, replacing the per-ecosystem detection stack that re-derives data Renovate already publishes. Changeset output becomes configurable, emoji included, and coverage returns to the repository's 80% threshold. The work ships in two stages: a mechanical prune, then the rewrite.

---

## Problem Frame

The action produces a two-line changeset file. A representative output is a `patch` frontmatter block and one sentence reading `Update Docker image eceasy/cli-proxy-api from 7.2.131 to 7.2.132`.

Producing that costs 15,061 lines across 125 source files. The largest share is 3,980 lines of detectors spanning seven ecosystems, each with its own parsers, comparators, analyzers, and synthesizers. Around them sit 1,342 lines of summary generation, 638 of deduplication, 608 of grouped-PR management, 579 of template engine, and two separate changeset writers.

Most of that volume answers a question Renovate has already answered. Every Renovate pull request opens with a table naming the package and both versions, and the diff link encodes the manager type. The detectors re-derive this by reading lockfiles, Dockerfiles, and workflow YAML — work that duplicates published data.

Three of the seven ecosystems have never fired. No consumer repository contains Go, JVM, or Python dependencies, yet those detectors carry 2,001 lines and their share of the maintenance burden.

Coverage sits at 62.52% statements and 56.89% branches against thresholds of 80% and 75%. The gap has appeared in every daily report for nine consecutive runs. Two documented inputs, `auto-resolve-conflicts` and `skip-current-pr-in-group`, are unconditionally true because of a boolean coercion bug, so operators configuring them get no effect and no warning.

---

## Actors

- A1. Renovate: opens dependency update pull requests, publishing a structured table of package names, version transitions, and manager types in the PR body.
- A2. The action: reads that pull request, decides a semver bump, writes a changeset file, and commits it back to the branch.
- A3. Consumer repositories: `bfra-me/works` calls the reusable workflow; `marcusrbrown/infra` pins the action directly. Both inherit generated changeset text into their published changelogs.

---

## Key Flows

- F1. Single dependency update
  - **Trigger:** Renovate opens a pull request on a `renovate/**` branch.
  - **Actors:** A1, A2
  - **Steps:** The action reads the pull request body, extracts the package name, both versions, and the manager type. It classifies the update as a major, minor, patch, or security change. It formats a summary line, writes a changeset file, and commits it to the branch.
  - **Outcome:** A changeset file exists on the branch describing the update, and the pull request carries it.
  - **Covered by:** R5, R6, R7, R8, R11

- F2. Grouped update
  - **Trigger:** Renovate opens a pull request updating several packages together.
  - **Actors:** A1, A2
  - **Steps:** The action extracts every package and version pair from the body, determines the highest applicable bump across the group, and writes a single changeset naming the grouped packages.
  - **Outcome:** One changeset represents the whole group at the correct bump level.
  - **Covered by:** R5, R9, R11

---

## Requirements

**Stage 1 — prune and repair**

- R1. Remove the Go, JVM, and Python detection paths and their tests.
- R2. Repair the boolean coercion so `auto-resolve-conflicts` and `skip-current-pr-in-group` honour their configured values.
- R3. Remove package dependencies that no source file imports.
- R4. Land Stage 1 independently, with existing behaviour for live ecosystems unchanged.
- R4a. Announce removal of the Go, JVM, and Python paths in the release notes, and state that they can be restored if a consumer needs them.

**Stage 2 — rewrite around the pull request body**

- R5. Derive package names, version transitions, manager type, and grouping from the Renovate pull request body.
- R6. Support npm, Docker, GitHub Actions, and security updates.
- R7. Reduce the pipeline to parse, classify, format, and write.
- R8. Consolidate changeset writing into a single path.
- R9. Determine the semver bump from the parsed version transition, taking the highest applicable bump for grouped updates.
- R10. When the pull request body is unavailable or unparseable, fail with a diagnostic naming the pull request number and the field that could not be parsed, rather than writing a speculative changeset. The diagnostic must not echo body content, token values, or environment material.
- R10a. Confirm the pull request is Renovate-authored from a source other than the body — branch naming or commit metadata — before parsing it as authoritative.
- R10b. Handle `merge_group` events without a reachable pull request body, either by skipping cleanly or by removing the trigger from the reusable workflow.

**Output and interface**

- R11. Accept an `emoji` input controlling whether summary lines carry a leading emoji, defaulting to disabled.
- R11a. Call out the emoji default change in the release notes as a visible output change, naming the input that restores the previous appearance.
- R12. Keep `action.yaml` additive — new inputs are permitted, existing inputs and outputs are neither removed nor repurposed.

**Coverage**

- R13. Restore coverage to at least 80% statements, functions, and lines, and 75% branches, on the rewritten action.
- R14. Assert observable behaviour — the changeset file written for a given pull request — rather than internal module shapes.

---

## Acceptance Examples

- AE1. **Covers R11.** Given `emoji` is unset, when the action writes a changeset for a Docker image bump, the summary line begins with `Update Docker image` and carries no leading emoji.
- AE2. **Covers R11.** Given `emoji` is set to true, the same update produces the same line prefixed with its ecosystem emoji.
- AE3. **Covers R5, R9.** Given a pull request body whose table shows `16.4.0 → 17.3.0`, when the action runs, it writes a changeset at `minor` or higher.
- AE4. **Covers R9.** Given a grouped pull request containing both a patch and a minor transition, when the action runs, it writes one changeset at `minor`.
- AE5. **Covers R10.** Given a pull request with no parseable dependency table, when the action runs, it fails with a message naming the pull request number, and writes no changeset.
- AE6. **Covers R2.** Given `auto-resolve-conflicts` is set to false, when a conflict occurs during commit-back, the action does not attempt automatic resolution.

---

## Success Criteria

- The detection layer is gone: `src/detectors/` is deleted, and the action retains only a parser, a classifier, a formatter, and one writer.
- Coverage meets the repository threshold, and the daily report stops flagging it.
- A dependency update in `bfra-me/works` and in `marcusrbrown/infra` produces a correct changeset after the upgrade, with no workflow changes in either repository.
- A planner reading this document knows which ecosystems survive, where update facts come from, and what the output looks like, without reading the current implementation.

---

## Scope Boundaries

- Replacing the action with a Renovate `postUpgradeTasks` script.
- Removing or repurposing any existing `action.yaml` input or output.
- Adding ecosystems beyond npm, Docker, GitHub Actions, and security.
- Changing how consumers invoke the action or the reusable workflow.
- Reworking the release and SHA-pinning machinery around the action.

---

## Key Decisions

- Stage 1 before Stage 2: the prune carries no behavioural risk and ships immediately, shrinking the surface the rewrite has to reason about.
- Pull request body as the primary source: Renovate publishes package, versions, and manager type in structured form, so re-deriving them from lockfiles and Dockerfiles is duplicated work.
- Emoji defaults to disabled: plain text is the better default for changelogs, accepting that consumer changelog entries change appearance at upgrade.
- Broken inputs are repaired rather than removed: removal would break the published interface for a bug that operators may not have noticed.
- Coverage restoration rides with the rewrite: the tests pinning deleted internals are rewritten anyway, so restoring the threshold separately would mean touching them twice.

---

## Dependencies / Assumptions

- Renovate's pull request body format is stable. A format change breaks parsing, which R10 surfaces as a diagnostic failure rather than a wrong changeset. Failing closed is preferred over a wrong changeset, and blocks the affected pull request rather than the release pipeline.
- `merge_group` is declared as a trigger on the reusable workflow but has never fired — all nine recorded runs were `pull_request_target`. R10b covers it explicitly rather than assuming it stays dormant.
- `bfra-me/works` and `marcusrbrown/infra` are the only known consumers, but the action is published org-wide through `workflow-templates/renovate-changesets.yaml`, so an unknown consumer using a removed ecosystem would break at Stage 1. R4a covers this with a release-note announcement and a restoration path.
- Security classification already derives from the pull request body, not from advisory lookups. `extractSecuritySeverity` substring-matches severity words in body text, and `security-advisory-parser.ts` regex-matches CVE and GHSA identifiers against package names and version strings, assigning severity arithmetically from the CVE sequence number. Deleting those 612 lines removes invented precision, not real metadata.

---

## Outstanding Questions

### Deferred to Planning

- Affects R5, R10a — **Technical** — Which fields come from the pull request body versus the branch name or commit message, when both are available.
- Affects R9 — **Technical** — How prerelease and non-semver version strings map to a bump level.
- Affects R13 — **Technical** — Whether the existing integration tests can be adapted or should be rewritten against the new pipeline.
- Affects R10b — **Technical** — Whether `merge_group` is removed from the reusable workflow or handled as a body-less skip.
- Affects R6 — **Technical** — Which Renovate body markers identify a security update, given that severity words and CVE identifiers are the only signals available today.

---

## Sources / Research

- Current implementation: `.github/actions/renovate-changesets/` — 125 files, 15,061 lines. Entry path runs `src/index.ts` → `src/run.ts` → `src/run-init.ts` → `src/run-analysis.ts` → `src/run-generation.ts` → writer.
- Security classification sources: `src/parser/renovate-update-classifier.ts:61` and `src/detectors/security-advisory-parser.ts:29`. Both read body-derived text; neither queries an advisory database.
- Existing pull request body parsing lives in `src/parser/` (812 lines) and already handles version-arrow extraction and release-note stripping.
- Boolean coercion bug: `src/git-operations.ts:677` and `src/grouped-pr-manager.ts:604`.
- Consumers: `bfra-me/works` via `.github/workflows/renovate-changeset.yaml`; `marcusrbrown/infra` pins the action directly at `renovate-changesets@0.2.31`.
- Coverage baseline: 62.52% statements, 56.89% branches, 70.05% functions across 4,062 lines.
