---
title: Test fixtures underspecified in the dimension the code ignores
date: 2026-08-19
category: best-practices
module: .github/actions/renovate-changesets
problem_type: best_practice
component: testing_framework
severity: high
applies_when:
  - A comparator, parser, classifier, or planner gains a new field
  - A previously ignored field becomes part of equality, hashing, or filtering
  - A fixture uses empty strings, empty arrays, or omitted properties
  - A test asserts derived output instead of authored input
related_components:
  - tooling
tags:
  - test-fixtures
  - test-strategy
  - renovate-changesets
  - changesets
  - dependency-graph
---

## Context

A fixture is executable specification. If it is vague in exactly the dimension the code currently ignores, it becomes load-bearing the moment the code starts caring — and until then, the test can encode the bug it claims to prevent.

This happened four times in `renovate-changesets`, and each instance passed review:

1. Contract scenarios asserted only Changesets' **final** release plan, never what the action authored
2. The contract fixture's `packages/shared` declared **zero** dependencies
3. A multi-package relationship fixture had the dependency direction **reversed**
4. A duplicate-detection fixture omitted the **summary** that later became part of comparison

A related failure: a tautological assertion, `expect(info).not.toHaveBeenCalledWith(expect.stringContaining('duplicate'))`, verified that the implementation never logged text it was never written to log. It could not fail.

## Guidance

**Specify every fixture field that participates in the behavior under test, even if the implementation ignores it today.**

### Identify the assertion target

In Changesets, the final plan is not the authored input. `test/contract/changesets-oracle.ts` exposes both:

- `authoredReleases()` — releases explicitly written into generated changesets
- `effectiveReleases()` — the final plan after `updateInternalDependencies` and `type: "none"` filtering

Most scenarios have identical authored and effective sets. Exactly one diverges — `test/contract/provider-update.contract.test.ts`, where `@marcusrbrown/infra-shared` is authored while `@marcusrbrown/infra-gateway` appears only in the effective plan. That single scenario carries the entire guarantee. Do not delete it or collapse the two assertions.

### Build fixtures with both graph directions

`packages/shared` now declares real dependencies while `apps/gateway` consumes `@marcusrbrown/infra-shared`. That edge lets the suite detect **under**-release. A fixture with no dependencies can only ever prove exclusion — it cannot prove that something which should release does.

### Read relationships in the direction the data structure uses

`relationship(source, target)` means the source _declares_ a dependency on the target. So `a → b` means A consumes B, and B cannot become indirectly affected by A. Direct and indirect lists must follow the graph, not an intuitive "change flows forward" reading.

### Populate every field the comparison reads

Once the duplicate comparator considers summary content, an existing changeset fixture needs a meaningful `summary` — not `''`. An empty field is not neutral once the comparator reads it; it asserts the defect.

### Assert observable state

Assert returned duplicate sets, filenames, release entries, generated files, warnings, failures. A negative log assertion is valid only when production code actually emits the forbidden log and the test creates the condition that should suppress it.

## Why This Matters

Underspecified fixtures create false confidence, and the failure is silent.

The original contract assertions read `releasePlan.releases`. Changesets adds dependent packages during plan assembly, so an over-broad authored set and a correctly expanded one produce the **same** final plan. Three wrong expectations passed review three separate times because the assertion erased the distinction that mattered.

The dependency-free `packages/shared` fixture had the same shape problem in a different dimension: it could demonstrate that a package should not be released, never that one should.

The reversed `a → b` relationship described an impossible impact direction. The test passed while teaching future changes the wrong dependency vocabulary.

The empty duplicate summary passed while summary comparison was effectively disabled. When summary became load-bearing, that fixture asserted the bug rather than guarding against it.

A tautological assertion is worse than no assertion — it consumes review attention while providing no failure signal.

## When to Apply

Audit fixture completeness when:

- A comparator, parser, classifier, or planner gains a new field
- A test moves from unit-level return values to final assembled output
- A graph, workspace, or dependency relationship is involved
- A previously ignored field enters hashing, equality, deduplication, or filtering
- A negative assertion is added
- A fixture uses empty strings, empty arrays, omitted properties, or placeholders

Before merging, run the test against the intended defect. **If reverting the production change leaves the test green, the fixture or the assertion is wrong.**

## Examples

Distinguish authored input from derived output:

```ts
expect(authoredReleases(oracle.releasePlan).map(({name}) => name)).toEqual([
  '@marcusrbrown/infra-shared',
])

expect(effectiveReleases(oracle.releasePlan).map(({name}) => name)).toEqual([
  '@marcusrbrown/infra-shared',
  '@marcusrbrown/infra-gateway',
])
```

Give a fixture enough graph structure to test propagation:

```json
{
  "name": "@marcusrbrown/infra-gateway",
  "version": "0.0.0",
  "dependencies": {
    "@marcusrbrown/infra-shared": "workspace:*"
  }
}
```

Populate fields the comparison reads:

```ts
const existing = {
  filename: 'existing.md',
  content: '---\n"pkg-a": patch\n---\nUpdate dep',
  releases: [{name: 'pkg-a', type: 'patch' as const}],
  summary: 'Update dep',
  createdAt: new Date(),
  age: 0,
}

expect(isChangesetDuplicateOfExisting(candidate, existing)).toBe(true)
```

### Checklist for any new fixture dimension

1. Can the test fail if this field is wrong?
2. Does the fixture contain both sides of the comparison?
3. Does the assertion observe authored, derived, or side-effect state explicitly?
4. Does the relationship direction match source/target semantics?
5. If the implementation ignores this field today, will the fixture stay truthful when it starts reading it?
6. Can the test pass without the expected production behavior?

If the answer to the last one is yes, it is a dressed-up tautology.

## Related

- [Contract-first testing for actions that run in foreign repos](./contract-testing-actions-that-run-in-foreign-repos-2026-08-19.md)
- [Release propagation walked the dependency graph backwards](../logic-errors/release-propagation-walked-dependency-graph-backwards-2026-08-19.md)
- [Changeset deduplication compared release sets but not summaries](../logic-errors/changeset-dedup-ignored-summaries-2026-08-19.md)
