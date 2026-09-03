import type {Octokit as OctokitType} from '@octokit/rest'
import type {SettingsConfig} from '../../config.js'
import {Octokit} from '@octokit/rest'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {applySettings, PLUGIN_REGISTRY} from '../index.js'

const mockInfo = vi.hoisted(() => vi.fn())
const mockError = vi.hoisted(() => vi.fn())

vi.mock('@actions/core', () => ({
  info: mockInfo,
  error: mockError,
}))

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    rest = {}
  },
}))

function createOctokit(): OctokitType {
  return new Octokit({auth: 'test-token'}) as unknown as OctokitType
}

describe('Plugin Registry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('has all 8 plugin keys in registry', () => {
    expect(Object.keys(PLUGIN_REGISTRY)).toEqual(
      expect.arrayContaining([
        'repository',
        'labels',
        'collaborators',
        'teams',
        'milestones',
        'branches',
        'environments',
        'rulesets',
      ]),
    )
    expect(Object.keys(PLUGIN_REGISTRY)).toHaveLength(8)
  })

  it('calls each plugin for matching config key', async () => {
    const mockPlugin = vi.fn().mockResolvedValue(undefined)
    const original = PLUGIN_REGISTRY.repository
    PLUGIN_REGISTRY.repository = mockPlugin

    const config: SettingsConfig = {repository: {name: 'test'}}
    await applySettings(createOctokit(), 'owner', 'repo', config)

    expect(mockPlugin).toHaveBeenCalledWith(createOctokit(), 'owner', 'repo', {name: 'test'})
    PLUGIN_REGISTRY.repository = original
  })

  it('skips unknown config keys with core.info()', async () => {
    const config = {unknownSection: {}} as unknown as SettingsConfig
    await applySettings(createOctokit(), 'owner', 'repo', config)

    expect(mockInfo).toHaveBeenCalledWith(
      expect.stringContaining('Unknown settings key: unknownSection'),
    )
  })

  it('continues on plugin error, collects all errors, throws aggregate at end', async () => {
    const mockPluginFail = vi.fn().mockRejectedValue(new Error('plugin failed'))
    const mockPluginSuccess = vi.fn().mockResolvedValue(undefined)

    const originalRepository = PLUGIN_REGISTRY.repository
    const originalLabels = PLUGIN_REGISTRY.labels

    PLUGIN_REGISTRY.repository = mockPluginFail
    PLUGIN_REGISTRY.labels = mockPluginSuccess

    const config: SettingsConfig = {
      repository: {name: 'test'},
      labels: [{name: 'bug'}],
    }

    await expect(applySettings(createOctokit(), 'owner', 'repo', config)).rejects.toThrow(
      'Failed to apply settings:',
    )

    expect(mockPluginFail).toHaveBeenCalled()
    expect(mockPluginSuccess).toHaveBeenCalled()

    PLUGIN_REGISTRY.repository = originalRepository
    PLUGIN_REGISTRY.labels = originalLabels
  })

  it('handles empty config (no plugins to run)', async () => {
    const config: SettingsConfig = {}
    await expect(applySettings(createOctokit(), 'owner', 'repo', config)).resolves.toBeUndefined()

    expect(mockError).not.toHaveBeenCalled()
  })

  it('aggregate names all applied and failed keys when three succeed and one fails', async () => {
    const originalRepository = PLUGIN_REGISTRY.repository
    const originalLabels = PLUGIN_REGISTRY.labels
    const originalTeams = PLUGIN_REGISTRY.teams
    const originalMilestones = PLUGIN_REGISTRY.milestones

    PLUGIN_REGISTRY.repository = vi.fn().mockResolvedValue(undefined)
    PLUGIN_REGISTRY.labels = vi.fn().mockResolvedValue(undefined)
    PLUGIN_REGISTRY.teams = vi.fn().mockResolvedValue(undefined)
    PLUGIN_REGISTRY.milestones = vi.fn().mockRejectedValue(new Error('milestones failed'))

    const config: SettingsConfig = {
      repository: {name: 'test'},
      labels: [{name: 'bug'}],
      teams: [{name: 'core', permission: 'push'}],
      milestones: [{title: 'v1'}],
    }

    let caught: Error | undefined
    try {
      await applySettings(createOctokit(), 'owner', 'repo', config)
    } catch (error) {
      caught = error as Error
    }

    expect(caught).toBeDefined()
    expect(caught?.message).toContain('repository')
    expect(caught?.message).toContain('labels')
    expect(caught?.message).toContain('teams')
    expect(caught?.message).toContain('milestones')
    expect(caught?.message).toContain('milestones failed')

    PLUGIN_REGISTRY.repository = originalRepository
    PLUGIN_REGISTRY.labels = originalLabels
    PLUGIN_REGISTRY.teams = originalTeams
    PLUGIN_REGISTRY.milestones = originalMilestones
  })

  it('produces a non-empty aggregate containing the status for a mocked RequestError-shaped failure', async () => {
    const originalRepository = PLUGIN_REGISTRY.repository

    const requestErrorLike = {
      status: 500,
      message: '',
      response: {
        headers: {'x-github-request-id': 'AAAA:BBBB:CCCC'},
        data: '',
      },
    }
    PLUGIN_REGISTRY.repository = vi.fn().mockRejectedValue(requestErrorLike)

    const config: SettingsConfig = {repository: {name: 'test'}}

    let caught: Error | undefined
    try {
      await applySettings(createOctokit(), 'owner', 'repo', config)
    } catch (error) {
      caught = error as Error
    }

    expect(caught).toBeDefined()
    expect(caught?.message.length).toBeGreaterThan(0)
    expect(caught?.message).toContain('500')
    expect(caught?.message).toContain('AAAA:BBBB:CCCC')

    PLUGIN_REGISTRY.repository = originalRepository
  })
})
