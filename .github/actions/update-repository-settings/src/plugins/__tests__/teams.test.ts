import type {Octokit as OctokitType} from '@octokit/rest'
import {Octokit} from '@octokit/rest'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {teamsPlugin} from '../teams.js'

const mockListTeams = vi.hoisted(() => vi.fn())
const mockAddOrUpdateRepoPermissionsInOrg = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockRemoveRepoInOrg = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockInfo = vi.hoisted(() => vi.fn())
const mockWarning = vi.hoisted(() => vi.fn())

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    rest = {
      repos: {
        listTeams: mockListTeams,
      },
      teams: {
        addOrUpdateRepoPermissionsInOrg: mockAddOrUpdateRepoPermissionsInOrg,
        removeRepoInOrg: mockRemoveRepoInOrg,
      },
    }
  },
}))

vi.mock('@actions/core', () => ({
  info: mockInfo,
  warning: mockWarning,
}))

interface MockTeam {
  slug: string
  permission?: string | null
}

function createOctokit(): OctokitType {
  return new Octokit({auth: 'test-token'}) as unknown as OctokitType
}

function mockTeams(teams: MockTeam[]): void {
  mockListTeams.mockResolvedValue({data: teams})
}

describe('teamsPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTeams([])
  })

  it('adds new teams not in the current state', async () => {
    await teamsPlugin(createOctokit(), 'bfra-me', 'repo', [{name: 'devs', permission: 'push'}])

    expect(mockAddOrUpdateRepoPermissionsInOrg).toHaveBeenCalledTimes(1)
    expect(mockAddOrUpdateRepoPermissionsInOrg).toHaveBeenCalledWith({
      org: 'bfra-me',
      team_slug: 'devs',
      owner: 'bfra-me',
      repo: 'repo',
      permission: 'push',
    })
    expect(mockRemoveRepoInOrg).not.toHaveBeenCalled()
  })

  it('updates existing teams when permissions change', async () => {
    mockTeams([{slug: 'devs', permission: 'push'}])

    await teamsPlugin(createOctokit(), 'bfra-me', 'repo', [{name: 'devs', permission: 'admin'}])

    expect(mockAddOrUpdateRepoPermissionsInOrg).toHaveBeenCalledTimes(1)
    expect(mockAddOrUpdateRepoPermissionsInOrg).toHaveBeenCalledWith({
      org: 'bfra-me',
      team_slug: 'devs',
      owner: 'bfra-me',
      repo: 'repo',
      permission: 'admin',
    })
    expect(mockRemoveRepoInOrg).not.toHaveBeenCalled()
  })

  it('removes teams not present in the desired config', async () => {
    mockTeams([
      {slug: 'devs', permission: 'push'},
      {slug: 'old-team', permission: 'pull'},
    ])

    await teamsPlugin(createOctokit(), 'bfra-me', 'repo', [{name: 'devs', permission: 'push'}])

    expect(mockRemoveRepoInOrg).toHaveBeenCalledTimes(1)
    expect(mockRemoveRepoInOrg).toHaveBeenCalledWith({
      org: 'bfra-me',
      team_slug: 'old-team',
      owner: 'bfra-me',
      repo: 'repo',
    })
  })

  it('handles an empty config as a no-op', async () => {
    mockTeams([{slug: 'devs', permission: 'push'}])

    await teamsPlugin(createOctokit(), 'bfra-me', 'repo', [])

    expect(mockListTeams).not.toHaveBeenCalled()
    expect(mockAddOrUpdateRepoPermissionsInOrg).not.toHaveBeenCalled()
    expect(mockRemoveRepoInOrg).not.toHaveBeenCalled()
  })

  it('skips non-array config with a warning', async () => {
    await teamsPlugin(createOctokit(), 'bfra-me', 'repo', {name: 'devs'})

    expect(mockWarning).toHaveBeenCalledWith('teams config must be an array, skipping')
    expect(mockListTeams).not.toHaveBeenCalled()
    expect(mockAddOrUpdateRepoPermissionsInOrg).not.toHaveBeenCalled()
    expect(mockRemoveRepoInOrg).not.toHaveBeenCalled()
  })

  it('handles add, update, and remove in a single sync', async () => {
    mockTeams([
      {slug: 'devs', permission: 'push'},
      {slug: 'legacy', permission: 'pull'},
      {slug: 'ops', permission: 'pull'},
    ])

    await teamsPlugin(createOctokit(), 'bfra-me', 'repo', [
      {name: 'devs', permission: 'admin'},
      {name: 'platform', permission: 'maintain'},
    ])

    expect(mockAddOrUpdateRepoPermissionsInOrg).toHaveBeenCalledTimes(2)
    expect(mockAddOrUpdateRepoPermissionsInOrg).toHaveBeenNthCalledWith(1, {
      org: 'bfra-me',
      team_slug: 'platform',
      owner: 'bfra-me',
      repo: 'repo',
      permission: 'maintain',
    })
    expect(mockAddOrUpdateRepoPermissionsInOrg).toHaveBeenNthCalledWith(2, {
      org: 'bfra-me',
      team_slug: 'devs',
      owner: 'bfra-me',
      repo: 'repo',
      permission: 'admin',
    })
    expect(mockRemoveRepoInOrg).toHaveBeenCalledTimes(2)
    expect(mockRemoveRepoInOrg).toHaveBeenNthCalledWith(1, {
      org: 'bfra-me',
      team_slug: 'legacy',
      owner: 'bfra-me',
      repo: 'repo',
    })
    expect(mockRemoveRepoInOrg).toHaveBeenNthCalledWith(2, {
      org: 'bfra-me',
      team_slug: 'ops',
      owner: 'bfra-me',
      repo: 'repo',
    })
  })

  it('matches team names case-insensitively', async () => {
    mockTeams([{slug: 'Devs', permission: 'push'}])

    await teamsPlugin(createOctokit(), 'bfra-me', 'repo', [{name: 'devs', permission: 'push'}])

    expect(mockAddOrUpdateRepoPermissionsInOrg).not.toHaveBeenCalled()
    expect(mockRemoveRepoInOrg).not.toHaveBeenCalled()
  })
})
