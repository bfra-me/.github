import type {Octokit as OctokitType} from '@octokit/rest'
import type {SettingsConfig} from '../../config.js'
import {Octokit} from '@octokit/rest'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {branchesPlugin, cleanupMergedProtection, sanitizeBranchProtection} from '../branches.js'
import {applySettings, PLUGIN_REGISTRY} from '../index.js'

const mockGetRepo = vi.hoisted(() => vi.fn())
const mockGetBranchProtection = vi.hoisted(() => vi.fn())
const mockUpdateBranchProtection = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockInfo = vi.hoisted(() => vi.fn())
const mockWarning = vi.hoisted(() => vi.fn())
const mockDebug = vi.hoisted(() => vi.fn())
const mockError = vi.hoisted(() => vi.fn())
const mockSummaryWrite = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockSummaryAddTable = vi.hoisted(() => vi.fn(() => ({write: mockSummaryWrite})))

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    rest = {
      repos: {
        get: mockGetRepo,
        getBranchProtection: mockGetBranchProtection,
        updateBranchProtection: mockUpdateBranchProtection,
      },
    }
  },
}))

vi.mock('@actions/core', () => ({
  info: mockInfo,
  warning: mockWarning,
  debug: mockDebug,
  error: mockError,
  summary: {
    addTable: mockSummaryAddTable,
  },
}))

function createOctokit(): OctokitType {
  return new Octokit({auth: 'test-token'}) as unknown as OctokitType
}

/** Helper to mock repos.get returning an organization owner */
function mockOrgRepo() {
  mockGetRepo.mockResolvedValueOnce({data: {owner: {type: 'Organization'}}})
}

/** Helper to mock repos.get returning a user owner */
function mockUserRepo() {
  mockGetRepo.mockResolvedValueOnce({data: {owner: {type: 'User'}}})
}

