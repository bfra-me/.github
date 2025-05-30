import process from 'node:process'
import {beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('@actions/core', () => ({
  getInput: vi.fn((name: string) => {
    const env: Record<string, string> = {
      token: 'test-token',
    }
    return env[name] ?? ''
  }),
  setFailed: vi.fn(),
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
  beforeEach(async () => {
    vi.clearAllMocks()
    process.env.GITHUB_REPOSITORY = 'bfra-me/test-repo'
    fsMocks.mkdir.mockClear()
    fsMocks.writeFile.mockClear()
    octokitMocks.paginate.mockClear()
    octokitMocks.repos.getContent.mockClear()
  })

  it('generates metadata', async () => {
    await import('../src/index')
    expect(octokitMocks.paginate).toHaveBeenCalled()
    expect(fsMocks.mkdir).toHaveBeenCalledWith(expect.stringContaining('metadata'), {
      recursive: true,
    })
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('renovate.yaml'),
      expect.stringContaining('repo1'),
    )
  })
})
