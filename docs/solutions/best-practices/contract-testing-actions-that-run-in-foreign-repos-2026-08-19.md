---
title: Contract-first testing for actions that run in foreign repos
date: 2026-08-19
category: best-practices
module: .github/actions/renovate-changesets
problem_type: best_practice
component: testing_framework
severity: high
applies_when:
  - An action is developed in one repo but executes in others
  - Local CI passes while the consumer repo breaks
  - A refactor is scoped by what can be deleted rather than by the runtime contract
related_components:
  - tooling
  - development_workflow
tags:
  - contract-testing
  - renovate-changesets
  - changesets
  - consumer-repo
  - test-strategy
---

## Context

`renovate-changesets` is developed in `.github/actions/renovate-changesets/` but executes inside consumer repositories. Its real contract is much larger than this repository's build: consumer bot identity, Renovate PR body dialect, workspace topology, dependency-install state, and `.changeset/config.json`.

A prior slimming refactor was scoped by local reachability — it mapped what could be deleted here, never modeling the environment the action actually runs in. It _required_ correct output in `marcusrbrown/infra` but gated release on local `type-check → test → lint → build`. "Works in the consumer" was an aspiration, never a gate.

Six false assumptions followed, each true here and false there:

- Renovate always runs as `renovate[bot]` — consumers also use `bfra-me[bot]` and `mrbro-bot[bot]`
- Docker references always carry full digests — consumers supply short SHAs
- `@changesets/write` succeeds because dependencies are installed — consumer workspaces have no `node_modules` at that point
- An affected package is always listed in a manifest
- Every workspace package is releasable
- One grouped Renovate PR has one package manager

The contract suite makes those assumptions executable. It is 12 files and 25 tests under `test/contract/`: ten `*.contract.test.ts` scenarios plus `setup.ts` and `changesets-oracle.ts`.

## Guidance

**Enter through the real `run()`** in `src/run.ts`. Not `index.ts` — that invokes `run` as an import side effect, so merely importing it would execute the action.

**Use a real temporary workspace.** Each scenario copies a fixture with `fs.cp(..., {recursive: true})`. The fixture at `test/contract/fixtures/marcusrbrown-infra/repo/` is deliberately hostile:

- declares `apps/*`, `packages/*`, and `libs/*` workspaces with an unresolvable prettier config
- `apps/cliproxy` and `apps/vpn` are versionless
- `.changeset/config.json` ignores `@marcusrbrown/infra-vpn`, enables private-package versioning, and sets `updateInternalDependencies`
- `packages/shared` carries real dependencies, so the suite can test propagation as well as exclusion

**Keep the boundary narrow.** Only `@actions/core`, `@octokit/rest`, and a single exec lookup are stubbed. In `test/contract/setup.ts`, `getExecOutput` accepts exactly `git rev-parse --short HEAD` and throws on anything else:

```ts
execMocks.getExecOutput.mockImplementation(async (command, args) => {
  if (command !== 'git' || args.join(' ') !== 'rev-parse --short HEAD') {
    throw new Error(`Unexpected contract getExecOutput command: ${command} ${args.join(' ')}`)
  }
  return {stdout: 'contract1\n', stderr: '', exitCode: 0}
})
```

That is deliberate. Enabling a new git dependency without updating the contract is drift, and it should fail loudly.

**Use the real Changesets CLI as the final oracle.** `test/contract/changesets-oracle.ts` runs the repository's installed `@changesets/cli`:

```text
changeset status --output .contract-release-plan.json
```

It exposes two views, and they answer different questions:

- `authoredReleases()` — `releasePlan.changesets.flatMap(c => c.releases)`, what the action wrote
- `effectiveReleases()` — the final plan after `updateInternalDependencies`, excluding `type: "none"`

**A separate Vitest project is mandatory.** `vitest.contract.config.ts` defines `renovate-changesets-contract` and loads `test/contract/setup.ts`. The normal `test/setup.ts` globally mocks `node:fs`, `node:fs/promises`, and `@changesets/write` with no per-file opt-out — the separate project is what restores real filesystem behavior and real Changesets execution.

**Assert captured output, never rejection.** `run()` catches failures into `core.setFailed`, so successful error handling resolves normally. `await expect(run()).rejects.toThrow(...)` will never fire.

**Requirements:** `git` on `PATH`, and a completed root `pnpm install` since the oracle resolves `node_modules/@changesets/cli/bin.js`.

```bash
pnpm test --project renovate-changesets-contract
```

**Prove every fix RED first.** Revert `src/`, run the suite, confirm that _only_ the intended scenarios fail. This is not ceremony — a tag-to-digest `pinDigest` case once stayed green by coincidence while the bare-SHA case was genuinely red. A green test is evidence only after its failure mode has been demonstrated.

## Why This Matters

Local tests prove behavior under local conditions. They do not prove an action survives the environment a foreign repository hands it.

The scenarios map directly onto the failures that reached production:

| Scenario               | Boundary                                                   |
| ---------------------- | ---------------------------------------------------------- |
| `unknown-bot-identity` | bot recognition outside `renovate[bot]`                    |
| `docker-short-sha`     | digest parsing with a short SHA                            |
| `writer-failure`       | write failure reported when consumer deps are absent       |
| `releasable-packages`  | versioned / versionless / ignored / glob packages          |
| `mixed-npm-actions`    | per-row package-manager identity                           |
| `provider-update`      | action authors the provider; Changesets adds the dependent |
| `control-plane-prs`    | config-migration and onboarding PRs                        |

Without these, the release gate validates the implementation's home environment instead of the action's execution contract.

## When to Apply

Add or update a contract scenario when a change touches:

- Renovate bot recognition, branch detection, PR-body parsing, or grouped updates
- Docker, git, lockfile, or filesystem handling
- Workspace discovery, package eligibility, dependency propagation, or Changesets configuration
- Any code assuming installed dependencies in `GITHUB_WORKSPACE`
- Any output consumed by a release workflow or downstream repository

Do not swap a contract test for a unit test because the unit test is faster. Use both — unit tests for local rules, contract tests for the foreign-repository boundary.

## Examples

Construct consumer state, run the real entry point, then invoke the real oracle:

```ts
await fs.cp(fixtureRoot, workspace, {recursive: true})
initializeGitRepository(workspace)

process.env.GITHUB_WORKSPACE = workspace
process.env.GITHUB_REPOSITORY = 'marcusrbrown/infra'

await run()

expect(contractState.failed).toEqual([])

const oracle = await runChangesetsOracle('provider-update', workspace, diagnostics)

expect(authoredReleases(oracle.releasePlan).map(({name}) => name)).toEqual([
  '@marcusrbrown/infra-shared',
])

expect(effectiveReleases(oracle.releasePlan).map(({name}) => name)).toEqual([
  '@marcusrbrown/infra-shared',
  '@marcusrbrown/infra-gateway',
])
```

Name the layer each assertion verifies. `effectiveReleases` alone cannot detect over-authoring, because Changesets expands the plan either way.

## Related

- [Test fixtures underspecified in the dimension the code ignores](./test-fixtures-underspecified-in-ignored-dimension-2026-08-19.md)
- [Release propagation walked the dependency graph backwards](../logic-errors/release-propagation-walked-dependency-graph-backwards-2026-08-19.md)
- [Changeset deduplication compared release sets but not summaries](../logic-errors/changeset-dedup-ignored-summaries-2026-08-19.md)
- [renovate-changesets fix workflow](../process/renovate-changesets-fix-workflow.md)
- [Renovate SHA pin rot across two tag families](../integration-issues/renovate-sha-pin-rot-two-tag-families-2026-08-15.md)
