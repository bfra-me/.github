import type {Octokit as OctokitType} from '@octokit/rest'
import {Octokit} from '@octokit/rest'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {repositoryPlugin} from '../repository.js'

const mockReposUpdate = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockReplaceAllTopics = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockRequest = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockInfo = vi.hoisted(() => vi.fn())
const mockWarning = vi.hoisted(() => vi.fn())

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    rest = {
      repos: {
        update: mockReposUpdate,
        replaceAllTopics: mockReplaceAllTopics,
      },
    }

    request = mockRequest
  },
}))

vi.mock('@actions/core', () => ({
  info: mockInfo,
  warning: mockWarning,
}))

function createOctokit(): OctokitType {
  return new Octokit({auth: 'test-token'}) as unknown as OctokitType
}

describe('repositoryPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls repos.update() with general repository fields', async () => {
    await repositoryPlugin(createOctokit(), 'bfra-me', 'repo', {
      name: 'renamed-repo',
      description: 'repo description',
      has_issues: true,
      allow_auto_merge: true,
      delete_branch_on_merge: true,
    })

    expect(mockReposUpdate).toHaveBeenCalledTimes(1)
    expect(mockReposUpdate).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      name: 'renamed-repo',
      description: 'repo description',
      has_issues: true,
      allow_auto_merge: true,
      delete_branch_on_merge: true,
    })
    expect(mockReplaceAllTopics).not.toHaveBeenCalled()
    expect(mockRequest).not.toHaveBeenCalled()
  })

  it('handles topics as array and calls replaceAllTopics()', async () => {
    await repositoryPlugin(createOctokit(), 'bfra-me', 'repo', {
      topics: ['actions', 'typescript'],
    })

    expect(mockReplaceAllTopics).toHaveBeenCalledTimes(1)
    expect(mockReplaceAllTopics).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      names: ['actions', 'typescript'],
    })
    expect(mockReposUpdate).not.toHaveBeenCalled()
  })

  it('handles topics as comma-delimited string and normalizes values', async () => {
    await repositoryPlugin(createOctokit(), 'bfra-me', 'repo', {
      topics: 'actions, typescript,  ci ,,',
    })

    expect(mockReplaceAllTopics).toHaveBeenCalledTimes(1)
    expect(mockReplaceAllTopics).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      names: ['actions', 'typescript', 'ci'],
    })
  })

  it('uses PUT automated-security-fixes endpoint when enabled', async () => {
    await repositoryPlugin(createOctokit(), 'bfra-me', 'repo', {
      enable_automated_security_fixes: true,
    })

    expect(mockRequest).toHaveBeenCalledTimes(1)
    expect(mockRequest).toHaveBeenCalledWith('PUT /repos/{owner}/{repo}/automated-security-fixes', {
      owner: 'bfra-me',
      repo: 'repo',
    })
    expect(mockReposUpdate).not.toHaveBeenCalled()
  })

  it('uses DELETE automated-security-fixes endpoint when disabled', async () => {
    await repositoryPlugin(createOctokit(), 'bfra-me', 'repo', {
      enable_automated_security_fixes: false,
    })

    expect(mockRequest).toHaveBeenCalledTimes(1)
    expect(mockRequest).toHaveBeenCalledWith(
      'DELETE /repos/{owner}/{repo}/automated-security-fixes',
      {owner: 'bfra-me', repo: 'repo'},
    )
    expect(mockReposUpdate).not.toHaveBeenCalled()
  })

  it('uses correct PUT and DELETE vulnerability-alerts endpoints', async () => {
    await repositoryPlugin(createOctokit(), 'bfra-me', 'repo', {
      enable_vulnerability_alerts: true,
    })
    await repositoryPlugin(createOctokit(), 'bfra-me', 'repo', {
      enable_vulnerability_alerts: false,
    })

    expect(mockRequest).toHaveBeenNthCalledWith(
      1,
      'PUT /repos/{owner}/{repo}/vulnerability-alerts',
      {owner: 'bfra-me', repo: 'repo'},
    )
    expect(mockRequest).toHaveBeenNthCalledWith(
      2,
      'DELETE /repos/{owner}/{repo}/vulnerability-alerts',
      {owner: 'bfra-me', repo: 'repo'},
    )
    expect(mockReposUpdate).not.toHaveBeenCalled()
  })

  it('does not pass topics or security toggles to repos.update()', async () => {
    await repositoryPlugin(createOctokit(), 'bfra-me', 'repo', {
      name: 'renamed-repo',
      topics: ['actions'],
      enable_automated_security_fixes: true,
      enable_vulnerability_alerts: false,
    })

    expect(mockReposUpdate).toHaveBeenCalledTimes(1)
    const updateParams = mockReposUpdate.mock.calls[0]?.[0] as Record<string, unknown>
    expect(updateParams).toMatchObject({
      owner: 'bfra-me',
      repo: 'repo',
      name: 'renamed-repo',
    })
    expect(updateParams).not.toHaveProperty('topics')
    expect(updateParams).not.toHaveProperty('enable_automated_security_fixes')
    expect(updateParams).not.toHaveProperty('enable_vulnerability_alerts')

    expect(mockReplaceAllTopics).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      names: ['actions'],
    })
    expect(mockRequest).toHaveBeenCalledTimes(2)
  })

  it('makes no API calls for empty repository config object', async () => {
    await repositoryPlugin(createOctokit(), 'bfra-me', 'repo', {})

    expect(mockReposUpdate).not.toHaveBeenCalled()
    expect(mockReplaceAllTopics).not.toHaveBeenCalled()
    expect(mockRequest).not.toHaveBeenCalled()
  })
})
