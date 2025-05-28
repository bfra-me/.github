import {Buffer} from 'node:buffer'
import process from 'node:process'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('@actions/core', () => ({
  getInput: vi.fn((name: string) => {
    const env: Record<string, string> = {
      token: 'test-token',
      'node-version': '20',
      autofix: 'false',
      'pr-branch': 'ci/update-metadata',
      'commit-message': 'chore: update repository metadata',
      'pr-title': 'chore: update repository metadata',
      'pr-body':
        'This PR updates the repository metadata files based on the latest organization scan.',
      'skip-changeset': 'true',
    }
    return env[name] ?? ''
  }),
  setOutput: vi.fn(),
  setFailed: vi.fn(),
}))

let execCalls: any[] = []
vi.mock('@actions/exec', () => ({
  exec: vi.fn(async (cmd: string, args: string[], opts?: any) => {
    execCalls.push([cmd, args])
    if (cmd === 'git' && args[0] === 'status') {
      if (process.env.MOCK_UNSTAGED) opts?.listeners?.stdout?.(Buffer.from(' M file.txt\n'))
      else opts?.listeners?.stdout?.(Buffer.from(''))
    }
    if (cmd === 'git' && args[0] === 'add' && args[1]?.startsWith('.changeset')) return 0
    return 0
  }),
}))

let prCreated = false
const prUrl = 'https://github.com/org/repo/pull/1'
vi.mock('@actions/github', () => ({
  getOctokit: vi.fn(() => ({
    rest: {
      pulls: {
        create: vi.fn(async () => {
          prCreated = true
          return {data: {html_url: prUrl}}
        }),
      },
    },
    context: {repo: {owner: 'org', repo: 'repo'}},
  })),
  context: {repo: {owner: 'org', repo: 'repo'}},
}))

const fsMocks = vi.hoisted(() => ({
  mkdir: vi.fn(async () => undefined),
  writeFile: vi.fn(async () => undefined),
}))

vi.mock('node:fs', () => ({
  promises: {
    mkdir: fsMocks.mkdir,
    writeFile: fsMocks.writeFile,
  },
}))

const octokitMocks = vi.hoisted(() => ({
  paginate: vi.fn(async () => [{name: 'repo1'}, {name: 'repo2'}]),
  repos: {
    listForOrg: vi.fn(),
    getContent: vi.fn().mockImplementation(async ({repo}) => {
      if (repo === 'repo1') return Promise.resolve()
      throw new Error('File not found')
    }),
  },
}))

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => octokitMocks),
}))

vi.mock('js-yaml', () => ({
  dump: vi.fn(() => 'repositories:\n  with-renovate:\n    - repo1\n'),
}))

describe('update-metadata action', () => {
  let core: any
  let dateNowSpy: any
  beforeEach(async () => {
    vi.clearAllMocks()
    execCalls = []
    prCreated = false
    process.env.MOCK_UNSTAGED = ''
    process.env.GITHUB_REPOSITORY = 'bfra-me/test-repo'
    core = await vi.importMock('@actions/core')
    fsMocks.mkdir.mockClear()
    fsMocks.writeFile.mockClear()
    octokitMocks.paginate.mockClear()
    octokitMocks.repos.getContent.mockClear()
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1234567890)
  })
  afterEach(() => {
    dateNowSpy.mockRestore()
  })

  it('runs generate-metadata and sets outputs', async () => {
    const {run} = await import('../src/index')
    await run()
    expect(core.setOutput).toHaveBeenCalledWith('unstaged-changes', '')
    expect(octokitMocks.paginate).toHaveBeenCalled()
    expect(fsMocks.mkdir).toHaveBeenCalledWith(expect.stringContaining('metadata'), {
      recursive: true,
    })
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('renovate.yaml'),
      expect.stringContaining('repo1'),
    )
    expect(prCreated).toBe(false)
  })

  it('creates a PR if changes exist', async () => {
    process.env.MOCK_UNSTAGED = '1'

    // Create a proper fallback that uses the original mock implementation
    const originalMockImplementation = vi.fn((name: string) => {
      const env: Record<string, string> = {
        token: 'test-token',
        'node-version': '20',
        autofix: 'false',
        'pr-branch': 'ci/update-metadata',
        'commit-message': 'chore: update repository metadata',
        'pr-title': 'chore: update repository metadata',
        'pr-body':
          'This PR updates the repository metadata files based on the latest organization scan.',
        'skip-changeset': 'true',
      }
      return env[name] ?? ''
    })

    core.getInput.mockImplementation((name: string) => {
      if (name === 'skip-changeset') return 'true'
      return originalMockImplementation(name)
    })
    const {run} = await import('../src/index')
    await run()
    expect(core.setOutput).toHaveBeenCalledWith('unstaged-changes', 'M file.txt')
    expect(core.setOutput).toHaveBeenCalledWith('pr-url', prUrl)
    expect(prCreated).toBe(true)
  })

  it('creates a changeset if not skipped', async () => {
    process.env.MOCK_UNSTAGED = '1'

    // Create a proper fallback that uses the original mock implementation
    const originalMockImplementation = vi.fn((name: string) => {
      const env: Record<string, string> = {
        token: 'test-token',
        'node-version': '20',
        autofix: 'false',
        'pr-branch': 'ci/update-metadata',
        'commit-message': 'chore: update repository metadata',
        'pr-title': 'chore: update repository metadata',
        'pr-body':
          'This PR updates the repository metadata files based on the latest organization scan.',
        'skip-changeset': 'true',
      }
      return env[name] ?? ''
    })

    core.getInput.mockImplementation((name: string) => {
      if (name === 'skip-changeset') return 'false'
      return originalMockImplementation(name)
    })
    const {run} = await import('../src/index')
    await run()
    expect(fsMocks.mkdir).toHaveBeenCalledWith('.changeset', {recursive: true})
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      '.changeset/update-metadata-1234567890.md',
      expect.stringContaining('Update repository metadata files'),
    )
  })
})
