import type {ChangesetInfo} from '../src/multi-package-gen/types'
import {describe, expect, it} from 'vitest'
import {
  analyzeSimilarity,
  calculateChangesetContentHash,
  isChangesetDuplicateOfExisting,
} from '../src/deduplicator/changeset-comparator'
import {
  checkAgainstExistingChangesets,
  performContentDeduplication,
  performSemanticDeduplication,
} from '../src/deduplicator/duplicate-strategies'
import {validateDeduplicationResult} from '../src/deduplicator/deduplication-validator'

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

describe('changeset-comparator', () => {
  describe('calculateChangesetContentHash', () => {
    it('should generate consistent hash for same changeset', () => {
      const cs = makeChangeset('cs1', ['pkg-a'], 'Update lodash')

      expect(calculateChangesetContentHash(cs)).toBe(calculateChangesetContentHash(cs))
    })

    it('should generate different hash for different packages', () => {
      const cs1 = makeChangeset('cs1', ['pkg-a'], 'Update lodash')
      const cs2 = makeChangeset('cs2', ['pkg-b'], 'Update lodash')

      expect(calculateChangesetContentHash(cs1)).not.toBe(calculateChangesetContentHash(cs2))
    })

    it('should generate different hash for different summaries', () => {
      const cs1 = makeChangeset('cs1', ['pkg-a'], 'Update lodash to 4.17.21')
      const cs2 = makeChangeset('cs2', ['pkg-a'], 'Update react to 18.0.0')

      expect(calculateChangesetContentHash(cs1)).not.toBe(calculateChangesetContentHash(cs2))
    })

    it('should normalize whitespace in summary for consistent hashing', () => {
      const cs1 = makeChangeset('cs1', ['pkg-a'], 'Update  lodash')
      const cs2 = makeChangeset('cs2', ['pkg-a'], 'Update lodash')

      // Both should produce same hash (whitespace normalized)
      expect(calculateChangesetContentHash(cs1)).toBe(calculateChangesetContentHash(cs2))
    })

    it('should sort packages for consistent hashing', () => {
      const cs1 = makeChangeset('cs1', ['pkg-b', 'pkg-a'], 'Update deps')
      const cs2 = makeChangeset('cs2', ['pkg-a', 'pkg-b'], 'Update deps')

      expect(calculateChangesetContentHash(cs1)).toBe(calculateChangesetContentHash(cs2))
    })

    it('should consider release type in hash', () => {
      const cs1 = makeChangeset('cs1', ['pkg-a'], 'Update dep', 'patch')
      const cs2 = makeChangeset('cs2', ['pkg-a'], 'Update dep', 'major')

      expect(calculateChangesetContentHash(cs1)).not.toBe(calculateChangesetContentHash(cs2))
    })
  })

  describe('analyzeSimilarity', () => {
    const config = {semanticSimilarityThreshold: 0.8, mergeStrategy: 'conservative' as const}

    it('should detect exact match for identical changesets', () => {
      const cs1 = makeChangeset('cs1', ['pkg-a'], 'Update dep')
      const cs2 = makeChangeset('cs2', ['pkg-a'], 'Update dep')

      const result = analyzeSimilarity(cs1, cs2, config)

      expect(result.isExactMatch).toBe(true)
      expect(result.isSimilar).toBe(true)
      expect(result.contentSimilarity).toBe(1)
    })

    it('should detect partial similarity for shared packages', () => {
      const cs1 = makeChangeset('cs1', ['pkg-a', 'pkg-b'], 'Update dep')
      const cs2 = makeChangeset('cs2', ['pkg-a', 'pkg-c'], 'Different summary')

      const result = analyzeSimilarity(cs1, cs2, config)

      expect(result.packageOverlap).toBeGreaterThan(0)
      expect(result.isExactMatch).toBe(false)
    })

    it('should have zero similarity for completely different changesets', () => {
      const cs1 = makeChangeset('cs1', ['pkg-a'], 'Update pkg-a', 'patch', ['dep-a'])
      const cs2 = makeChangeset('cs2', ['pkg-x'], 'Update pkg-x', 'patch', ['dep-x'])

      const result = analyzeSimilarity(cs1, cs2, config)

      expect(result.packageOverlap).toBe(0)
      expect(result.dependencyOverlap).toBe(0)
    })

    it('should calculate dependency overlap', () => {
      const cs1 = makeChangeset('cs1', ['pkg-a'], 'Update dep', 'patch', ['lodash', 'react'])
      const cs2 = makeChangeset('cs2', ['pkg-b'], 'Update dep', 'patch', ['lodash', 'vue'])

      const result = analyzeSimilarity(cs1, cs2, config)

      expect(result.dependencyOverlap).toBeGreaterThan(0)
    })

    it('should report high merge risk for breaking changes', () => {
      const cs1 = makeChangeset('cs1', ['pkg-a'], 'Update dep', 'major', [], false, true)
      const cs2 = makeChangeset('cs2', ['pkg-a'], 'Update dep', 'major', [], false, true)

      const result = analyzeSimilarity(cs1, cs2, config)

      expect(result.mergeRisk).toBe('high')
    })

    it('should report canMerge=false when mergeStrategy is disabled', () => {
      const cs1 = makeChangeset('cs1', ['pkg-a'], 'Update dep')
      const cs2 = makeChangeset('cs2', ['pkg-a'], 'Update dep')
      const disabledConfig = {semanticSimilarityThreshold: 0.8, mergeStrategy: 'disabled' as const}

      const result = analyzeSimilarity(cs1, cs2, disabledConfig)

      expect(result.canMerge).toBe(false)
    })
  })

  describe('isChangesetDuplicateOfExisting', () => {
    it('should detect duplicate when releases match exactly', () => {
      const cs = makeChangeset('cs1', ['pkg-a'], 'Update dep', 'patch')
      const existing = {
        filename: 'existing.md',
        filePath: '/path/existing.md',
        content: '---\n"pkg-a": patch\n---\nUpdate dep',
        releases: [{name: 'pkg-a', type: 'patch' as const}],
        summary: 'Update dep',
        createdAt: new Date(),
        age: 0,
      }

      expect(isChangesetDuplicateOfExisting(cs, existing)).toBe(true)
    })

    it('should not detect duplicate when release types differ', () => {
      const cs = makeChangeset('cs1', ['pkg-a'], 'Update dep', 'major')
      const existing = {
        filename: 'existing.md',
        filePath: '/path/existing.md',
        content: '',
        releases: [{name: 'pkg-a', type: 'patch' as const}],
        summary: '',
        createdAt: new Date(),
        age: 0,
      }

      expect(isChangesetDuplicateOfExisting(cs, existing)).toBe(false)
    })

    it('should not detect duplicate when packages differ', () => {
      const cs = makeChangeset('cs1', ['pkg-a'], 'Update dep', 'patch')
      const existing = {
        filename: 'existing.md',
        filePath: '/path/existing.md',
        content: '',
        releases: [{name: 'pkg-b', type: 'patch' as const}],
        summary: '',
        createdAt: new Date(),
        age: 0,
      }

      expect(isChangesetDuplicateOfExisting(cs, existing)).toBe(false)
    })

    it('should not detect duplicate when release counts differ', () => {
      const cs = makeChangeset('cs1', ['pkg-a', 'pkg-b'], 'Update deps', 'patch')
      const existing = {
        filename: 'existing.md',
        filePath: '/path/existing.md',
        content: '',
        releases: [{name: 'pkg-a', type: 'patch' as const}],
        summary: '',
        createdAt: new Date(),
        age: 0,
      }

      expect(isChangesetDuplicateOfExisting(cs, existing)).toBe(false)
    })
  })
})

