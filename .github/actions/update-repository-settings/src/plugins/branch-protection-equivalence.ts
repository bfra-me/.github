import {sanitizeBranchProtection} from './branches.js'

/**
 * Result of comparing a declared branch-protection config against a
 * read-back GitHub response.
 */
export interface BranchProtectionEquivalenceResult {
  /** True when every declared field matches the normalized read-back. */
  equivalent: boolean
  /** Dot-separated paths of declared fields that diverged, e.g. `required_pull_request_reviews.required_approving_review_count`. */
  divergentFields: string[]
}

/**
 * Compare declared branch-protection intent against a raw GitHub read-back
 * response.
 *
 * This is a **subset match**: only fields the declared config mentions are
 * compared. Anything GitHub returns that the config never declared is
 * ignored entirely — that is what lets this survive GitHub adding response
 * fields (e.g. a server-populated field) without producing false divergence.
 *
 * The read-back is normalized through {@link sanitizeBranchProtection}
 * before comparison — this reconciles known GitHub read/write shape
 * differences (the `contexts` mirror of `checks`, `{enabled}` boolean
 * wrappers, stray `url` fields). The declared side is intentionally left
 * raw and is never normalized: normalizing both sides would let a bug in
 * the normalizer distort intent and observation identically, hiding the
 * exact class of bug this comparison exists to catch. `cleanupMergedProtection`
 * is not applied to either side — it prepares a write payload, not a
 * comparison.
 *
 * This is a pure function: it takes plain data in and returns plain data
 * out, with no I/O and no Octokit dependency.
 */
export function compareBranchProtection(
  declared: Record<string, unknown>,
  observedRaw: Record<string, unknown>,
): BranchProtectionEquivalenceResult {
  const observed = sanitizeBranchProtection(observedRaw)
  const divergentFields = collectDivergentFields(declared, observed, '')

  return {
    equivalent: divergentFields.length === 0,
    divergentFields,
  }
}

/**
 * Walk the declared object recursively, comparing each declared field
 * against the corresponding observed field. When both sides hold a plain
 * object for the same key, recurse into it to produce a granular field
 * path; otherwise resolve the comparison with {@link subsetEqual} and
 * record the current path on divergence.
 */
function collectDivergentFields(
  declared: Record<string, unknown>,
  observed: Record<string, unknown>,
  prefix: string,
): string[] {
  const divergentFields: string[] = []

  for (const [key, declaredValue] of Object.entries(declared)) {
    const path = prefix === '' ? key : `${prefix}.${key}`
    const observedValue = observed[key]

    if (isPlainObject(declaredValue) && isPlainObject(observedValue)) {
      divergentFields.push(...collectDivergentFields(declaredValue, observedValue, path))
    } else if (!subsetEqual(declaredValue, observedValue)) {
      divergentFields.push(path)
    }
  }

  return divergentFields
}

/**
 * Structural equality with subset semantics for objects and order
 * insensitivity for arrays.
 *
 * - Plain objects: every key in `declared` must have a `subsetEqual` match
 *   in `observed`; keys present only in `observed` are ignored.
 * - Arrays: compared as an unordered multiset of equal length — each
 *   declared item must find one matching, unused observed item, using
 *   this same subset semantics recursively. Order never causes divergence.
 * - Everything else: compared with `Object.is`.
 */
function subsetEqual(declared: unknown, observed: unknown): boolean {
  if (Array.isArray(declared)) {
    return Array.isArray(observed) && arraysEquivalent(declared, observed)
  }

  if (isPlainObject(declared)) {
    return (
      isPlainObject(observed) &&
      Object.entries(declared).every(([key, value]) => subsetEqual(value, observed[key]))
    )
  }

  return Object.is(declared, observed)
}

function arraysEquivalent(declared: unknown[], observed: unknown[]): boolean {
  if (declared.length !== observed.length) {
    return false
  }

  const remaining = [...observed]
  for (const item of declared) {
    const matchIndex = remaining.findIndex(candidate => subsetEqual(item, candidate))
    if (matchIndex === -1) {
      return false
    }
    remaining.splice(matchIndex, 1)
  }

  return true
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