describe('branchesPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRepo.mockResolvedValue({data: {owner: {type: 'Organization'}}})
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
    expect(rsc).not.toHaveProperty('checks')
    expect(rsc.contexts).toEqual([])
  })

  it('config contexts override existing checks from GET response', async () => {
    mockGetBranchProtection.mockResolvedValueOnce({
      data: {
        required_status_checks: {
          strict: true,
          contexts: ['Build Node.js', 'Build Python'],
          checks: [
            {context: 'Build Node.js', app_id: 15368},
            {context: 'Build Python', app_id: 15368},
          ],
        },
      },
    })

    await branchesPlugin(createOctokit(), 'bfra-me', 'repo', [
      {
        name: 'main',
        protection: {
          required_status_checks: {
            strict: true,
            contexts: ['Fro Bot', 'Build Node.js', 'Build Python', 'Renovate / Renovate'],
          },
        },
      },
    ])

    const call = mockUpdateBranchProtection.mock.calls[0]?.[0] as Record<string, unknown>
    const rsc = call.required_status_checks as Record<string, unknown>
    expect(rsc).not.toHaveProperty('checks')
    expect(rsc.contexts).toEqual([
      'Fro Bot',
      'Build Node.js',
      'Build Python',
      'Renovate / Renovate',
    ])
    expect(rsc.strict).toBe(true)
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
    // Second queued response is the post-update verification read-back; matching the
    // declared config keeps it non-divergent so this test's warning count stays scoped
    // to the three invalid entries it exists to cover.
    mockGetBranchProtection
      .mockResolvedValueOnce({data: {}})
      .mockResolvedValueOnce({data: {enforce_admins: true}})

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

  it('strips users and teams from bypass_pull_request_allowances on user-owned repos', async () => {
    mockUserRepo()
    mockGetBranchProtection.mockResolvedValueOnce({
      data: {
        required_pull_request_reviews: {
          required_approving_review_count: 1,
          bypass_pull_request_allowances: {
            users: ['maintainer'],
            teams: ['platform'],
            apps: ['renovate'],
          },
        },
      },
    })

    await branchesPlugin(createOctokit(), 'bfra-me', 'repo', [
      {
        name: 'main',
        protection: {
          required_pull_request_reviews: {
            required_approving_review_count: 1,
            bypass_pull_request_allowances: {
              apps: ['renovate'],
            },
          },
        },
      },
    ])

    const call = mockUpdateBranchProtection.mock.calls[0]?.[0] as Record<string, unknown>
    const rprr = call.required_pull_request_reviews as Record<string, unknown>
    const bpra = rprr.bypass_pull_request_allowances as Record<string, unknown>
    expect(bpra).not.toHaveProperty('users')
    expect(bpra).not.toHaveProperty('teams')
    expect(bpra.apps).toEqual(['renovate'])
  })

  it('removes dismissal_restrictions entirely on user-owned repos', async () => {
    mockUserRepo()
    mockGetBranchProtection.mockResolvedValueOnce({
      data: {
        required_pull_request_reviews: {
          dismiss_stale_reviews: true,
          dismissal_restrictions: {
            users: ['maintainer'],
            teams: ['platform'],
            apps: ['myapp'],
          },
        },
      },
    })

    await branchesPlugin(createOctokit(), 'bfra-me', 'repo', [
      {
        name: 'main',
        protection: {
          required_pull_request_reviews: {
            dismiss_stale_reviews: true,
          },
        },
      },
    ])

    const call = mockUpdateBranchProtection.mock.calls[0]?.[0] as Record<string, unknown>
    const rprr = call.required_pull_request_reviews as Record<string, unknown>
    expect(rprr).not.toHaveProperty('dismissal_restrictions')
  })

  it('forces restrictions to null on user-owned repos', async () => {
    mockUserRepo()
    mockGetBranchProtection.mockResolvedValueOnce({
      data: {
        restrictions: {
          users: [],
          teams: [],
          apps: ['renovate'],
        },
      },
    })

    await branchesPlugin(createOctokit(), 'bfra-me', 'repo', [
      {
        name: 'main',
        protection: {
          restrictions: {apps: ['renovate']},
        },
      },
    ])

    const call = mockUpdateBranchProtection.mock.calls[0]?.[0] as Record<string, unknown>
    expect(call.restrictions).toBeNull()
  })

  it('preserves users and teams in bypass_pull_request_allowances for org repos', async () => {
    mockOrgRepo()

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
})

function parseLoggedDebugPayload(callIndex: number): Record<string, unknown> {
  const line = mockDebug.mock.calls[callIndex]?.[0] as string
  const json = line.replace(/^Branch protection payload for [^:]+: /, '')
  return JSON.parse(json) as Record<string, unknown>
}

describe('branch protection debug logging', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRepo.mockResolvedValue({data: {owner: {type: 'Organization'}}})
    mockGetBranchProtection.mockResolvedValue({data: {}})
  })

  it('logs a scrubbed debug line once per branch before the update call', async () => {
    await branchesPlugin(createOctokit(), 'bfra-me', 'repo', [
      {name: 'main', protection: {enforce_admins: true}},
    ])

    expect(mockDebug).toHaveBeenCalledTimes(1)
    expect(mockDebug.mock.calls[0]?.[0]).toContain('main')

    const debugOrder = mockDebug.mock.invocationCallOrder[0] as number
    const updateOrder = mockUpdateBranchProtection.mock.invocationCallOrder[0] as number
    expect(debugOrder).toBeLessThan(updateOrder)
  })

  it('logs exactly one debug line per branch across multiple branches', async () => {
    await branchesPlugin(createOctokit(), 'bfra-me', 'repo', [
      {name: 'main', protection: {enforce_admins: true}},
      {name: 'develop', protection: {enforce_admins: false}},
    ])

    expect(mockDebug).toHaveBeenCalledTimes(2)
    expect(mockDebug.mock.calls[0]?.[0]).toContain('main')
    expect(mockDebug.mock.calls[1]?.[0]).toContain('develop')
  })

  it('scrubs bypass allowances, team slugs, and app IDs from the debug log but sends them unchanged', async () => {
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
          restrictions: {
            teams: [{slug: 'release-managers'}],
            apps: [{slug: 'renovate', id: 15368}],
          },
        },
      },
    ])

    const loggedLine = mockDebug.mock.calls[0]?.[0] as string
    expect(loggedLine).not.toContain('release-managers')
    expect(loggedLine).not.toContain('renovate')
    expect(loggedLine).not.toContain('15368')
    expect(loggedLine).not.toContain('maintainer')
    expect(loggedLine).not.toContain('platform')
    expect(loggedLine).toContain('[REDACTED]')

    const sentPayload = mockUpdateBranchProtection.mock.calls[0]?.[0] as Record<string, unknown>
    expect(
      (sentPayload.required_pull_request_reviews as Record<string, unknown>)
        .bypass_pull_request_allowances,
    ).toEqual({
      users: ['maintainer'],
      teams: ['platform'],
      apps: ['renovate'],
    })
    expect(sentPayload.restrictions).toEqual({
      teams: [{slug: 'release-managers'}],
      apps: [{slug: 'renovate', id: 15368}],
    })
  })

  it('scrubs principal-identifying fields nested under restrictions, not just top-level keys', async () => {
    await branchesPlugin(createOctokit(), 'bfra-me', 'repo', [
      {
        name: 'main',
        protection: {
          restrictions: {
            users: [{login: 'alice', id: 1}],
            teams: [{slug: 'platform-team', id: 2}],
            apps: [{slug: 'renovate', id: 3}],
          },
        },
      },
    ])

    const loggedLine = mockDebug.mock.calls[0]?.[0] as string
    expect(loggedLine).not.toContain('alice')
    expect(loggedLine).not.toContain('platform-team')
    expect(loggedLine).not.toContain('renovate')
    expect(loggedLine).toContain('[REDACTED]')

    const sentPayload = mockUpdateBranchProtection.mock.calls[0]?.[0] as Record<string, unknown>
    expect(sentPayload.restrictions).toEqual({
      users: [{login: 'alice', id: 1}],
      teams: [{slug: 'platform-team', id: 2}],
      apps: [{slug: 'renovate', id: 3}],
    })
  })

  it('produces a logged payload whose keys are a strict subset of the request payload keys', async () => {
    await branchesPlugin(createOctokit(), 'bfra-me', 'repo', [
      {
        name: 'main',
        protection: {
          enforce_admins: true,
          required_pull_request_reviews: {
            required_approving_review_count: 1,
            bypass_pull_request_allowances: {teams: ['platform']},
          },
          restrictions: {teams: [{slug: 'platform'}]},
        },
      },
    ])

    const loggedPayload = parseLoggedDebugPayload(0)
    const sentPayload = mockUpdateBranchProtection.mock.calls[0]?.[0] as Record<string, unknown>

    function assertKeysSubset(logged: unknown, sent: unknown): void {
      if (logged === null || typeof logged !== 'object') {
        return
      }
      if (Array.isArray(logged)) {
        expect(Array.isArray(sent)).toBe(true)
        const sentArr = sent as unknown[]
        for (const [index, item] of logged.entries()) {
          assertKeysSubset(item, sentArr[index])
        }
        return
      }
      const loggedObj = logged as Record<string, unknown>
      const sentObj = sent as Record<string, unknown>
      for (const key of Object.keys(loggedObj)) {
        expect(sentObj).toHaveProperty(key)
        assertKeysSubset(loggedObj[key], sentObj[key])
      }
    }

    assertKeysSubset(loggedPayload, sentPayload)
  })
})

