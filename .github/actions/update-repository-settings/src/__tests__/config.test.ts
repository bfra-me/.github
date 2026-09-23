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
  // `src/index.ts` composes the client through `Octokit.plugin(retry)`; give this mock a
  // static passthrough so any future composition against this mock doesn't throw, even
  // though `loadConfig` itself never calls `.plugin()`.
  Octokit: class {
    static plugin(this: unknown): unknown {
      return this
    }

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
      labels: [{name: 'base-only'}, {name: 'local-only'}],
    })
    expect(config).not.toHaveProperty('_extends')
  })

  it('merges labels by name case-insensitively, with child entries replacing base entries wholesale', async () => {
    mockGetContent
      .mockResolvedValueOnce({
        data: {
          content: toBase64Yaml({
            _extends: '.github:common-settings.yaml',
            labels: [
              {name: 'Bug', color: 'ff0000', description: 'local override'},
              {name: 'child-only'},
            ],
          }),
          encoding: 'base64',
        },
      })
      .mockResolvedValueOnce({
        data: {
          content: toBase64Yaml({
            labels: [
              {name: 'bug', color: '000000', description: 'base description'},
              {name: 'base-only'},
            ],
          }),
          encoding: 'base64',
        },
      })

    const config = await loadConfig(createOctokit(), 'bfra-me', 'repo-a', '.github/settings.yml')

    expect(config).toEqual({
      labels: [
        {name: 'Bug', color: 'ff0000', description: 'local override'},
        {name: 'base-only'},
        {name: 'child-only'},
      ],
    })
  })

  it('deep merges branches by exact name, keeping base protection fields not overridden by the child', async () => {
    mockGetContent
      .mockResolvedValueOnce({
        data: {
          content: toBase64Yaml({
            _extends: '.github:common-settings.yaml',
            branches: [
              {
                name: 'main',
                protection: {
                  required_status_checks: {strict: true, checks: [{context: 'child-check'}]},
                },
              },
            ],
          }),
          encoding: 'base64',
        },
      })
      .mockResolvedValueOnce({
        data: {
          content: toBase64Yaml({
            branches: [
              {
                name: 'main',
                protection: {
                  enforce_admins: true,
                  required_status_checks: {strict: false, checks: [{context: 'base-check'}]},
                },
              },
              {name: 'develop', protection: {enforce_admins: false}},
            ],
          }),
          encoding: 'base64',
        },
      })

    const config = await loadConfig(createOctokit(), 'bfra-me', 'repo-a', '.github/settings.yml')

    expect(config).toEqual({
      branches: [
        {
          name: 'main',
          protection: {
            enforce_admins: true,
            required_status_checks: {strict: true, checks: [{context: 'child-check'}]},
          },
        },
        {name: 'develop', protection: {enforce_admins: false}},
      ],
    })
  })

  it('lets an explicit null in a child branch entry win outright over the base value', async () => {
    mockGetContent
      .mockResolvedValueOnce({
        data: {
          content: toBase64Yaml({
            _extends: '.github:common-settings.yaml',
            branches: [{name: 'main', protection: {required_status_checks: null}}],
          }),
          encoding: 'base64',
        },
      })
      .mockResolvedValueOnce({
        data: {
          content: toBase64Yaml({
            branches: [
              {
                name: 'main',
                protection: {
                  enforce_admins: true,
                  required_status_checks: {strict: true, checks: [{context: 'base-check'}]},
                },
              },
            ],
          }),
          encoding: 'base64',
        },
      })

    const config = await loadConfig(createOctokit(), 'bfra-me', 'repo-a', '.github/settings.yml')

    expect(config).toEqual({
      branches: [{name: 'main', protection: {enforce_admins: true, required_status_checks: null}}],
    })
  })

  it('warns once on case-variant duplicate label names within a single side, without changing resolution', async () => {
    mockGetContent
      .mockResolvedValueOnce({
        data: {
          content: toBase64Yaml({
            _extends: '.github:common-settings.yaml',
            labels: [
              {name: 'Bug', color: '111111'},
              {name: 'bug', color: '222222'},
              {name: 'BUG', color: '333333'},
            ],
          }),
          encoding: 'base64',
        },
      })
      .mockResolvedValueOnce({
        data: {
          content: toBase64Yaml({labels: [{name: 'bug', color: '000000'}]}),
          encoding: 'base64',
        },
      })

    const config = await loadConfig(createOctokit(), 'bfra-me', 'repo-a', '.github/settings.yml')

    // Local's last duplicate wins ("BUG"), matching Map.set() last-write-wins
    // resolution — the warning only surfaces the ambiguity, it doesn't change it.
    expect(config).toEqual({labels: [{name: 'BUG', color: '333333'}]})
    expect(mockWarning).toHaveBeenCalledTimes(1)
    expect(mockWarning).toHaveBeenCalledWith(
      expect.stringContaining('Duplicate label name "bug" in the local config'),
    )
  })

  it('warns once per duplicate branch name in the base (_extends) config', async () => {
    mockGetContent
      .mockResolvedValueOnce({
        data: {
          content: toBase64Yaml({
            _extends: '.github:common-settings.yaml',
            branches: [{name: 'main', protection: {enforce_admins: true}}],
          }),
          encoding: 'base64',
        },
      })
      .mockResolvedValueOnce({
        data: {
          content: toBase64Yaml({
            branches: [
              {name: 'main', protection: {enforce_admins: false, required_signatures: true}},
              {name: 'main', protection: {required_signatures: false}},
            ],
          }),
          encoding: 'base64',
        },
      })

    await loadConfig(createOctokit(), 'bfra-me', 'repo-a', '.github/settings.yml')

    expect(mockWarning).toHaveBeenCalledTimes(1)
    expect(mockWarning).toHaveBeenCalledWith(
      expect.stringContaining('Duplicate branch name "main" in the base (_extends) config'),
    )
  })

  it('replaces a nested labels key (not at the top level) wholesale instead of merging by name', async () => {
    mockGetContent
      .mockResolvedValueOnce({
        data: {
          content: toBase64Yaml({
            _extends: '.github:common-settings.yaml',
            repository: {labels: [{name: 'nested-local'}]},
          }),
          encoding: 'base64',
        },
      })
      .mockResolvedValueOnce({
        data: {
          content: toBase64Yaml({
            repository: {labels: [{name: 'nested-base'}]},
          }),
          encoding: 'base64',
        },
      })

    const config = await loadConfig(createOctokit(), 'bfra-me', 'repo-a', '.github/settings.yml')

    expect(config).toEqual({repository: {labels: [{name: 'nested-local'}]}})
  })

  it('replaces non-labels/branches arrays wholesale (e.g. teams) rather than merging by key', async () => {
    mockGetContent
      .mockResolvedValueOnce({
        data: {
          content: toBase64Yaml({
            _extends: '.github:common-settings.yaml',
            teams: [{name: 'local-team', permission: 'push'}],
          }),
          encoding: 'base64',
        },
      })
      .mockResolvedValueOnce({
        data: {
          content: toBase64Yaml({
            teams: [{name: 'base-team', permission: 'admin'}],
          }),
          encoding: 'base64',
        },
      })

    const config = await loadConfig(createOctokit(), 'bfra-me', 'repo-a', '.github/settings.yml')

    expect(config).toEqual({
      teams: [{name: 'local-team', permission: 'push'}],
    })
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
