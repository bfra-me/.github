import {describe, expect, it} from 'vitest'
import {compareBranchProtection} from '../branch-protection-equivalence.js'

describe('compareBranchProtection', () => {
  it('reports no divergence when the read-back matches the declared config', () => {
    const declared = {
      enforce_admins: true,
      required_status_checks: {
        strict: true,
        checks: [{context: 'ci/build', app_id: 15368}],
      },
    }
    const observed = {
      enforce_admins: true,
      required_status_checks: {
        strict: true,
        checks: [{context: 'ci/build', app_id: 15368}],
      },
    }

    const result = compareBranchProtection(declared, observed)

    expect(result.equivalent).toBe(true)
    expect(result.divergentFields).toEqual([])
  })

  it('tolerates the live-confirmed contexts mirror of checks', () => {
    const declared = {
      required_status_checks: {
        strict: true,
        checks: [{context: 'ci/build', app_id: 15368}],
      },
    }
    // GitHub populates `contexts` as a derived mirror of `checks` even
    // though the config declares only `checks`.
    const observed = {
      required_status_checks: {
        strict: true,
        checks: [{context: 'ci/build', app_id: 15368}],
        contexts: ['ci/build'],
      },
    }

    const result = compareBranchProtection(declared, observed)

    expect(result.equivalent).toBe(true)
    expect(result.divergentFields).toEqual([])
  })

  it('tolerates enforce_admins returned as an {enabled, url} object', () => {
    const declared = {enforce_admins: true}
    const observed = {
      enforce_admins: {
        enabled: true,
        url: 'https://api.github.com/repos/bfra-me/repo/branches/main/protection/enforce_admins',
      },
    }

    const result = compareBranchProtection(declared, observed)

    expect(result.equivalent).toBe(true)
    expect(result.divergentFields).toEqual([])
  })

  it('ignores a field the config never declared', () => {
    const declared = {enforce_admins: true}
    const observed = {
      enforce_admins: true,
      required_linear_history: {enabled: true},
      required_signatures: {enabled: false},
    }

    const result = compareBranchProtection(declared, observed)

    expect(result.equivalent).toBe(true)
    expect(result.divergentFields).toEqual([])
  })

  it('reports divergence when GitHub drops a declared field entirely', () => {
    const declared = {enforce_admins: true}
    const observed = {}

    const result = compareBranchProtection(declared, observed)

    expect(result.equivalent).toBe(false)
    expect(result.divergentFields).toEqual(['enforce_admins'])
  })

  it('reports divergence and names the field when GitHub applies a different value', () => {
    const declared = {
      required_pull_request_reviews: {
        required_approving_review_count: 2,
      },
    }
    const observed = {
      required_pull_request_reviews: {
        required_approving_review_count: 1,
      },
    }

    const result = compareBranchProtection(declared, observed)

    expect(result.equivalent).toBe(false)
    expect(result.divergentFields).toEqual([
      'required_pull_request_reviews.required_approving_review_count',
    ])
  })

  it('tolerates a declared list whose read-back order differs', () => {
    const declared = {
      required_status_checks: {
        checks: [
          {context: 'ci/build', app_id: 15368},
          {context: 'ci/test', app_id: 15368},
        ],
      },
    }
    const observed = {
      required_status_checks: {
        checks: [
          {context: 'ci/test', app_id: 15368},
          {context: 'ci/build', app_id: 15368},
        ],
      },
    }

    const result = compareBranchProtection(declared, observed)

    expect(result.equivalent).toBe(true)
    expect(result.divergentFields).toEqual([])
  })

  it('compares clean against any read-back when the declared config is empty', () => {
    const observed = {
      enforce_admins: {enabled: true, url: 'https://api.github.com/...'},
      required_status_checks: {strict: true, checks: [], contexts: []},
    }

    const result = compareBranchProtection({}, observed)

    expect(result.equivalent).toBe(true)
    expect(result.divergentFields).toEqual([])
  })

  it('is not tautological: the combined representational fixture proves the rule, not just the fixture', () => {
    // This fixture packs every field class GitHub is confirmed to reshape:
    // the `contexts` mirror of `checks`, an `{enabled}` boolean wrapper,
    // a server-populated field the config never declared, and reordered
    // list items. A fixture omitting any of these would pass while
    // proving nothing — see
    // docs/solutions/best-practices/test-fixtures-underspecified-in-ignored-dimension-2026-08-19.md
    const declared = {
      enforce_admins: true,
      required_status_checks: {
        strict: true,
        checks: [
          {context: 'ci/build', app_id: 15368},
          {context: 'ci/test', app_id: 15368},
        ],
      },
      required_pull_request_reviews: {
        required_approving_review_count: 2,
      },
    }
    const observed = {
      url: 'https://api.github.com/repos/bfra-me/repo/branches/main/protection',
      enforce_admins: {
        enabled: true,
        url: 'https://api.github.com/repos/bfra-me/repo/branches/main/protection/enforce_admins',
      },
      required_status_checks: {
        url: 'https://api.github.com/repos/bfra-me/repo/branches/main/protection/required_status_checks',
        strict: true,
        // reordered relative to declared, plus the derived `contexts` mirror
        checks: [
          {context: 'ci/test', app_id: 15368},
          {context: 'ci/build', app_id: 15368},
        ],
        contexts: ['ci/build', 'ci/test'],
        contexts_url:
          'https://api.github.com/repos/bfra-me/repo/branches/main/protection/required_status_checks/contexts',
      },
      required_pull_request_reviews: {
        url: 'https://api.github.com/repos/bfra-me/repo/branches/main/protection/required_pull_request_reviews',
        required_approving_review_count: 2,
        // server-populated field the config never declared
        dismiss_stale_reviews: false,
      },
      // server-populated field entirely absent from the declared config
      required_signatures: {
        enabled: false,
        url: 'https://api.github.com/repos/bfra-me/repo/branches/main/protection/required_signatures',
      },
      allow_force_pushes: {enabled: false},
    }

    const result = compareBranchProtection(declared, observed)

    expect(result.equivalent).toBe(true)
    expect(result.divergentFields).toEqual([])
  })
})
