import type {Octokit as OctokitType} from '@octokit/rest'
import {Octokit} from '@octokit/rest'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {branchesPlugin, cleanupMergedProtection, sanitizeBranchProtection} from '../branches.js'

const mockGetBranchProtection = vi.hoisted(() => vi.fn())
const mockUpdateBranchProtection = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockInfo = vi.hoisted(() => vi.fn())
const mockWarning = vi.hoisted(() => vi.fn())

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    rest = {
      repos: {
        getBranchProtection: mockGetBranchProtection,
        updateBranchProtection: mockUpdateBranchProtection,
      },
    }
  },
}))

vi.mock('@actions/core', () => ({
  info: mockInfo,
  warning: mockWarning,
}))

function createOctokit(): OctokitType {
  return new Octokit({auth: 'test-token'}) as unknown as OctokitType
}

describe('branchesPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetBranchProtection.mockResolvedValue({data: {}})
  })

  it('fetches current protection before PUT and sends merged result', async () => {
    mockGetBranchProtection.mockResolvedValueOnce({
      data: {
        enforce_admins: true,
        required_status_checks: {
          strict: true,
          contexts: ['ci/build'],
        },
      },
    })

    await branchesPlugin(createOctokit(), 'bfra-me', 'repo', [
      {
        name: 'main',
        protection: {
          required_pull_request_reviews: {
            required_approving_review_count: 2,
          },
        },
      },
    ])

    expect(mockGetBranchProtection).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      branch: 'main',
    })
    expect(mockUpdateBranchProtection).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      branch: 'main',
      enforce_admins: true,
      required_status_checks: {
        strict: true,
        contexts: ['ci/build'],
      },
      required_pull_request_reviews: {
        required_approving_review_count: 2,
      },
    })
  })

  it('handles 404 from getBranchProtection and creates from config only', async () => {
    mockGetBranchProtection.mockRejectedValueOnce({status: 404, message: 'Not Found'})

    await branchesPlugin(createOctokit(), 'bfra-me', 'repo', [
      {
        name: 'main',
        protection: {
          enforce_admins: true,
        },
      },
    ])

    expect(mockUpdateBranchProtection).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      branch: 'main',
      enforce_admins: true,
    })
  })

  it('sanitizes GET response shape before merging — converts {enabled} to bool, strips urls', async () => {
    mockGetBranchProtection.mockResolvedValueOnce({
      data: {
        url: 'https://api.github.com/repos/bfra-me/repo/branches/main/protection',
        enforce_admins: {
          url: 'https://api.github.com/repos/bfra-me/repo/branches/main/protection/enforce_admins',
          enabled: true,
        },
        required_signatures: {
          url: 'https://api.github.com/repos/bfra-me/repo/branches/main/protection/required_signatures',
          enabled: false,
        },
        required_status_checks: {
          url: 'https://api.github.com/repos/bfra-me/repo/branches/main/protection/required_status_checks',
          strict: true,
          contexts: ['Renovate', 'Release'],
          contexts_url:
            'https://api.github.com/repos/bfra-me/repo/branches/main/protection/required_status_checks/contexts',
          checks: [
            {context: 'Renovate', app_id: 15368},
            {context: 'Release', app_id: 15368},
          ],
        },
        required_pull_request_reviews: {
          url: 'https://api.github.com/repos/bfra-me/repo/branches/main/protection/required_pull_request_reviews',
          dismiss_stale_reviews: true,
          require_code_owner_reviews: false,
          required_approving_review_count: 0,
        },
        required_linear_history: {enabled: true},
        allow_force_pushes: {enabled: false},
        allow_deletions: {enabled: false},
        block_creations: {enabled: false},
        required_conversation_resolution: {enabled: false},
        lock_branch: {enabled: false},
        allow_fork_syncing: {enabled: false},
      },
    })

    await branchesPlugin(createOctokit(), 'bfra-me', 'repo', [
      {
        name: 'main',
        protection: {
          required_status_checks: {
            strict: true,
            contexts: [],
          },
          enforce_admins: true,
          required_pull_request_reviews: {
            dismiss_stale_reviews: true,
            require_code_owner_reviews: false,
            required_approving_review_count: 0,
          },
          restrictions: null,
          required_linear_history: true,
        },
      },
    ])

    const call = mockUpdateBranchProtection.mock.calls[0]?.[0] as Record<string, unknown>

    expect(call).not.toHaveProperty('url')
    expect(call.required_status_checks).not.toHaveProperty('url')
    expect(call.required_status_checks).not.toHaveProperty('contexts_url')
    expect(call.required_pull_request_reviews).not.toHaveProperty('url')
    expect(call).not.toHaveProperty('required_signatures')

    expect(call.enforce_admins).toBe(true)
    expect(call.required_linear_history).toBe(true)
    expect(call.allow_force_pushes).toBe(false)

    const rsc = call.required_status_checks as Record<string, unknown>
    expect(rsc).not.toHaveProperty('contexts')
    expect(rsc.checks).toEqual([
      {context: 'Renovate', app_id: 15368},
      {context: 'Release', app_id: 15368},
    ])
  })

  it('passes through required_status_checks.contexts unchanged', async () => {
    await branchesPlugin(createOctokit(), 'bfra-me', 'repo', [
      {
        name: 'main',
        protection: {
          required_status_checks: {
            strict: true,
            contexts: ['lint', 'test'],
          },
        },
      },
    ])

    expect(mockUpdateBranchProtection).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      branch: 'main',
      required_status_checks: {
        strict: true,
        contexts: ['lint', 'test'],
      },
    })
  })

  it('passes through required_status_checks.checks unchanged', async () => {
    await branchesPlugin(createOctokit(), 'bfra-me', 'repo', [
      {
        name: 'main',
        protection: {
          required_status_checks: {
            strict: true,
            checks: [{context: 'ci/build', app_id: 15368}],
          },
        },
      },
    ])

    expect(mockUpdateBranchProtection).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      branch: 'main',
      required_status_checks: {
        strict: true,
        checks: [{context: 'ci/build', app_id: 15368}],
      },
    })
  })

  it('passes through bypass_pull_request_allowances in pull request reviews', async () => {
    await branchesPlugin(createOctokit(), 'bfra-me', 'repo', [
      {
        name: 'main',
        protection: {
          required_pull_request_reviews: {
            required_approving_review_count: 1,
            bypass_pull_request_allowances: {
              users: ['maintainer'],
              teams: ['platform'],
              apps: ['renovate'],
            },
          },
        },
      },
    ])

    expect(mockUpdateBranchProtection).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      branch: 'main',
      required_pull_request_reviews: {
        required_approving_review_count: 1,
        bypass_pull_request_allowances: {
          users: ['maintainer'],
          teams: ['platform'],
          apps: ['renovate'],
        },
      },
    })
  })

  it('handles empty branches config as a no-op', async () => {
    await branchesPlugin(createOctokit(), 'bfra-me', 'repo', [])

    expect(mockGetBranchProtection).not.toHaveBeenCalled()
    expect(mockUpdateBranchProtection).not.toHaveBeenCalled()
  })

  it('skips invalid branch entries and continues with valid entries', async () => {
    await branchesPlugin(createOctokit(), 'bfra-me', 'repo', [
      {protection: {enforce_admins: true}},
      {name: 'main'},
      null,
      {
        name: 'release/*',
        protection: {enforce_admins: true},
      },
    ])

    expect(mockWarning).toHaveBeenCalledTimes(3)
    expect(mockUpdateBranchProtection).toHaveBeenCalledTimes(1)
    expect(mockUpdateBranchProtection).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      branch: 'release/*',
      enforce_admins: true,
    })
  })

  it('rethrows non-404 errors from getBranchProtection', async () => {
    const apiError = {status: 500, message: 'boom'}
    mockGetBranchProtection.mockRejectedValueOnce(apiError)

    await expect(
      branchesPlugin(createOctokit(), 'bfra-me', 'repo', [
        {name: 'main', protection: {enforce_admins: true}},
      ]),
    ).rejects.toEqual(apiError)

    expect(mockUpdateBranchProtection).not.toHaveBeenCalled()
  })

  it('warns and skips when branches config is not an array', async () => {
    await branchesPlugin(createOctokit(), 'bfra-me', 'repo', {name: 'main'})

    expect(mockWarning).toHaveBeenCalledWith('branches config must be an array, skipping')
    expect(mockGetBranchProtection).not.toHaveBeenCalled()
    expect(mockUpdateBranchProtection).not.toHaveBeenCalled()
  })
})

