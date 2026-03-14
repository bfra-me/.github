import type {Octokit as OctokitType} from '@octokit/rest'
import {Octokit} from '@octokit/rest'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {collaboratorsPlugin} from '../collaborators.js'

const mockListCollaborators = vi.hoisted(() => vi.fn())
const mockAddCollaborator = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockRemoveCollaborator = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockInfo = vi.hoisted(() => vi.fn())
const mockWarning = vi.hoisted(() => vi.fn())

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    rest = {
      repos: {
        listCollaborators: mockListCollaborators,
        addCollaborator: mockAddCollaborator,
        removeCollaborator: mockRemoveCollaborator,
      },
    }
  },
}))

vi.mock('@actions/core', () => ({
  info: mockInfo,
  warning: mockWarning,
}))

interface MockCollaborator {
  login: string
  role_name?: string
}

function createOctokit(): OctokitType {
  return new Octokit({auth: 'test-token'}) as unknown as OctokitType
}

function mockCollaborators(collaborators: MockCollaborator[]): void {
  mockListCollaborators.mockResolvedValue({data: collaborators})
}

describe('collaboratorsPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCollaborators([])
  })

  it('adds new collaborators not in the current state', async () => {
    await collaboratorsPlugin(createOctokit(), 'bfra-me', 'repo', [
      {username: 'alice', permission: 'push'},
    ])

    expect(mockAddCollaborator).toHaveBeenCalledTimes(1)
    expect(mockAddCollaborator).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      username: 'alice',
      permission: 'push',
    })
    expect(mockRemoveCollaborator).not.toHaveBeenCalled()
  })

  it('updates existing collaborators when permissions change', async () => {
    mockCollaborators([{login: 'alice', role_name: 'push'}])

    await collaboratorsPlugin(createOctokit(), 'bfra-me', 'repo', [
      {username: 'alice', permission: 'admin'},
    ])

    expect(mockAddCollaborator).toHaveBeenCalledTimes(1)
    expect(mockAddCollaborator).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      username: 'alice',
      permission: 'admin',
    })
    expect(mockRemoveCollaborator).not.toHaveBeenCalled()
  })

  it('removes collaborators not present in the desired config', async () => {
    mockCollaborators([
      {login: 'alice', role_name: 'push'},
      {login: 'bob', role_name: 'admin'},
    ])

    await collaboratorsPlugin(createOctokit(), 'bfra-me', 'repo', [
      {username: 'alice', permission: 'push'},
    ])

    expect(mockRemoveCollaborator).toHaveBeenCalledTimes(1)
    expect(mockRemoveCollaborator).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      username: 'bob',
    })
  })

  it('does not remove the repository owner', async () => {
    mockCollaborators([
      {login: 'bfra-me', role_name: 'admin'},
      {login: 'bob', role_name: 'push'},
    ])

    await collaboratorsPlugin(createOctokit(), 'bfra-me', 'repo', [
      {username: 'alice', permission: 'push'},
    ])

    expect(mockRemoveCollaborator).toHaveBeenCalledTimes(1)
    expect(mockRemoveCollaborator).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      username: 'bob',
    })
    expect(mockRemoveCollaborator).not.toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      username: 'bfra-me',
    })
  })

  it('skips the repo owner in desired collaborators with a warning', async () => {
    mockCollaborators([])

    await collaboratorsPlugin(createOctokit(), 'marcusrbrown', 'repo', [
      {username: 'marcusrbrown', permission: 'admin'},
      {username: 'alice', permission: 'push'},
    ])

    expect(mockWarning).toHaveBeenCalledWith(
      "Skipping collaborator 'marcusrbrown': repository owner cannot be added as a collaborator",
    )
    expect(mockAddCollaborator).toHaveBeenCalledTimes(1)
    expect(mockAddCollaborator).toHaveBeenCalledWith({
      owner: 'marcusrbrown',
      repo: 'repo',
      username: 'alice',
      permission: 'push',
    })
  })

  it('skips the repo owner case-insensitively', async () => {
    mockCollaborators([])

    await collaboratorsPlugin(createOctokit(), 'MyOrg', 'repo', [
      {username: 'myorg', permission: 'admin'},
      {username: 'bob', permission: 'push'},
    ])

    expect(mockWarning).toHaveBeenCalledWith(
      "Skipping collaborator 'MyOrg': repository owner cannot be added as a collaborator",
    )
    expect(mockAddCollaborator).toHaveBeenCalledTimes(1)
    expect(mockAddCollaborator).toHaveBeenCalledWith({
      owner: 'MyOrg',
      repo: 'repo',
      username: 'bob',
      permission: 'push',
    })
  })

  it('handles an empty config as a no-op', async () => {
    mockCollaborators([{login: 'bob', role_name: 'push'}])

    await collaboratorsPlugin(createOctokit(), 'bfra-me', 'repo', [])

    expect(mockListCollaborators).not.toHaveBeenCalled()
    expect(mockAddCollaborator).not.toHaveBeenCalled()
    expect(mockRemoveCollaborator).not.toHaveBeenCalled()
  })

  it('skips non-array config with a warning', async () => {
    await collaboratorsPlugin(createOctokit(), 'bfra-me', 'repo', {username: 'alice'})

    expect(mockWarning).toHaveBeenCalledWith('collaborators config must be an array, skipping')
    expect(mockListCollaborators).not.toHaveBeenCalled()
    expect(mockAddCollaborator).not.toHaveBeenCalled()
    expect(mockRemoveCollaborator).not.toHaveBeenCalled()
  })

  it('handles add, update, and remove in a single sync', async () => {
    mockCollaborators([
      {login: 'alice', role_name: 'push'},
      {login: 'bob', role_name: 'admin'},
      {login: 'dave', role_name: 'push'},
    ])

    await collaboratorsPlugin(createOctokit(), 'bfra-me', 'repo', [
      {username: 'alice', permission: 'admin'},
      {username: 'carol', permission: 'push'},
    ])

    expect(mockAddCollaborator).toHaveBeenCalledTimes(2)
    expect(mockAddCollaborator).toHaveBeenNthCalledWith(1, {
      owner: 'bfra-me',
      repo: 'repo',
      username: 'carol',
      permission: 'push',
    })
    expect(mockAddCollaborator).toHaveBeenNthCalledWith(2, {
      owner: 'bfra-me',
      repo: 'repo',
      username: 'alice',
      permission: 'admin',
    })
    expect(mockRemoveCollaborator).toHaveBeenCalledTimes(2)
    expect(mockRemoveCollaborator).toHaveBeenNthCalledWith(1, {
      owner: 'bfra-me',
      repo: 'repo',
      username: 'bob',
    })
    expect(mockRemoveCollaborator).toHaveBeenNthCalledWith(2, {
      owner: 'bfra-me',
      repo: 'repo',
      username: 'dave',
    })
  })

  it('matches collaborators case-insensitively by username', async () => {
    mockCollaborators([{login: 'Alice', role_name: 'push'}])

    await collaboratorsPlugin(createOctokit(), 'bfra-me', 'repo', [
      {username: 'alice', permission: 'push'},
    ])

    expect(mockAddCollaborator).not.toHaveBeenCalled()
    expect(mockRemoveCollaborator).not.toHaveBeenCalled()
  })
})
