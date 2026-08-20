import {describe, expect, it} from 'vitest'
import {analyzeExistingChangesets} from '../../src/deduplicator/existing-changeset-analyzer'
import {mockedFileSystem} from '../setup'

const workingDirectory = '/tmp/workspace'
const changesetDirectory = `${workingDirectory}/.changeset`
const config = {
  workingDirectory,
  maxExistingChangesetAge: 30,
}
const changesetContent = `---
'pkg-a': patch
---

Update pkg-a.
`

function setDirectoryAndFileStats(): void {
  mockedFileSystem.stat.mockImplementation(async (filePath: string) => {
    if (filePath === changesetDirectory) return {isDirectory: () => true}
    return {mtime: new Date()}
  })
}

describe('analyzeExistingChangesets', () => {
  it('returns no changesets when the PR has no changed files', async () => {
    setDirectoryAndFileStats()
    mockedFileSystem.readFile.mockResolvedValue(changesetContent)

    await expect(analyzeExistingChangesets(config)).resolves.toEqual([])
    expect(mockedFileSystem.readFile).not.toHaveBeenCalled()
  })

  it('returns no changesets when the PR changed no changeset files', async () => {
    setDirectoryAndFileStats()
    mockedFileSystem.readFile.mockResolvedValue(changesetContent)

    await expect(analyzeExistingChangesets(config, ['package.json'])).resolves.toEqual([])
    expect(mockedFileSystem.readFile).not.toHaveBeenCalled()
  })

  it('reads only the PR-scoped changeset when inherited changesets are also on disk', async () => {
    setDirectoryAndFileStats()
    mockedFileSystem.readFile.mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('pr-authored.md')) return changesetContent
      throw new Error(`Unexpected read: ${filePath}`)
    })

    const result = await analyzeExistingChangesets(config, ['.changeset/pr-authored.md'])

    expect(result).toHaveLength(1)
    expect(result[0]?.filename).toBe('pr-authored.md')
    expect(mockedFileSystem.readFile).toHaveBeenCalledTimes(1)
    expect(mockedFileSystem.readFile).toHaveBeenCalledWith(
      `${changesetDirectory}/pr-authored.md`,
      'utf8',
    )
  })

  it('skips a PR changeset that is missing from disk without throwing', async () => {
    setDirectoryAndFileStats()
    const missing = Object.assign(new Error('missing'), {code: 'ENOENT'})
    mockedFileSystem.stat.mockImplementation(async (filePath: string) => {
      if (filePath === changesetDirectory) return {isDirectory: () => true}
      throw missing
    })

    await expect(analyzeExistingChangesets(config, ['.changeset/missing.md'])).resolves.toEqual([])
  })

  it('excludes the changeset README from PR-scoped files', async () => {
    setDirectoryAndFileStats()

    await expect(analyzeExistingChangesets(config, ['.changeset/README.md'])).resolves.toEqual([])
    expect(mockedFileSystem.readFile).not.toHaveBeenCalled()
  })
})
