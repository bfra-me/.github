import type {Octokit as OctokitType} from '@octokit/rest'
import {Octokit} from '@octokit/rest'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {rulesetsPlugin} from '../rulesets.js'

const mockGetRepoRulesets = vi.hoisted(() => vi.fn())
const mockCreateRepoRuleset = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockUpdateRepoRuleset = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockDeleteRepoRuleset = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockInfo = vi.hoisted(() => vi.fn())
const mockWarning = vi.hoisted(() => vi.fn())

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    rest = {
      repos: {
        getRepoRulesets: mockGetRepoRulesets,
        createRepoRuleset: mockCreateRepoRuleset,
        updateRepoRuleset: mockUpdateRepoRuleset,
        deleteRepoRuleset: mockDeleteRepoRuleset,
      },
    }
  },
}))

vi.mock('@actions/core', () => ({
  info: mockInfo,
  warning: mockWarning,
}))

interface MockRuleset {
  id: number
  name: string
  enforcement?: string
}

const requireReviewRule = [{type: 'pull_request', parameters: {required_approving_review_count: 1}}]
const stricterRequireReviewRule = [
  {type: 'pull_request', parameters: {required_approving_review_count: 2}},
]
const mainBranchCondition = {ref_name: {include: ['refs/heads/main']}}
const deletionRule = [{type: 'deletion'}]

function createOctokit(): OctokitType {
  return new Octokit({auth: 'test-token'}) as unknown as OctokitType
}

function mockRulesets(rulesets: MockRuleset[]): void {
  mockGetRepoRulesets.mockResolvedValue({data: rulesets})
}

describe('rulesetsPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRulesets([])
  })

  it('creates new rulesets', async () => {
    await rulesetsPlugin(createOctokit(), 'bfra-me', 'repo', [
      {
        name: 'require-review',
        enforcement: 'active',
        rules: requireReviewRule,
        conditions: mainBranchCondition,
      },
    ])

    expect(mockCreateRepoRuleset).toHaveBeenCalledTimes(1)
    expect(mockCreateRepoRuleset).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      name: 'require-review',
      enforcement: 'active',
      rules: requireReviewRule,
      conditions: mainBranchCondition,
    })
    expect(mockUpdateRepoRuleset).not.toHaveBeenCalled()
    expect(mockDeleteRepoRuleset).not.toHaveBeenCalled()
  })

  it('updates existing rulesets using the id from fetched state', async () => {
    mockRulesets([{id: 42, name: 'require-review', enforcement: 'active'}])

    await rulesetsPlugin(createOctokit(), 'bfra-me', 'repo', [
      {
        name: 'require-review',
        enforcement: 'evaluate',
        rules: stricterRequireReviewRule,
      },
    ])

    expect(mockUpdateRepoRuleset).toHaveBeenCalledTimes(1)
    expect(mockUpdateRepoRuleset).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      ruleset_id: 42,
      name: 'require-review',
      enforcement: 'evaluate',
      rules: stricterRequireReviewRule,
    })
    expect(mockCreateRepoRuleset).not.toHaveBeenCalled()
    expect(mockDeleteRepoRuleset).not.toHaveBeenCalled()
  })

  it('removes rulesets using ids from current state', async () => {
    mockRulesets([
      {id: 42, name: 'require-review', enforcement: 'active'},
      {id: 99, name: 'legacy', enforcement: 'disabled'},
    ])

    await rulesetsPlugin(createOctokit(), 'bfra-me', 'repo', [
      {name: 'require-review', enforcement: 'active'},
    ])

    expect(mockDeleteRepoRuleset).toHaveBeenCalledTimes(1)
    expect(mockDeleteRepoRuleset).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      ruleset_id: 99,
    })
  })

  it('handles empty config as a no-op', async () => {
    mockRulesets([
      {id: 42, name: 'require-review', enforcement: 'active'},
      {id: 99, name: 'legacy', enforcement: 'disabled'},
    ])

    await rulesetsPlugin(createOctokit(), 'bfra-me', 'repo', [])

    expect(mockCreateRepoRuleset).not.toHaveBeenCalled()
    expect(mockUpdateRepoRuleset).not.toHaveBeenCalled()
    expect(mockDeleteRepoRuleset).not.toHaveBeenCalled()
  })

  it('handles non-array config with warning', async () => {
    await rulesetsPlugin(createOctokit(), 'bfra-me', 'repo', {name: 'require-review'})

    expect(mockWarning).toHaveBeenCalledWith('rulesets config must be an array, skipping')
    expect(mockGetRepoRulesets).not.toHaveBeenCalled()
    expect(mockCreateRepoRuleset).not.toHaveBeenCalled()
    expect(mockUpdateRepoRuleset).not.toHaveBeenCalled()
    expect(mockDeleteRepoRuleset).not.toHaveBeenCalled()
  })

  it('uses the correct current id when names match with different casing', async () => {
    mockRulesets([{id: 42, name: 'Require-Review', enforcement: 'active'}])

    await rulesetsPlugin(createOctokit(), 'bfra-me', 'repo', [
      {
        name: 'require-review',
        enforcement: 'active',
        rules: requireReviewRule,
      },
    ])

    expect(mockUpdateRepoRuleset).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      ruleset_id: 42,
      name: 'require-review',
      enforcement: 'active',
      rules: requireReviewRule,
    })
  })

  it('syncs add, update, and remove in one run', async () => {
    mockRulesets([
      {id: 42, name: 'require-review', enforcement: 'active'},
      {id: 99, name: 'legacy', enforcement: 'disabled'},
    ])

    await rulesetsPlugin(createOctokit(), 'bfra-me', 'repo', [
      {
        name: 'require-review',
        enforcement: 'evaluate',
        rules: stricterRequireReviewRule,
      },
      {
        name: 'protect-main',
        enforcement: 'active',
        rules: deletionRule,
      },
    ])

    expect(mockCreateRepoRuleset).toHaveBeenCalledTimes(1)
    expect(mockCreateRepoRuleset).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      name: 'protect-main',
      enforcement: 'active',
      rules: deletionRule,
    })
    expect(mockUpdateRepoRuleset).toHaveBeenCalledTimes(1)
    expect(mockUpdateRepoRuleset).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      ruleset_id: 42,
      name: 'require-review',
      enforcement: 'evaluate',
      rules: stricterRequireReviewRule,
    })
    expect(mockDeleteRepoRuleset).toHaveBeenCalledTimes(1)
    expect(mockDeleteRepoRuleset).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      ruleset_id: 99,
    })
  })
})