describe('branch protection verification (read-back and divergence reporting)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRepo.mockResolvedValue({data: {owner: {type: 'Organization'}}})
    mockGetBranchProtection.mockResolvedValue({data: {}})
  })

  it('emits no warning and no Step Summary row when the read-back matches the declared config', async () => {
    mockGetBranchProtection
      .mockResolvedValueOnce({data: {}})
      .mockResolvedValueOnce({data: {enforce_admins: true}})

    await branchesPlugin(createOctokit(), 'bfra-me', 'repo', [
      {name: 'main', protection: {enforce_admins: true}},
    ])

    expect(mockGetBranchProtection).toHaveBeenCalledTimes(2)
    expect(mockWarning).not.toHaveBeenCalled()
    expect(mockSummaryAddTable).not.toHaveBeenCalled()
  })

  it('emits a warning and a Step Summary row when the read-back diverges, and the run still succeeds', async () => {
    mockGetBranchProtection
      .mockResolvedValueOnce({data: {}})
      .mockResolvedValueOnce({data: {enforce_admins: false}})

    await expect(
      branchesPlugin(createOctokit(), 'bfra-me', 'repo', [
        {name: 'main', protection: {enforce_admins: true}},
      ]),
    ).resolves.toBeUndefined()

    expect(mockWarning).toHaveBeenCalledWith(expect.stringContaining('main'))
    expect(mockWarning).toHaveBeenCalledWith(expect.stringContaining('enforce_admins'))

    expect(mockSummaryAddTable).toHaveBeenCalledTimes(1)
    const rows = mockSummaryAddTable.mock.calls[0]?.[0] as unknown[]
    expect(rows[1]).toEqual(['main', 'enforce_admins'])
    expect(mockSummaryWrite).toHaveBeenCalledTimes(1)
  })

  it('emits a warning and does not fail the run when the read-back GET returns 500', async () => {
    mockGetBranchProtection
      .mockResolvedValueOnce({data: {}})
      .mockRejectedValueOnce({status: 500, message: 'Internal Server Error'})

    await expect(
      branchesPlugin(createOctokit(), 'bfra-me', 'repo', [
        {name: 'main', protection: {enforce_admins: true}},
      ]),
    ).resolves.toBeUndefined()

    expect(mockWarning).toHaveBeenCalledWith(expect.stringContaining('main'))
    expect(mockSummaryAddTable).not.toHaveBeenCalled()
  })

  it('catches a throw from the comparison, warns, and does not fail the run', async () => {
    // A `has` trap on the observed read-back forces sanitizeBranchProtection's `field in data`
    // checks to throw for real, exercising the actual comparison call chain rather than a
    // mocked stand-in for it.
    const throwingObservedProtection = new Proxy(
      {},
      {
        has(): boolean {
          throw new Error('comparison exploded')
        },
      },
    )

    mockGetBranchProtection
      .mockResolvedValueOnce({data: {}})
      .mockResolvedValueOnce({data: throwingObservedProtection})

    await expect(
      branchesPlugin(createOctokit(), 'bfra-me', 'repo', [
        {name: 'main', protection: {enforce_admins: true}},
      ]),
    ).resolves.toBeUndefined()

    expect(mockWarning).toHaveBeenCalledWith(expect.stringContaining('main'))
  })

  it('runs no read-back at all when the update fails', async () => {
    mockGetBranchProtection.mockResolvedValueOnce({data: {}})
    mockUpdateBranchProtection.mockRejectedValueOnce({status: 500, message: 'boom'})

    await expect(
      branchesPlugin(createOctokit(), 'bfra-me', 'repo', [
        {name: 'main', protection: {enforce_admins: true}},
      ]),
    ).rejects.toBeTruthy()

    expect(mockGetBranchProtection).toHaveBeenCalledTimes(1)
  })

  it('still verifies after the first successful update for a branch with no prior protection', async () => {
    mockGetBranchProtection
      .mockRejectedValueOnce({status: 404, message: 'Not Found'})
      .mockResolvedValueOnce({data: {enforce_admins: false}})

    await expect(
      branchesPlugin(createOctokit(), 'bfra-me', 'repo', [
        {name: 'main', protection: {enforce_admins: true}},
      ]),
    ).resolves.toBeUndefined()

    expect(mockGetBranchProtection).toHaveBeenCalledTimes(2)
    expect(mockWarning).toHaveBeenCalledWith(expect.stringContaining('main'))
  })
})

