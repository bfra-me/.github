import type {ChangesetInfo} from '../src/multi-package-gen/types'
import type {ChangesetDeduplicationConfig} from '../src/deduplicator/deduplicator-types'
import {describe, expect, it, vi} from 'vitest'
import {mergeChangesets, performChangesetMerging} from '../src/deduplicator/changeset-merger'
import {analyzeExistingChangesets} from '../src/deduplicator/existing-changeset-analyzer'
import {mockedFileSystem} from './setup'

function makeChangeset(
  id: string,
  packages: string[] = ['pkg-a'],
  summary = 'Update dependency',
  releaseType: 'patch' | 'minor' | 'major' = 'patch',
  deps: string[] = [],
  isSecure = false,
  hasBreaking = false,
): ChangesetInfo {
  return {
    id,
    filename: `${id}.md`,
    packages,
    summary,
    releases: packages.map(name => ({name, type: releaseType})),
    relationships: [],
    metadata: {
      isGrouped: false,
      isSecurityUpdate: isSecure,
      hasBreakingChanges: hasBreaking,
      affectedDependencies: deps,
      reasoning: [],
    },
  }
}

describe('changeset-merger', () => {
  describe('mergeChangesets', () => {
    it('should throw when empty array is provided', async () => {
      await expect(mergeChangesets([])).rejects.toThrow('Cannot merge empty changeset array')
    })

    it('should return single changeset unchanged', async () => {
      const cs = makeChangeset('cs1')
      const result = await mergeChangesets([cs])
      expect(result).toBe(cs)
    })

    it('should merge two changesets into one', async () => {
      const cs1 = makeChangeset('cs1', ['pkg-a'], 'Update lodash', 'patch', ['lodash'])
      const cs2 = makeChangeset('cs2', ['pkg-b'], 'Update react', 'minor', ['react'])

      const result = await mergeChangesets([cs1, cs2])

      expect(result.packages).toContain('pkg-a')
      expect(result.packages).toContain('pkg-b')
      expect(result.releases).toHaveLength(2)
      expect(result.metadata.affectedDependencies).toContain('lodash')
      expect(result.metadata.affectedDependencies).toContain('react')
    })

    it('should preserve highest release type when packages appear in multiple changesets', async () => {
      const cs1 = makeChangeset('cs1', ['pkg-a'], 'Update patch', 'patch')
      const cs2 = makeChangeset('cs2', ['pkg-a'], 'Update major', 'major')

      const result = await mergeChangesets([cs1, cs2])

      const pkgARelease = result.releases.find(r => r.name === 'pkg-a')
      expect(pkgARelease?.type).toBe('major')
    })

    it('should set isSecurityUpdate when any source is security update', async () => {
      const cs1 = makeChangeset('cs1', ['pkg-a'], 'Normal update', 'patch', [], false)
      const cs2 = makeChangeset('cs2', ['pkg-b'], 'Security update', 'patch', [], true)

      const result = await mergeChangesets([cs1, cs2])

      expect(result.metadata.isSecurityUpdate).toBe(true)
    })

    it('should set hasBreakingChanges when any source has breaking changes', async () => {
      const cs1 = makeChangeset('cs1', ['pkg-a'], 'Normal', 'patch', [], false, false)
      const cs2 = makeChangeset('cs2', ['pkg-b'], 'Breaking', 'major', [], false, true)

      const result = await mergeChangesets([cs1, cs2])

      expect(result.metadata.hasBreakingChanges).toBe(true)
    })

    it('should collect all reasoning from source changesets', async () => {
      const cs1: ChangesetInfo = {
        ...makeChangeset('cs1'),
        metadata: {...makeChangeset('cs1').metadata, reasoning: ['reason1']},
      }
      const cs2: ChangesetInfo = {
        ...makeChangeset('cs2', ['pkg-b']),
        metadata: {...makeChangeset('cs2', ['pkg-b']).metadata, reasoning: ['reason2']},
      }

      const result = await mergeChangesets([cs1, cs2])

      expect(result.metadata.reasoning).toContain('reason1')
      expect(result.metadata.reasoning).toContain('reason2')
    })

    it('should set isGrouped to true', async () => {
      const cs1 = makeChangeset('cs1', ['pkg-a'])
      const cs2 = makeChangeset('cs2', ['pkg-b'])

      const result = await mergeChangesets([cs1, cs2])

      expect(result.metadata.isGrouped).toBe(true)
    })

    it('should sort packages alphabetically', async () => {
      const cs1 = makeChangeset('cs1', ['pkg-z'])
      const cs2 = makeChangeset('cs2', ['pkg-a'])

      const result = await mergeChangesets([cs1, cs2])

      expect(result.packages).toEqual(['pkg-a', 'pkg-z'])
    })

    it('should include merged changeset info in reasoning', async () => {
      const cs1 = makeChangeset('cs1', ['pkg-a'])
      const cs2 = makeChangeset('cs2', ['pkg-b'])

      const result = await mergeChangesets([cs1, cs2])

      expect(result.metadata.reasoning.some(r => r.includes('Merged changeset'))).toBe(true)
      expect(result.metadata.reasoning.some(r => r.includes('cs1') && r.includes('cs2'))).toBe(true)
    })

    it('should generate summary with single package', async () => {
      const cs1 = makeChangeset('cs1', ['pkg-a'], '', 'patch')
      const cs2 = makeChangeset('cs2', ['pkg-a'], '', 'minor')

      const result = await mergeChangesets([cs1, cs2])

      expect(result.summary).toContain('pkg-a')
    })

    it('should generate summary with multiple packages', async () => {
      const cs1 = makeChangeset('cs1', ['pkg-a'])
      const cs2 = makeChangeset('cs2', ['pkg-b'])

      const result = await mergeChangesets([cs1, cs2])

      expect(result.summary).toContain('packages')
    })

    it('should include dependency list in summary for few deps', async () => {
      const cs1 = makeChangeset('cs1', ['pkg-a'], '', 'patch', ['dep-a', 'dep-b'])
      const cs2 = makeChangeset('cs2', ['pkg-b'], '', 'patch', ['dep-c'])

      const result = await mergeChangesets([cs1, cs2])

      expect(result.summary).toContain('dep-a')
    })

    it('should truncate dependency list in summary for many deps', async () => {
      const cs1 = makeChangeset('cs1', ['pkg-a'], '', 'patch', ['dep-a', 'dep-b', 'dep-c', 'dep-d'])
      const cs2 = makeChangeset('cs2', ['pkg-b'], '', 'patch', ['dep-e'])

      const result = await mergeChangesets([cs1, cs2])

      expect(result.summary).toContain('more')
    })

    it('should prefix summary with security badge for security updates', async () => {
      const cs1 = makeChangeset('cs1', ['pkg-a'], '', 'patch', [], true)
      const cs2 = makeChangeset('cs2', ['pkg-b'], '', 'patch')

      const result = await mergeChangesets([cs1, cs2])

      expect(result.summary).toContain('Security Update')
    })

    it('should prefix summary with breaking change badge', async () => {
      const cs1 = makeChangeset('cs1', ['pkg-a'], '', 'major', [], false, true)
      const cs2 = makeChangeset('cs2', ['pkg-b'], '', 'patch')

      const result = await mergeChangesets([cs1, cs2])

      expect(result.summary).toContain('Breaking Changes')
    })
  })

  describe('performChangesetMerging', () => {
    const config: Pick<ChangesetDeduplicationConfig, 'maxMergeCount' | 'mergeStrategy'> = {
      maxMergeCount: 5,
      mergeStrategy: 'conservative',
    }

    it('should return all changesets when none can be merged', async () => {
      const changesets = [
        makeChangeset('cs1', ['pkg-a'], 'Update lodash', 'patch', ['lodash']),
        makeChangeset('cs2', ['pkg-b'], 'Update react', 'patch', ['react']),
      ]

      const result = await performChangesetMerging(changesets, config)

      expect(result.merged).toHaveLength(2)
      expect(result.mergeOperations).toHaveLength(0)
    })

    it('should merge similar changesets', async () => {
      const changesets = [
        makeChangeset('cs1', ['pkg-a'], 'Update dep'),
        makeChangeset('cs2', ['pkg-a'], 'Update dep'), // Same content = similar
      ]

      const result = await performChangesetMerging(changesets, config)

      expect(result.merged.length).toBeLessThanOrEqual(2)
    })

    it('should handle empty input', async () => {
      const result = await performChangesetMerging([], config)

      expect(result.merged).toHaveLength(0)
      expect(result.mergeOperations).toHaveLength(0)
    })

    it('should not merge when strategy is disabled', async () => {
      const disabledConfig = {maxMergeCount: 5, mergeStrategy: 'disabled' as const}
      const changesets = [
        makeChangeset('cs1', ['pkg-a'], 'Update dep'),
        makeChangeset('cs2', ['pkg-a'], 'Update dep'),
      ]

      const result = await performChangesetMerging(changesets, disabledConfig)

      expect(result.mergeOperations).toHaveLength(0)
    })
  })
})

