import type {Octokit as OctokitType} from '@octokit/rest'
import {Buffer} from 'node:buffer'
import * as core from '@actions/core'
import {Octokit} from '@octokit/rest'
import * as yaml from 'js-yaml'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {loadConfig} from '../config.js'

const mockGetContent = vi.hoisted(() => vi.fn())
const mockWarning = vi.hoisted(() => vi.fn())

vi.mock('@actions/core', () => ({
  warning: mockWarning,
}))

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    rest = {
      repos: {
        getContent: mockGetContent,
      },
    }
  },
}))

function toBase64Yaml(value: unknown): string {
  return Buffer.from(yaml.dump(value), 'utf8').toString('base64')
}

function createOctokit(): OctokitType {
  return new Octokit({auth: 'test-token'}) as unknown as OctokitType
}

describe('loadConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads local settings file via contents API', async () => {
    mockGetContent.mockResolvedValueOnce({
      data: {content: toBase64Yaml({labels: [{name: 'bug'}]}), encoding: 'base64'},
    })

    const config = await loadConfig(createOctokit(), 'bfra-me', 'repo-a', '.github/settings.yml')

    expect(mockGetContent).toHaveBeenCalledTimes(1)
    expect(mockGetContent).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo-a',
      path: '.github/settings.yml',
    })
    expect(config).toEqual({labels: [{name: 'bug'}]})
    expect(config).not.toHaveProperty('_extends')
  })

  it('resolves _extends using .github:repo-path notation', async () => {
    mockGetContent
      .mockResolvedValueOnce({
        data: {
          content: toBase64Yaml({
            _extends: '.github:common-settings.yaml',
            repository: {description: 'local'},
          }),
          encoding: 'base64',
        },
      })
      .mockResolvedValueOnce({
        data: {
          content: toBase64Yaml({
            repository: {description: 'base', homepage: 'https://example.com'},
          }),
          encoding: 'base64',
        },
      })

    const config = await loadConfig(createOctokit(), 'bfra-me', 'repo-a', '.github/settings.yml')

    expect(mockGetContent).toHaveBeenCalledTimes(2)
    expect(mockGetContent).toHaveBeenNthCalledWith(2, {
      owner: 'bfra-me',
      repo: '.github',
      path: 'common-settings.yaml',
    })
    expect(config).toEqual({
      repository: {
        description: 'local',
        homepage: 'https://example.com',
      },
    })
  })

  it('resolves _extends using org/repo:path notation', async () => {
    mockGetContent
      .mockResolvedValueOnce({
        data: {
          content: toBase64Yaml({_extends: 'my-org/shared-config:.github/common.yaml', labels: []}),
          encoding: 'base64',
        },
      })
      .mockResolvedValueOnce({
        data: {
          content: toBase64Yaml({repository: {allow_squash_merge: true}}),
          encoding: 'base64',
        },
      })

    await loadConfig(createOctokit(), 'bfra-me', 'repo-a', '.github/settings.yml')

    expect(mockGetContent).toHaveBeenNthCalledWith(2, {
      owner: 'my-org',
      repo: 'shared-config',
      path: '.github/common.yaml',
    })
  })

  it('resolves _extends using same-repo shorthand path', async () => {
    mockGetContent
      .mockResolvedValueOnce({
        data: {
          content: toBase64Yaml({_extends: 'common-settings.yaml', labels: []}),
          encoding: 'base64',
        },
      })
      .mockResolvedValueOnce({
        data: {content: toBase64Yaml({repository: {visibility: 'private'}}), encoding: 'base64'},
      })

    await loadConfig(createOctokit(), 'bfra-me', 'repo-a', '.github/settings.yml')

    expect(mockGetContent).toHaveBeenNthCalledWith(2, {
      owner: 'bfra-me',
      repo: 'repo-a',
      path: 'common-settings.yaml',
    })
  })

  it('resolves _extends using :path default to same-org .github repo', async () => {
    mockGetContent
      .mockResolvedValueOnce({
        data: {
          content: toBase64Yaml({_extends: ':defaults/settings.yaml', labels: []}),
          encoding: 'base64',
        },
      })
      .mockResolvedValueOnce({
        data: {
          content: toBase64Yaml({repository: {allow_merge_commit: false}}),
          encoding: 'base64',
        },
      })

    await loadConfig(createOctokit(), 'bfra-me', 'repo-a', '.github/settings.yml')

    expect(mockGetContent).toHaveBeenNthCalledWith(2, {
      owner: 'bfra-me',
      repo: '.github',
      path: 'defaults/settings.yaml',
    })
  })

  it('deep merges base and local where local values override', async () => {
    mockGetContent
      .mockResolvedValueOnce({
        data: {
          content: toBase64Yaml({
            _extends: '.github:common-settings.yaml',
            repository: {
              homepage: 'https://local.example.com',
              security_and_analysis: {
                secret_scanning: {status: 'enabled'},
              },
            },
            labels: [{name: 'local-only'}],
          }),
          encoding: 'base64',
        },
      })
      .mockResolvedValueOnce({
        data: {
          content: toBase64Yaml({
            repository: {
              homepage: 'https://base.example.com',
              has_issues: true,
              security_and_analysis: {
                secret_scanning: {status: 'disabled'},
                dependabot_security_updates: {status: 'enabled'},
              },
            },
            labels: [{name: 'base-only'}],
          }),
          encoding: 'base64',
        },
      })

    const config = await loadConfig(createOctokit(), 'bfra-me', 'repo-a', '.github/settings.yml')

    expect(config).toEqual({
      repository: {
        homepage: 'https://local.example.com',
        has_issues: true,
        security_and_analysis: {
          secret_scanning: {status: 'enabled'},
          dependabot_security_updates: {status: 'enabled'},
        },
      },
      labels: [{name: 'local-only'}],
    })
    expect(config).not.toHaveProperty('_extends')
  })

  it('returns local config unchanged when _extends is absent', async () => {
    mockGetContent.mockResolvedValueOnce({
      data: {
        content: toBase64Yaml({repository: {has_wiki: false}, labels: [{name: 'triage'}]}),
        encoding: 'base64',
      },
    })

    const config = await loadConfig(createOctokit(), 'bfra-me', 'repo-a', '.github/settings.yml')

    expect(mockGetContent).toHaveBeenCalledTimes(1)
    expect(config).toEqual({repository: {has_wiki: false}, labels: [{name: 'triage'}]})
  })

  it('warns and falls back to local config when _extends fetch fails', async () => {
    mockGetContent
      .mockResolvedValueOnce({
        data: {
          content: toBase64Yaml({
            _extends: '.github:common-settings.yaml',
            repository: {description: 'local-only'},
          }),
          encoding: 'base64',
        },
      })
      .mockRejectedValueOnce(new Error('Not Found'))

    const config = await loadConfig(createOctokit(), 'bfra-me', 'repo-a', '.github/settings.yml')

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load _extends config'),
    )
    expect(config).toEqual({repository: {description: 'local-only'}})
    expect(config).not.toHaveProperty('_extends')
  })

  it('warns and falls back to local config when _extends is malformed', async () => {
    mockGetContent.mockResolvedValueOnce({
      data: {
        content: toBase64Yaml({_extends: ':', repository: {description: 'local-only'}}),
        encoding: 'base64',
      },
    })

    const config = await loadConfig(createOctokit(), 'bfra-me', 'repo-a', '.github/settings.yml')

    expect(mockGetContent).toHaveBeenCalledTimes(1)
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load _extends config'),
    )
    expect(config).toEqual({repository: {description: 'local-only'}})
  })

  it('throws descriptive error when local config cannot be loaded', async () => {
    mockGetContent.mockRejectedValueOnce(new Error('Forbidden'))

    await expect(
      loadConfig(createOctokit(), 'bfra-me', 'repo-a', '.github/settings.yml'),
    ).rejects.toThrow('Failed to load local config from .github/settings.yml: Error: Forbidden')
  })

  it('throws descriptive error when local YAML is invalid', async () => {
    const invalidYaml = 'repository:\n  name: [unclosed'
    mockGetContent.mockResolvedValueOnce({
      data: {
        content: Buffer.from(invalidYaml, 'utf8').toString('base64'),
        encoding: 'base64',
      },
    })

    await expect(
      loadConfig(createOctokit(), 'bfra-me', 'repo-a', '.github/settings.yml'),
    ).rejects.toThrow('Failed to parse local config YAML from .github/settings.yml')
  })
})