describe('branch protection verification — cross-plugin isolation (R8)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRepo.mockResolvedValue({data: {owner: {type: 'Organization'}}})
    mockGetBranchProtection.mockResolvedValue({data: {}})
  })

  it('issues read-back requests only for branches when a config exercises labels and teams alongside branches', async () => {
    const originalLabels = PLUGIN_REGISTRY.labels
    const originalTeams = PLUGIN_REGISTRY.teams
    const mockLabelsPlugin = vi.fn().mockResolvedValue(undefined)
    const mockTeamsPlugin = vi.fn().mockResolvedValue(undefined)
    PLUGIN_REGISTRY.labels = mockLabelsPlugin
    PLUGIN_REGISTRY.teams = mockTeamsPlugin

    mockGetBranchProtection
      .mockResolvedValueOnce({data: {}})
      .mockResolvedValueOnce({data: {enforce_admins: true}})

    try {
      const config: SettingsConfig = {
        labels: [{name: 'bug'}],
        teams: [{name: 'core', permission: 'push'}],
        branches: [{name: 'main', protection: {enforce_admins: true}}],
      }

      await expect(
        applySettings(createOctokit(), 'bfra-me', 'repo', config),
      ).resolves.toBeUndefined()

      expect(mockLabelsPlugin).toHaveBeenCalledTimes(1)
      expect(mockTeamsPlugin).toHaveBeenCalledTimes(1)
      expect(mockGetBranchProtection).toHaveBeenCalledTimes(2)
    } finally {
      PLUGIN_REGISTRY.labels = originalLabels
      PLUGIN_REGISTRY.teams = originalTeams
    }
  })

  it('keeps divergence warnings distinguishable from an unrelated plugin failure', async () => {
    const originalLabels = PLUGIN_REGISTRY.labels
    PLUGIN_REGISTRY.labels = vi.fn().mockRejectedValue(new Error('labels failed'))

    mockGetBranchProtection
      .mockResolvedValueOnce({data: {}})
      .mockResolvedValueOnce({data: {enforce_admins: false}})

    try {
      const config: SettingsConfig = {
        labels: [{name: 'bug'}],
        branches: [{name: 'main', protection: {enforce_admins: true}}],
      }

      let caught: Error | undefined
      try {
        await applySettings(createOctokit(), 'bfra-me', 'repo', config)
      } catch (error) {
        caught = error as Error
      }

      expect(caught).toBeDefined()
      expect(caught?.message).toContain('labels failed')
      expect(caught?.message).not.toContain('enforce_admins')

      expect(mockWarning).toHaveBeenCalledWith(expect.stringContaining('enforce_admins'))
    } finally {
      PLUGIN_REGISTRY.labels = originalLabels
    }
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

  it('forces restrictions to null when isOrganization is false', () => {
    const result = cleanupMergedProtection(
      {
        restrictions: {
          users: ['alice'],
          teams: ['platform'],
          apps: ['renovate'],
        },
      },
      false,
    )

    expect(result.restrictions).toBeNull()
  })

  it('strips users and teams from bypass_pull_request_allowances when isOrganization is false', () => {
    const result = cleanupMergedProtection(
      {
        required_pull_request_reviews: {
          bypass_pull_request_allowances: {
            users: ['maintainer'],
            teams: ['platform'],
            apps: ['renovate'],
          },
        },
      },
      false,
    )

    const rprr = result.required_pull_request_reviews as Record<string, unknown>
    const bpra = rprr.bypass_pull_request_allowances as Record<string, unknown>
    expect(bpra).not.toHaveProperty('users')
    expect(bpra).not.toHaveProperty('teams')
    expect(bpra.apps).toEqual(['renovate'])
  })

  it('removes dismissal_restrictions entirely when isOrganization is false', () => {
    const result = cleanupMergedProtection(
      {
        required_pull_request_reviews: {
          dismiss_stale_reviews: true,
          dismissal_restrictions: {
            users: ['maintainer'],
            teams: ['platform'],
            apps: ['myapp'],
          },
        },
      },
      false,
    )

    const rprr = result.required_pull_request_reviews as Record<string, unknown>
    expect(rprr).not.toHaveProperty('dismissal_restrictions')
    expect(rprr.dismiss_stale_reviews).toBe(true)
  })

  it('preserves users and teams in restrictions when isOrganization is true', () => {
    const result = cleanupMergedProtection(
      {
        restrictions: {
          users: ['alice'],
          teams: ['platform'],
          apps: ['renovate'],
        },
      },
      true,
    )

    const restrictions = result.restrictions as Record<string, unknown>
    expect(restrictions.users).toEqual(['alice'])
    expect(restrictions.teams).toEqual(['platform'])
    expect(restrictions.apps).toEqual(['renovate'])
  })

  it('leaves restrictions null unchanged when isOrganization is false', () => {
    const result = cleanupMergedProtection({restrictions: null}, false)
    expect(result.restrictions).toBeNull()
  })
})