describe('sanitizeBranchProtection', () => {
  it('converts {enabled} objects to plain booleans and strips url fields', () => {
    const result = sanitizeBranchProtection({
      url: 'https://api.github.com/...',
      enforce_admins: {url: 'https://...', enabled: true},
      required_linear_history: {enabled: true},
      allow_force_pushes: {enabled: false},
      required_signatures: {url: 'https://...', enabled: false},
    })

    expect(result.enforce_admins).toBe(true)
    expect(result.required_linear_history).toBe(true)
    expect(result.allow_force_pushes).toBe(false)
    expect(result).not.toHaveProperty('url')
    expect(result).not.toHaveProperty('required_signatures')
  })

  it('sanitizes required_status_checks — prefers checks over contexts', () => {
    const result = sanitizeBranchProtection({
      required_status_checks: {
        url: 'https://...',
        strict: true,
        contexts: ['ci'],
        contexts_url: 'https://...',
        checks: [{context: 'ci', app_id: 15368}],
      },
    })

    const rsc = result.required_status_checks as Record<string, unknown>
    expect(rsc).not.toHaveProperty('url')
    expect(rsc).not.toHaveProperty('contexts_url')
    expect(rsc).not.toHaveProperty('contexts')
    expect(rsc.checks).toEqual([{context: 'ci', app_id: 15368}])
    expect(rsc.strict).toBe(true)
  })

  it('falls back to contexts when checks is absent', () => {
    const result = sanitizeBranchProtection({
      required_status_checks: {
        strict: true,
        contexts: ['ci/build'],
      },
    })

    const rsc = result.required_status_checks as Record<string, unknown>
    expect(rsc.contexts).toEqual(['ci/build'])
    expect(rsc).not.toHaveProperty('checks')
  })

  it('strips url from required_pull_request_reviews and restrictions', () => {
    const result = sanitizeBranchProtection({
      required_pull_request_reviews: {
        url: 'https://...',
        dismiss_stale_reviews: true,
        required_approving_review_count: 1,
      },
      restrictions: {
        url: 'https://...',
        users: [],
        teams: [],
      },
    })

    expect(result.required_pull_request_reviews).not.toHaveProperty('url')
    expect(
      (result.required_pull_request_reviews as Record<string, unknown>).dismiss_stale_reviews,
    ).toBe(true)
    expect(result.restrictions).not.toHaveProperty('url')
  })
})

describe('cleanupMergedProtection', () => {
  it('removes contexts when both contexts and checks are present', () => {
    const result = cleanupMergedProtection({
      required_status_checks: {
        strict: true,
        contexts: [],
        checks: [{context: 'ci', app_id: -1}],
      },
    })

    const rsc = result.required_status_checks as Record<string, unknown>
    expect(rsc).not.toHaveProperty('contexts')
    expect(rsc.checks).toEqual([{context: 'ci', app_id: -1}])
  })

  it('preserves contexts when checks is absent', () => {
    const result = cleanupMergedProtection({
      required_status_checks: {
        strict: true,
        contexts: ['ci/build'],
      },
    })

    const rsc = result.required_status_checks as Record<string, unknown>
    expect(rsc.contexts).toEqual(['ci/build'])
  })

  it('strips stray url fields from required_status_checks', () => {
    const result = cleanupMergedProtection({
      required_status_checks: {
        url: 'https://...',
        contexts_url: 'https://...',
        strict: true,
        contexts: ['ci'],
      },
    })

    const rsc = result.required_status_checks as Record<string, unknown>
    expect(rsc).not.toHaveProperty('url')
    expect(rsc).not.toHaveProperty('contexts_url')
  })
})
