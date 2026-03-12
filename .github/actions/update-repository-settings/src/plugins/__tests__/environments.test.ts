import type {Octokit as OctokitType} from '@octokit/rest'
import {Octokit} from '@octokit/rest'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {environmentsPlugin} from '../environments.js'

const mockGetAllEnvironments = vi.hoisted(() => vi.fn())
const mockCreateOrUpdateEnvironment = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockDeleteAnEnvironment = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockInfo = vi.hoisted(() => vi.fn())
const mockWarning = vi.hoisted(() => vi.fn())

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    rest = {
      repos: {
        getAllEnvironments: mockGetAllEnvironments,
        createOrUpdateEnvironment: mockCreateOrUpdateEnvironment,
        deleteAnEnvironment: mockDeleteAnEnvironment,
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

function mockEnvironments(names: string[]): void {
  mockGetAllEnvironments.mockResolvedValue({
    data: {
      environments: names.map(name => ({name})),
    },
  })
}

describe('environmentsPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnvironments([])
  })

  it('creates new environments not in the current state', async () => {
    await environmentsPlugin(createOctokit(), 'bfra-me', 'repo', [
      {
        name: 'production',
        wait_timer: 30,
        reviewers: [{type: 'Team', id: 123}],
        deployment_branch_policy: {protected_branches: true},
      },
    ])

    expect(mockCreateOrUpdateEnvironment).toHaveBeenCalledTimes(1)
    expect(mockCreateOrUpdateEnvironment).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      environment_name: 'production',
      wait_timer: 30,
      reviewers: [{type: 'Team', id: 123}],
      deployment_branch_policy: {protected_branches: true},
    })
    expect(mockDeleteAnEnvironment).not.toHaveBeenCalled()
  })

  it('updates existing environments', async () => {
    mockEnvironments(['production'])

    await environmentsPlugin(createOctokit(), 'bfra-me', 'repo', [
      {
        name: 'production',
        wait_timer: 15,
      },
    ])

    expect(mockCreateOrUpdateEnvironment).toHaveBeenCalledTimes(1)
    expect(mockCreateOrUpdateEnvironment).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      environment_name: 'production',
      wait_timer: 15,
    })
    expect(mockDeleteAnEnvironment).not.toHaveBeenCalled()
  })

  it('removes environments not present in the desired config', async () => {
    mockEnvironments(['staging', 'old-env'])

    await environmentsPlugin(createOctokit(), 'bfra-me', 'repo', [{name: 'staging', wait_timer: 5}])

    expect(mockDeleteAnEnvironment).toHaveBeenCalledTimes(1)
    expect(mockDeleteAnEnvironment).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      environment_name: 'old-env',
    })
    expect(mockCreateOrUpdateEnvironment).toHaveBeenCalledTimes(1)
  })

  it('handles empty config as a no-op', async () => {
    mockEnvironments(['staging', 'old-env'])

    await environmentsPlugin(createOctokit(), 'bfra-me', 'repo', [])

    expect(mockCreateOrUpdateEnvironment).not.toHaveBeenCalled()
    expect(mockDeleteAnEnvironment).not.toHaveBeenCalled()
  })

  it('handles non-array config with warning', async () => {
    await environmentsPlugin(createOctokit(), 'bfra-me', 'repo', {name: 'production'})

    expect(mockWarning).toHaveBeenCalledWith('environments config must be an array, skipping')
    expect(mockGetAllEnvironments).not.toHaveBeenCalled()
    expect(mockCreateOrUpdateEnvironment).not.toHaveBeenCalled()
    expect(mockDeleteAnEnvironment).not.toHaveBeenCalled()
  })

  it('syncs add, update, and remove operations in one run', async () => {
    mockEnvironments(['Production', 'staging', 'old-env'])

    await environmentsPlugin(createOctokit(), 'bfra-me', 'repo', [
      {
        name: 'production',
        wait_timer: 30,
      },
      {
        name: 'preview',
        reviewers: [{type: 'User', id: 456}],
      },
    ])

    expect(mockCreateOrUpdateEnvironment).toHaveBeenCalledTimes(2)
    expect(mockCreateOrUpdateEnvironment).toHaveBeenNthCalledWith(1, {
      owner: 'bfra-me',
      repo: 'repo',
      environment_name: 'production',
      wait_timer: 30,
    })
    expect(mockCreateOrUpdateEnvironment).toHaveBeenNthCalledWith(2, {
      owner: 'bfra-me',
      repo: 'repo',
      environment_name: 'preview',
      reviewers: [{type: 'User', id: 456}],
    })
    expect(mockDeleteAnEnvironment).toHaveBeenCalledTimes(2)
    expect(mockDeleteAnEnvironment).toHaveBeenNthCalledWith(1, {
      owner: 'bfra-me',
      repo: 'repo',
      environment_name: 'staging',
    })
    expect(mockDeleteAnEnvironment).toHaveBeenNthCalledWith(2, {
      owner: 'bfra-me',
      repo: 'repo',
      environment_name: 'old-env',
    })
  })

  it('matches environments case-insensitively by name', async () => {
    mockEnvironments(['Production'])

    await environmentsPlugin(createOctokit(), 'bfra-me', 'repo', [
      {name: 'production', wait_timer: 30},
    ])

    expect(mockCreateOrUpdateEnvironment).toHaveBeenCalledTimes(1)
    expect(mockDeleteAnEnvironment).not.toHaveBeenCalled()
  })
})