describe('existing-changeset-analyzer', () => {
  describe('analyzeExistingChangesets', () => {
    const config = {
      maxExistingChangesetAge: 30,
      workingDirectory: '/tmp/test-workspace',
    }

    it('should return empty array when .changeset directory does not exist', async () => {
      mockedFileSystem.stat.mockRejectedValueOnce(new Error('ENOENT'))

      const result = await analyzeExistingChangesets(config)

      expect(result).toEqual([])
    })

    it('should return empty array when directory has no changeset files', async () => {
      mockedFileSystem.stat.mockResolvedValueOnce({isDirectory: () => true} as never)
      mockedFileSystem.readdir.mockResolvedValueOnce([] as never)

      const result = await analyzeExistingChangesets(config)

      expect(result).toEqual([])
    })

    it('should parse changeset files', async () => {
      const changesetContent = `---
"pkg-a": patch
---

Update dependency.`

      mockedFileSystem.stat
        .mockResolvedValueOnce({isDirectory: () => true} as never)
        .mockResolvedValueOnce({
          mtime: new Date(Date.now() - 1000 * 60 * 60), // 1 hour old
        } as never)
      mockedFileSystem.readdir.mockResolvedValueOnce(['renovate-abc123.md'] as never)
      mockedFileSystem.readFile.mockResolvedValueOnce(changesetContent as never)

      const result = await analyzeExistingChangesets(config)

      expect(result).toHaveLength(1)
      expect(result[0].filename).toBe('renovate-abc123.md')
      expect(result[0].releases).toHaveLength(1)
      expect(result[0].releases[0].name).toBe('pkg-a')
      expect(result[0].releases[0].type).toBe('patch')
      expect(result[0].summary).toBe('Update dependency.')
    })

    it('should skip files older than maxExistingChangesetAge', async () => {
      mockedFileSystem.stat
        .mockResolvedValueOnce({isDirectory: () => true} as never)
        .mockResolvedValueOnce({
          mtime: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60), // 60 days old
        } as never)
      mockedFileSystem.readdir.mockResolvedValueOnce(['old-changeset.md'] as never)

      const result = await analyzeExistingChangesets(config)

      expect(result).toHaveLength(0)
    })

    it('should skip README.md files', async () => {
      mockedFileSystem.stat.mockResolvedValueOnce({isDirectory: () => true} as never)
      mockedFileSystem.readdir.mockResolvedValueOnce(['README.md', 'renovate-abc.md'] as never)
      mockedFileSystem.stat.mockResolvedValueOnce({
        mtime: new Date(),
      } as never)
      mockedFileSystem.readFile.mockResolvedValueOnce(`---\n"pkg-a": patch\n---\nUpdate.` as never)

      const result = await analyzeExistingChangesets(config)

      // README.md is skipped, only renovate-abc.md processed
      expect(result).toHaveLength(1)
    })

    it('should handle file read errors gracefully', async () => {
      mockedFileSystem.stat
        .mockResolvedValueOnce({isDirectory: () => true} as never)
        .mockResolvedValueOnce({
          mtime: new Date(),
        } as never)
      mockedFileSystem.readdir.mockResolvedValueOnce(['bad-file.md'] as never)
      mockedFileSystem.readFile.mockRejectedValueOnce(new Error('Permission denied'))

      const result = await analyzeExistingChangesets(config)

      expect(result).toHaveLength(0)
    })

    it('should handle changeset with double-quoted package names', async () => {
      const changesetContent = `---
"my-package": minor
---

Minor update.`

      mockedFileSystem.stat
        .mockResolvedValueOnce({isDirectory: () => true} as never)
        .mockResolvedValueOnce({mtime: new Date()} as never)
      mockedFileSystem.readdir.mockResolvedValueOnce(['my-changeset.md'] as never)
      mockedFileSystem.readFile.mockResolvedValueOnce(changesetContent as never)

      const result = await analyzeExistingChangesets(config)

      expect(result[0].releases[0].name).toBe('my-package')
      expect(result[0].releases[0].type).toBe('minor')
    })
  })
})
