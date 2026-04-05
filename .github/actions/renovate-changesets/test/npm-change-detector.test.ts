import {Buffer} from 'node:buffer'
import {describe, expect, it} from 'vitest'
import {detectNPMChangesFromFiles, detectNPMChangesFromPR} from '../src/npm-change-detector'
import {mockedFileSystem, mockedOctokit} from './setup'

describe('NPMChangeDetector', () => {
  const createMockOctokit = () =>
    mockedOctokit as unknown as Parameters<typeof detectNPMChangesFromPR>[0]

  describe('detectNPMChangesFromPR', () => {
    it('should return empty array when no npm files', async () => {
      const files = [
        {filename: 'src/index.ts', status: 'modified', additions: 1, deletions: 1},
        {filename: 'go.mod', status: 'modified', additions: 1, deletions: 1},
      ]

      const result = await detectNPMChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(result).toEqual([])
      expect(mockedOctokit.rest.pulls.get).not.toHaveBeenCalled()
    })

    it('should analyze package.json files', async () => {
      mockedOctokit.rest.pulls.get.mockResolvedValue({
        data: {
          base: {sha: 'base-sha'},
          head: {sha: 'head-sha'},
        },
      })
      mockedOctokit.rest.repos.getContent
        .mockResolvedValueOnce({
          data: {content: Buffer.from('{"dependencies":{"lodash":"4.17.20"}}').toString('base64')},
        })
        .mockResolvedValueOnce({
          data: {content: Buffer.from('{"dependencies":{"lodash":"4.17.21"}}').toString('base64')},
        })

      const files = [{filename: 'package.json', status: 'modified', additions: 1, deletions: 1}]

      await detectNPMChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(mockedOctokit.rest.pulls.get).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        pull_number: 1,
      })
    })

    it('should handle API errors gracefully', async () => {
      mockedOctokit.rest.pulls.get.mockRejectedValue(new Error('API error'))

      const files = [{filename: 'package.json', status: 'modified', additions: 1, deletions: 1}]

      const result = await detectNPMChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(result).toEqual([])
    })

    it('should handle missing octokit API methods gracefully', async () => {
      const brokenOctokit = {rest: {}} as Parameters<typeof detectNPMChangesFromPR>[0]

      const files = [{filename: 'package.json', status: 'modified', additions: 1, deletions: 1}]

      const result = await detectNPMChangesFromPR(brokenOctokit, 'owner', 'repo', 1, files)

      expect(result).toEqual([])
    })

    it('should detect package-lock.json as npm file', async () => {
      mockedOctokit.rest.pulls.get.mockResolvedValue({
        data: {base: {sha: 'base-sha'}, head: {sha: 'head-sha'}},
      })
      mockedOctokit.rest.repos.getContent.mockResolvedValue({
        data: {content: Buffer.from('{"lockfileVersion":2,"packages":{}}').toString('base64')},
      })

      const files = [
        {filename: 'package-lock.json', status: 'modified', additions: 1, deletions: 1},
      ]

      await detectNPMChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(mockedOctokit.rest.pulls.get).toHaveBeenCalled()
    })

    it('should detect pnpm-lock.yaml as npm file', async () => {
      mockedOctokit.rest.pulls.get.mockResolvedValue({
        data: {base: {sha: 'base-sha'}, head: {sha: 'head-sha'}},
      })
      mockedOctokit.rest.repos.getContent.mockResolvedValue({
        data: {content: Buffer.from('lockfileVersion: 6.0').toString('base64')},
      })

      const files = [{filename: 'pnpm-lock.yaml', status: 'modified', additions: 1, deletions: 1}]

      await detectNPMChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(mockedOctokit.rest.pulls.get).toHaveBeenCalled()
    })

    it('should handle getContent returning null content', async () => {
      mockedOctokit.rest.pulls.get.mockResolvedValue({
        data: {base: {sha: 'base-sha'}, head: {sha: 'head-sha'}},
      })
      mockedOctokit.rest.repos.getContent.mockResolvedValue({
        data: {type: 'file'},
      })

      const files = [{filename: 'package.json', status: 'modified', additions: 1, deletions: 1}]

      const result = await detectNPMChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(result).toEqual([])
    })

    it('should detect nested package.json files', async () => {
      mockedOctokit.rest.pulls.get.mockResolvedValue({
        data: {base: {sha: 'base-sha'}, head: {sha: 'head-sha'}},
      })
      mockedOctokit.rest.repos.getContent
        .mockResolvedValueOnce({
          data: {content: Buffer.from('{"dependencies":{"lodash":"4.17.20"}}').toString('base64')},
        })
        .mockResolvedValueOnce({
          data: {content: Buffer.from('{"dependencies":{"lodash":"4.17.21"}}').toString('base64')},
        })

      const files = [
        {filename: 'packages/my-lib/package.json', status: 'modified', additions: 1, deletions: 1},
      ]

      await detectNPMChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(mockedOctokit.rest.pulls.get).toHaveBeenCalled()
    })
  })

  describe('detectNPMChangesFromFiles', () => {
    it('should return empty array when no npm files in changed files list', async () => {
      const result = await detectNPMChangesFromFiles('/workspace', ['src/index.ts', 'go.mod'])

      expect(result).toEqual([])
    })

    it('should analyze package.json from local filesystem', async () => {
      mockedFileSystem.readFile.mockResolvedValue(
        JSON.stringify({dependencies: {lodash: '4.17.21'}}),
      )

      await detectNPMChangesFromFiles('/workspace', ['package.json'])

      expect(mockedFileSystem.readFile).toHaveBeenCalled()
    })

    it('should handle file read errors gracefully', async () => {
      mockedFileSystem.readFile.mockRejectedValue(new Error('File not found'))

      const result = await detectNPMChangesFromFiles('/workspace', ['package.json'])

      expect(result).toEqual([])
    })

    it('should detect package.json in subdirectory', async () => {
      mockedFileSystem.readFile.mockResolvedValue(JSON.stringify({dependencies: {react: '18.0.0'}}))

      await detectNPMChangesFromFiles('/workspace', ['packages/app/package.json'])

      expect(mockedFileSystem.readFile).toHaveBeenCalledWith(
        expect.stringContaining('packages/app/package.json'),
        'utf8',
      )
    })

    it('should filter out non-npm files', async () => {
      await detectNPMChangesFromFiles('/workspace', ['Makefile', 'README.md', 'go.sum'])

      expect(mockedFileSystem.readFile).not.toHaveBeenCalled()
    })
  })
})