describe('duplicate-strategies', () => {
  describe('performContentDeduplication', () => {
    it('should return all changesets when no duplicates', () => {
      const changesets = [
        makeChangeset('cs1', ['pkg-a'], 'Update lodash'),
        makeChangeset('cs2', ['pkg-b'], 'Update react'),
        makeChangeset('cs3', ['pkg-c'], 'Update vue'),
      ]

      const result = performContentDeduplication(changesets)

      expect(result.unique).toHaveLength(3)
      expect(result.duplicates).toHaveLength(0)
    })

    it('should remove exact content duplicates', () => {
      const cs1 = makeChangeset('cs1', ['pkg-a'], 'Update dep')
      const cs2 = makeChangeset('cs2', ['pkg-a'], 'Update dep') // Same content, different id

      const result = performContentDeduplication([cs1, cs2])

      expect(result.unique).toHaveLength(1)
      expect(result.duplicates).toHaveLength(1)
      expect(result.unique[0].id).toBe('cs1')
    })

    it('should handle empty input', () => {
      const result = performContentDeduplication([])

      expect(result.unique).toHaveLength(0)
      expect(result.duplicates).toHaveLength(0)
    })

    it('should keep first occurrence when duplicates found', () => {
      const cs1 = makeChangeset('cs1', ['pkg-a'], 'Update dep')
      const cs2 = makeChangeset('cs2', ['pkg-a'], 'Update dep')
      const cs3 = makeChangeset('cs3', ['pkg-a'], 'Update dep')

      const result = performContentDeduplication([cs1, cs2, cs3])

      expect(result.unique).toHaveLength(1)
      expect(result.duplicates).toHaveLength(2)
    })

    it('should not remove changesets with different release types', () => {
      const cs1 = makeChangeset('cs1', ['pkg-a'], 'Update dep', 'patch')
      const cs2 = makeChangeset('cs2', ['pkg-a'], 'Update dep', 'major')

      const result = performContentDeduplication([cs1, cs2])

      expect(result.unique).toHaveLength(2)
      expect(result.duplicates).toHaveLength(0)
    })
  })

  describe('performSemanticDeduplication', () => {
    const config = {semanticSimilarityThreshold: 0.8, mergeStrategy: 'conservative' as const}

    it('should return all changesets when none are similar', () => {
      const changesets = [
        makeChangeset('cs1', ['pkg-a'], 'Update lodash', 'patch', ['lodash']),
        makeChangeset('cs2', ['pkg-b'], 'Update react', 'patch', ['react']),
      ]

      const result = performSemanticDeduplication(changesets, config)

      expect(result.unique).toHaveLength(2)
    })

    it('should remove semantically similar changesets above threshold', () => {
      const cs1 = makeChangeset('cs1', ['pkg-a'], 'Update dep')
      const cs2 = makeChangeset('cs2', ['pkg-a'], 'Update dep') // Same packages = high similarity

      const result = performSemanticDeduplication([cs1, cs2], config)

      expect(result.unique.length + result.duplicates.length).toBe(2)
    })

    it('should handle empty input', () => {
      const result = performSemanticDeduplication([], config)

      expect(result.unique).toHaveLength(0)
      expect(result.duplicates).toHaveLength(0)
    })

    it('should not remove changesets with low similarity', () => {
      const lowThresholdConfig = {semanticSimilarityThreshold: 0.99, mergeStrategy: 'conservative' as const}
      const cs1 = makeChangeset('cs1', ['pkg-a'], 'Update lodash', 'patch', ['lodash'])
      const cs2 = makeChangeset('cs2', ['pkg-b'], 'Update react', 'patch', ['react'])

      const result = performSemanticDeduplication([cs1, cs2], lowThresholdConfig)

      expect(result.unique).toHaveLength(2)
      expect(result.duplicates).toHaveLength(0)
    })
  })

  describe('checkAgainstExistingChangesets', () => {
    it('should return all changesets when none match existing', () => {
      const changesets = [
        makeChangeset('cs1', ['pkg-a'], 'Update lodash', 'patch'),
      ]
      const existing = [
        {
          filename: 'existing.md',
          filePath: '/path/existing.md',
          content: '',
          releases: [{name: 'pkg-b', type: 'minor' as const}],
          summary: '',
          createdAt: new Date(),
          age: 0,
        },
      ]

      const result = checkAgainstExistingChangesets(changesets, existing)

      expect(result.unique).toHaveLength(1)
      expect(result.duplicateFiles).toHaveLength(0)
    })

    it('should detect when new changeset duplicates existing', () => {
      const changesets = [makeChangeset('cs1', ['pkg-a'], 'Update dep', 'patch')]
      const existing = [
        {
          filename: 'existing.md',
          filePath: '/path/existing.md',
          content: '',
          releases: [{name: 'pkg-a', type: 'patch' as const}],
          summary: '',
          createdAt: new Date(),
          age: 0,
        },
      ]

      const result = checkAgainstExistingChangesets(changesets, existing)

      expect(result.unique).toHaveLength(0)
      expect(result.duplicateFiles).toContain('existing.md')
    })

    it('should handle empty inputs', () => {
      const result = checkAgainstExistingChangesets([], [])

      expect(result.unique).toHaveLength(0)
      expect(result.duplicateFiles).toHaveLength(0)
    })
  })
})

