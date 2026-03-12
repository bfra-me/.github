import type {Octokit as OctokitType} from '@octokit/rest'
import {Octokit} from '@octokit/rest'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {branchesPlugin} from '../branches.js'

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

  it('preserves existing fields while config overrides and extends protection', async () => {
    mockGetBranchProtection.mockResolvedValueOnce({
      data: {
        enforce_admins: {enabled: true},
        required_status_checks: {
          strict: true,
          contexts: ['ci'],
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

    expect(mockUpdateBranchProtection).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      branch: 'main',
      enforce_admins: {enabled: true},
      required_status_checks: {
        strict: true,
        contexts: ['ci'],
      },
      required_pull_request_reviews: {
        required_approving_review_count: 2,
      },
    })
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
