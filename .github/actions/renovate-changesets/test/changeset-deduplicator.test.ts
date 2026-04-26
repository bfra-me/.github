import type {ChangesetInfo} from '../src/multi-package-changeset-generator'
import {describe, expect, it} from 'vitest'
import {deduplicateChangesets} from '../src/changeset-deduplicator'
import {mockedFileSystem} from './setup'

function makeChangeset(
  id: string,
  packages: string[] = ['pkg-a'],
  summary = 'Update dep',
  releaseType: 'patch' | 'minor' | 'major' = 'patch',
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
      isSecurityUpdate: false,
      hasBreakingChanges: false,
      affectedDependencies: [],
      reasoning: [],
    },
  }
}

describe('deduplicateChangesets', () => {
  it('should return empty result for no changesets', async () => {
    mockedFileSystem.stat.mockRejectedValueOnce(new Error('ENOENT'))

    const result = await deduplicateChangesets([])
    expect(result.originalChangesets).toHaveLength(0)
    expect(result.deduplicatedChangesets).toHaveLength(0)
  })

  it('should return single changeset unchanged', async () => {
    mockedFileSystem.stat.mockRejectedValueOnce(new Error('ENOENT'))

    const cs = makeChangeset('cs1')
    const result = await deduplicateChangesets([cs])
    expect(result.deduplicatedChangesets).toHaveLength(1)
    expect(result.stats.totalOriginal).toBe(1)
    expect(result.stats.totalFinal).toBe(1)
  })

  it('should remove exact duplicate changesets', async () => {
    mockedFileSystem.stat.mockRejectedValueOnce(new Error('ENOENT'))

    const cs1 = makeChangeset('cs1', ['pkg-a'], 'Update lodash')
    const cs2 = makeChangeset('cs1', ['pkg-a'], 'Update lodash') // exact duplicate

    const result = await deduplicateChangesets([cs1, cs2], {
      enableContentDeduplication: true,
      enableSemanticDeduplication: false,
      enableChangesetMerging: false,
      analyzeExistingChangesets: false,
    })
    expect(result.deduplicatedChangesets).toHaveLength(1)
    expect(result.stats.duplicatesRemoved).toBe(1)
  })

  it('should disable content deduplication when configured', async () => {
    mockedFileSystem.stat.mockRejectedValueOnce(new Error('ENOENT'))

    const cs1 = makeChangeset('cs1', ['pkg-a'], 'Update lodash')
    const cs2 = makeChangeset('cs1', ['pkg-a'], 'Update lodash') // exact duplicate

    const result = await deduplicateChangesets([cs1, cs2], {
      enableContentDeduplication: false,
      enableSemanticDeduplication: false,
      enableChangesetMerging: false,
      analyzeExistingChangesets: false,
    })
    // Without dedup, both are retained
    expect(result.deduplicatedChangesets).toHaveLength(2)
    expect(result.stats.duplicatesRemoved).toBe(0)
  })

  it('should include reasoning in result', async () => {
    mockedFileSystem.stat.mockRejectedValueOnce(new Error('ENOENT'))

    const result = await deduplicateChangesets([makeChangeset('cs1')], {
      analyzeExistingChangesets: false,
    })
    expect(result.reasoning.length).toBeGreaterThan(0)
  })

  it('should handle existing changesets when found', async () => {
    mockedFileSystem.stat
      .mockResolvedValueOnce({isDirectory: () => true})
      .mockResolvedValueOnce({mtime: new Date()})
    mockedFileSystem.readdir.mockResolvedValueOnce(['cs1.md'])
    mockedFileSystem.readFile.mockResolvedValueOnce(`---\n'pkg-a': patch\n---\nUpdate dep`)

    const cs1 = makeChangeset('cs1')
    const result = await deduplicateChangesets([cs1], {
      analyzeExistingChangesets: true,
      enableContentDeduplication: false,
      enableSemanticDeduplication: false,
      enableChangesetMerging: false,
    })
    expect(result.reasoning.some(r => r.includes('existing'))).toBe(true)
  })

  it('should populate correct stats', async () => {
    mockedFileSystem.stat.mockRejectedValueOnce(new Error('ENOENT'))

    const cs1 = makeChangeset('cs1', ['pkg-a'])
    const cs2 = makeChangeset('cs2', ['pkg-b'])

    const result = await deduplicateChangesets([cs1, cs2], {analyzeExistingChangesets: false})
    expect(result.stats.totalOriginal).toBe(2)
    expect(result.stats.totalFinal).toBeGreaterThanOrEqual(0)
  })

  it('should disable merging when strategy is disabled', async () => {
    mockedFileSystem.stat.mockRejectedValueOnce(new Error('ENOENT'))

    const result = await deduplicateChangesets([makeChangeset('cs1')], {
      enableChangesetMerging: false,
      mergeStrategy: 'disabled',
      analyzeExistingChangesets: false,
    })
    expect(result.mergedChangesets).toHaveLength(0)
  })
})