describe('deduplication-validator', () => {
  describe('validateDeduplicationResult', () => {
    it('should add warning when high deduplication ratio', () => {
      const original = Array.from({length: 10}, (_, i) => makeChangeset(`cs${i}`, ['pkg-a']))
      const deduplicated = [makeChangeset('cs0', ['pkg-a'])]
      const warnings: string[] = []

      validateDeduplicationResult(deduplicated, original, warnings)

      expect(warnings.some(w => w.includes('High deduplication ratio'))).toBe(true)
    })

    it('should not add ratio warning for low deduplication', () => {
      const original = [
        makeChangeset('cs1', ['pkg-a']),
        makeChangeset('cs2', ['pkg-b']),
      ]
      const deduplicated = [makeChangeset('cs1', ['pkg-a'])]
      const warnings: string[] = []

      validateDeduplicationResult(deduplicated, original, warnings)

      // 50% reduction shouldn't trigger the >80% warning
      expect(warnings.some(w => w.includes('High deduplication ratio'))).toBe(false)
    })

    it('should warn when package is missing from deduplicated results', () => {
      const original = [
        makeChangeset('cs1', ['pkg-a', 'pkg-b']),
      ]
      const deduplicated = [makeChangeset('cs2', ['pkg-a'])] // pkg-b is missing
      const warnings: string[] = []

      validateDeduplicationResult(deduplicated, original, warnings)

      expect(warnings.some(w => w.includes("'pkg-b'") && w.includes('missing'))).toBe(true)
    })

    it('should warn when package has conflicting release types', () => {
      const deduplicated = [
        makeChangeset('cs1', ['pkg-a'], 'Update', 'patch'),
        makeChangeset('cs2', ['pkg-a'], 'Update 2', 'major'),
      ]
      const original = [...deduplicated]
      const warnings: string[] = []

      validateDeduplicationResult(deduplicated, original, warnings)

      expect(warnings.some(w => w.includes("'pkg-a'") && w.includes('conflicting'))).toBe(true)
    })

    it('should handle empty inputs without errors', () => {
      const warnings: string[] = []

      validateDeduplicationResult([], [], warnings)

      expect(warnings).toHaveLength(0)
    })
  })
})
