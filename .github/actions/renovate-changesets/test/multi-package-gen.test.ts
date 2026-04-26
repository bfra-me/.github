import type {
  MultiPackageAnalysisResult,
  PackageRelationship,
  WorkspacePackage,
} from '../src/multi-package-analyzer'
import type {MultiPackageChangesetConfig} from '../src/multi-package-gen/types'
import type {RenovateDependency, RenovatePRContext} from '../src/renovate-parser'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {
  createChangesetInfos,
  createGroupedChangesets,
  createMultipleChangesets,
  createSingleChangeset,
} from '../src/multi-package-gen/changeset-creators'
import {enhanceChangesetSummary} from '../src/multi-package-gen/changeset-enhancer'
import {determineChangesetStrategy} from '../src/multi-package-gen/changeset-strategy'
import {
  findDependenciesForPackage,
  findPackageGroup,
  packageHasDependency,
} from '../src/multi-package-gen/package-relationship-helpers'

function makeWorkspacePackage(
  name: string,
  deps: Record<string, string> = {},
  devDeps: Record<string, string> = {},
): WorkspacePackage {
  return {
    name,
    version: '1.0.0',
    path: `/workspace/${name}`,
    packageJsonPath: `/workspace/${name}/package.json`,
    dependencies: deps,
    devDependencies: devDeps,
    peerDependencies: {},
    optionalDependencies: {},
    private: false,
  }
}

function makeAnalysisResult(
  affectedPackages: string[] = ['pkg-a'],
  workspacePackages: WorkspacePackage[] = [],
  packageRelationships: PackageRelationship[] = [],
): MultiPackageAnalysisResult {
  return {
    affectedPackages,
    workspacePackages,
    packageRelationships,
    impactAnalysis: {
      directlyAffected: affectedPackages,
      indirectlyAffected: [],
      riskLevel: 'low',
      changesetStrategy: 'single',
    },
    recommendations: {
      createSeparateChangesets: false,
      packageGroups: [],
      reasoningChain: [],
    },
  }
}

function makeDependency(overrides: Partial<RenovateDependency> = {}): RenovateDependency {
  return {
    name: 'test-dep',
    currentVersion: '1.0.0',
    newVersion: '2.0.0',
    manager: 'npm',
    updateType: 'major',
    isSecurityUpdate: false,
    securitySeverity: null,
    isGrouped: false,
    packageFile: 'package.json',
    ...overrides,
  }
}

function makePRContext(overrides: Partial<RenovatePRContext> = {}): RenovatePRContext {
  return {
    dependencies: [],
    isRenovateBot: true,
    branchName: 'renovate/test',
    prTitle: 'chore(deps): update test-dep',
    prBody: 'This PR updates...',
    commitMessages: [],
    isGroupedUpdate: false,
    isSecurityUpdate: false,
    updateType: 'major',
    manager: 'npm',
    files: [],
    ...overrides,
  }
}

function makeConfig(
  overrides: Partial<MultiPackageChangesetConfig> = {},
): MultiPackageChangesetConfig {
  return {
    workingDirectory: '/tmp/test',
    useOfficialChangesets: false,
    createSeparateChangesets: true,
    respectPackageRelationships: true,
    groupRelatedPackages: true,
    packageNameTemplate: '{{name}}',
    includeRelationshipInfo: true,
    maxChangesetsPerPR: 10,
    enableDeduplication: false,
    ...overrides,
  }
}

describe('package-relationship-helpers', () => {
  describe('findPackageGroup', () => {
    it('should return single package when no relationships', () => {
      const group = findPackageGroup('pkg-a', [], ['pkg-a', 'pkg-b'])
      expect(group).toEqual(['pkg-a'])
    })

    it('should include directly related packages', () => {
      const relationships: PackageRelationship[] = [
        {source: 'pkg-a', target: 'pkg-b', type: 'internal-dependency', confidence: 1, impact: 'medium'},
      ]
      const group = findPackageGroup('pkg-a', relationships, ['pkg-a', 'pkg-b'])
      expect(group).toContain('pkg-a')
      expect(group).toContain('pkg-b')
    })

    it('should not include unrelated packages', () => {
      const relationships: PackageRelationship[] = [
        {source: 'pkg-a', target: 'pkg-b', type: 'internal-dependency', confidence: 1, impact: 'medium'},
      ]
      const group = findPackageGroup('pkg-a', relationships, ['pkg-a', 'pkg-b', 'pkg-c'])
      expect(group).not.toContain('pkg-c')
    })

    it('should follow transitive internal dependencies', () => {
      const relationships: PackageRelationship[] = [
        {source: 'pkg-a', target: 'pkg-b', type: 'internal-dependency', confidence: 1, impact: 'medium'},
        {source: 'pkg-b', target: 'pkg-c', type: 'internal-dependency', confidence: 1, impact: 'medium'},
      ]
      const group = findPackageGroup('pkg-a', relationships, ['pkg-a', 'pkg-b', 'pkg-c'])
      expect(group).toContain('pkg-a')
      expect(group).toContain('pkg-b')
      expect(group).toContain('pkg-c')
    })

    it('should include peer-dependency relationships', () => {
      const relationships: PackageRelationship[] = [
        {source: 'pkg-a', target: 'pkg-b', type: 'peer-dependency', confidence: 1, impact: 'medium'},
      ]
      const group = findPackageGroup('pkg-a', relationships, ['pkg-a', 'pkg-b'])
      expect(group).toContain('pkg-b')
    })

    it('should not follow dev-dependency relationships', () => {
      const relationships: PackageRelationship[] = [
        {source: 'pkg-a', target: 'pkg-b', type: 'dev-dependency', confidence: 1, impact: 'medium'},
      ]
      const group = findPackageGroup('pkg-a', relationships, ['pkg-a', 'pkg-b'])
      expect(group).toHaveLength(1)
      expect(group).toContain('pkg-a')
    })

    it('should handle bidirectional relationships without infinite loop', () => {
      const relationships: PackageRelationship[] = [
        {source: 'pkg-a', target: 'pkg-b', type: 'internal-dependency', confidence: 1, impact: 'medium'},
        {source: 'pkg-b', target: 'pkg-a', type: 'internal-dependency', confidence: 1, impact: 'medium'},
      ]
      const group = findPackageGroup('pkg-a', relationships, ['pkg-a', 'pkg-b'])
      expect(group).toHaveLength(2)
    })

    it('should only include packages in affectedPackages list', () => {
      const relationships: PackageRelationship[] = [
        {source: 'pkg-a', target: 'pkg-b', type: 'internal-dependency', confidence: 1, impact: 'medium'},
      ]
      // pkg-b not in affected packages
      const group = findPackageGroup('pkg-a', relationships, ['pkg-a'])
      expect(group).toHaveLength(1)
      expect(group).not.toContain('pkg-b')
    })
  })

  describe('findDependenciesForPackage', () => {
    it('should return empty array when package not found', () => {
      const result = findDependenciesForPackage('unknown-pkg', [makeDependency()], [])
      expect(result).toEqual([])
    })

    it('should find dependencies from package.dependencies', () => {
      const pkg = makeWorkspacePackage('pkg-a', {'test-dep': '^1.0.0'})
      const dep = makeDependency({name: 'test-dep'})
      const result = findDependenciesForPackage('pkg-a', [dep], [pkg])
      expect(result).toHaveLength(1)
      expect(result[0]!.name).toBe('test-dep')
    })

    it('should find dependencies from devDependencies', () => {
      const pkg = makeWorkspacePackage('pkg-a', {}, {'test-dep': '^1.0.0'})
      const dep = makeDependency({name: 'test-dep'})
      const result = findDependenciesForPackage('pkg-a', [dep], [pkg])
      expect(result).toHaveLength(1)
    })

    it('should find dependencies from peerDependencies', () => {
      const pkg: WorkspacePackage = {
        ...makeWorkspacePackage('pkg-a'),
        peerDependencies: {'test-dep': '^1.0.0'},
      }
      const dep = makeDependency({name: 'test-dep'})
      const result = findDependenciesForPackage('pkg-a', [dep], [pkg])
      expect(result).toHaveLength(1)
    })

    it('should not include dependencies not in package', () => {
      const pkg = makeWorkspacePackage('pkg-a', {'other-dep': '^1.0.0'})
      const dep = makeDependency({name: 'test-dep'})
      const result = findDependenciesForPackage('pkg-a', [dep], [pkg])
      expect(result).toHaveLength(0)
    })
  })

  describe('packageHasDependency', () => {
    it('should return false when package not found', () => {
      const dep = makeDependency()
      expect(packageHasDependency('unknown-pkg', dep, [])).toBe(false)
    })

    it('should return true when package has dependency', () => {
      const pkg = makeWorkspacePackage('pkg-a', {'test-dep': '^1.0.0'})
      const dep = makeDependency({name: 'test-dep'})
      expect(packageHasDependency('pkg-a', dep, [pkg])).toBe(true)
    })

    it('should return false when package does not have dependency', () => {
      const pkg = makeWorkspacePackage('pkg-a', {'other-dep': '^1.0.0'})
      const dep = makeDependency({name: 'test-dep'})
      expect(packageHasDependency('pkg-a', dep, [pkg])).toBe(false)
    })
  })
})

describe('changeset-enhancer', () => {
  describe('enhanceChangesetSummary', () => {
    it('should return original summary for single workspace package', () => {
      const analysis = makeAnalysisResult(['pkg-a'], [makeWorkspacePackage('pkg-a')])
      const config = makeConfig()
      const result = enhanceChangesetSummary('Update dep', analysis, config)
      expect(result).toBe('Update dep')
    })

    it('should add multi-package info for multiple workspace packages', () => {
      const analysis = makeAnalysisResult(
        ['pkg-a', 'pkg-b'],
        [makeWorkspacePackage('pkg-a'), makeWorkspacePackage('pkg-b')],
      )
      const config = makeConfig()
      const result = enhanceChangesetSummary('Update dep', analysis, config)
      expect(result).toContain('Multi-package update')
    })

    it('should include specific package name when provided', () => {
      const analysis = makeAnalysisResult(
        ['pkg-a', 'pkg-b'],
        [makeWorkspacePackage('pkg-a'), makeWorkspacePackage('pkg-b')],
      )
      const config = makeConfig()
      const result = enhanceChangesetSummary('Update dep', analysis, config, 'pkg-a')
      expect(result).toContain('pkg-a')
    })

    it('should include package group info when group is provided', () => {
      const analysis = makeAnalysisResult(
        ['pkg-a', 'pkg-b'],
        [makeWorkspacePackage('pkg-a'), makeWorkspacePackage('pkg-b')],
      )
      const config = makeConfig()
      const result = enhanceChangesetSummary('Update dep', analysis, config, undefined, [
        'pkg-a',
        'pkg-b',
      ])
      expect(result).toContain('pkg-a')
      expect(result).toContain('pkg-b')
    })

    it('should include relationship info when configured', () => {
      const relationships: PackageRelationship[] = [
        {source: 'pkg-a', target: 'pkg-b', type: 'internal-dependency', confidence: 1, impact: 'medium'},
      ]
      const analysis = makeAnalysisResult(
        ['pkg-a', 'pkg-b'],
        [makeWorkspacePackage('pkg-a'), makeWorkspacePackage('pkg-b')],
        relationships,
      )
      const config = makeConfig({includeRelationshipInfo: true})
      const result = enhanceChangesetSummary('Update dep', analysis, config)
      expect(result).toContain('Package relationships')
    })

    it('should not include relationship info when disabled', () => {
      const relationships: PackageRelationship[] = [
        {source: 'pkg-a', target: 'pkg-b', type: 'internal-dependency', confidence: 1, impact: 'medium'},
      ]
      const analysis = makeAnalysisResult(
        ['pkg-a', 'pkg-b'],
        [makeWorkspacePackage('pkg-a'), makeWorkspacePackage('pkg-b')],
        relationships,
      )
      const config = makeConfig({includeRelationshipInfo: false})
      const result = enhanceChangesetSummary('Update dep', analysis, config)
      expect(result).not.toContain('Package relationships')
    })

    it('should include impact info when indirectly affected packages exist', () => {
      const analysis: MultiPackageAnalysisResult = {
        ...makeAnalysisResult(
          ['pkg-a', 'pkg-b'],
          [makeWorkspacePackage('pkg-a'), makeWorkspacePackage('pkg-b')],
        ),
        impactAnalysis: {
          directlyAffected: ['pkg-a'],
          indirectlyAffected: ['pkg-b'],
          riskLevel: 'low',
          changesetStrategy: 'single',
        },
      }
      const config = makeConfig()
      const result = enhanceChangesetSummary('Update dep', analysis, config)
      expect(result).toContain('Impact')
    })

    it('should truncate relationships when more than 5', () => {
      const relationships: PackageRelationship[] = Array.from({length: 7}, (_, i) => ({
        source: 'pkg-a',
        target: `pkg-${i + 1}`,
        type: 'internal-dependency' as const,
        confidence: 1,
        impact: 'medium' as const,
      }))
      const pkgs = [
        makeWorkspacePackage('pkg-a'),
        ...Array.from({length: 7}, (_, i) => makeWorkspacePackage(`pkg-${i + 1}`)),
      ]
      const analysis = makeAnalysisResult(
        ['pkg-a', 'pkg-1', 'pkg-2', 'pkg-3', 'pkg-4', 'pkg-5', 'pkg-6', 'pkg-7'],
        pkgs,
        relationships,
      )
      const config = makeConfig({includeRelationshipInfo: true})
      const result = enhanceChangesetSummary('Update dep', analysis, config)
      expect(result).toContain('more')
    })
  })
})

describe('changeset-strategy', () => {
  describe('determineChangesetStrategy', () => {
    it('should return single when createSeparateChangesets is false', () => {
      const analysis = makeAnalysisResult()
      const config = makeConfig({createSeparateChangesets: false})
      const reasoning: string[] = []
      const result = determineChangesetStrategy(analysis, config, reasoning)
      expect(result).toBe('single')
      expect(reasoning.some(r => r.includes('single changeset'))).toBe(true)
    })

    it('should return grouped when internal dependencies found with groupRelatedPackages', () => {
      const relationships: PackageRelationship[] = [
        {source: 'pkg-a', target: 'pkg-b', type: 'internal-dependency', confidence: 1, impact: 'medium'},
      ]
      const analysis = makeAnalysisResult(['pkg-a', 'pkg-b'], [], relationships)
      const config = makeConfig({
        createSeparateChangesets: true,
        respectPackageRelationships: true,
        groupRelatedPackages: true,
      })
      const reasoning: string[] = []
      const result = determineChangesetStrategy(analysis, config, reasoning)
      expect(result).toBe('grouped')
    })

    it('should not use grouped when respectPackageRelationships is false', () => {
      const relationships: PackageRelationship[] = [
        {source: 'pkg-a', target: 'pkg-b', type: 'internal-dependency', confidence: 1, impact: 'medium'},
      ]
      const analysis: MultiPackageAnalysisResult = {
        ...makeAnalysisResult(['pkg-a', 'pkg-b'], [], relationships),
        impactAnalysis: {
          directlyAffected: ['pkg-a', 'pkg-b'],
          indirectlyAffected: [],
          riskLevel: 'low',
          changesetStrategy: 'multiple',
        },
      }
      const config = makeConfig({
        createSeparateChangesets: true,
        respectPackageRelationships: false,
      })
      const reasoning: string[] = []
      const result = determineChangesetStrategy(analysis, config, reasoning)
      expect(result).toBe('multiple')
    })

    it('should use analysis recommendation when no overrides apply', () => {
      const analysis: MultiPackageAnalysisResult = {
        ...makeAnalysisResult(),
        impactAnalysis: {
          directlyAffected: ['pkg-a'],
          indirectlyAffected: [],
          riskLevel: 'low',
          changesetStrategy: 'multiple',
        },
      }
      const config = makeConfig({
        createSeparateChangesets: true,
        respectPackageRelationships: false,
      })
      const reasoning: string[] = []
      const result = determineChangesetStrategy(analysis, config, reasoning)
      expect(result).toBe('multiple')
    })
  })
})

describe('changeset-creators', () => {
  const getGitShortSha = vi.fn().mockResolvedValue('abc1234')

  beforeEach(() => {
    getGitShortSha.mockClear()
  })

  describe('createSingleChangeset', () => {
    it('should create a single changeset for all affected packages', async () => {
      const analysis = makeAnalysisResult(['pkg-a', 'pkg-b'])
      const result = await createSingleChangeset({
        dependencies: [makeDependency()],
        prContext: makePRContext(),
        analysis,
        baseChangesetContent: 'Update test dependency',
        changesetType: 'patch',
        reasoning: [],
        config: makeConfig(),
        getGitShortSha,
      })
      expect(result.packages).toEqual(['pkg-a', 'pkg-b'])
      expect(result.releases).toHaveLength(2)
      expect(result.releases[0]!.type).toBe('patch')
    })

    it('should set isSecurityUpdate from prContext', async () => {
      const analysis = makeAnalysisResult(['pkg-a'])
      const result = await createSingleChangeset({
        dependencies: [makeDependency()],
        prContext: makePRContext({isSecurityUpdate: true}),
        analysis,
        baseChangesetContent: 'Security update',
        changesetType: 'patch',
        reasoning: [],
        config: makeConfig(),
        getGitShortSha,
      })
      expect(result.metadata.isSecurityUpdate).toBe(true)
    })

    it('should set hasBreakingChanges when major update', async () => {
      const analysis = makeAnalysisResult(['pkg-a'])
      const result = await createSingleChangeset({
        dependencies: [makeDependency({updateType: 'major'})],
        prContext: makePRContext(),
        analysis,
        baseChangesetContent: 'Breaking change',
        changesetType: 'major',
        reasoning: [],
        config: makeConfig(),
        getGitShortSha,
      })
      expect(result.metadata.hasBreakingChanges).toBe(true)
    })

    it('should add reasoning to output', async () => {
      const analysis = makeAnalysisResult(['pkg-a'])
      const reasoning: string[] = []
      await createSingleChangeset({
        dependencies: [makeDependency()],
        prContext: makePRContext(),
        analysis,
        baseChangesetContent: 'Update',
        changesetType: 'patch',
        reasoning,
        config: makeConfig(),
        getGitShortSha,
      })
      expect(reasoning.length).toBeGreaterThan(0)
    })
  })

  describe('createMultipleChangesets', () => {
    it('should create one changeset per affected package', async () => {
      const pkg1 = makeWorkspacePackage('pkg-a', {'test-dep': '^1.0.0'})
      const pkg2 = makeWorkspacePackage('pkg-b', {'test-dep': '^1.0.0'})
      const analysis = makeAnalysisResult(['pkg-a', 'pkg-b'], [pkg1, pkg2])
      const result = await createMultipleChangesets(
        [makeDependency()],
        analysis,
        'Update dep',
        'patch',
        [],
        makeConfig(),
      )
      expect(result).toHaveLength(2)
      expect(result[0]!.packages).toEqual(['pkg-a'])
      expect(result[1]!.packages).toEqual(['pkg-b'])
    })

    it('should handle empty affected packages', async () => {
      const analysis = makeAnalysisResult([])
      const result = await createMultipleChangesets(
        [],
        analysis,
        'Update',
        'patch',
        [],
        makeConfig(),
      )
      expect(result).toHaveLength(0)
    })
  })

  describe('createGroupedChangesets', () => {
    it('should group related packages together', async () => {
      const relationships: PackageRelationship[] = [
        {source: 'pkg-a', target: 'pkg-b', type: 'internal-dependency', confidence: 1, impact: 'medium'},
      ]
      const analysis = makeAnalysisResult(['pkg-a', 'pkg-b', 'pkg-c'], [], relationships)
      const result = await createGroupedChangesets(
        [],
        analysis,
        'Update',
        'patch',
        [],
        makeConfig(),
      )
      // pkg-a and pkg-b should be grouped; pkg-c separate
      expect(result.length).toBeGreaterThanOrEqual(1)
    })

    it('should handle packages with no relationships', async () => {
      const analysis = makeAnalysisResult(['pkg-a', 'pkg-b'])
      const result = await createGroupedChangesets(
        [],
        analysis,
        'Update',
        'patch',
        [],
        makeConfig(),
      )
      expect(result).toHaveLength(2)
    })

    it('should not process packages that are already grouped', async () => {
      const relationships: PackageRelationship[] = [
        {source: 'pkg-a', target: 'pkg-b', type: 'internal-dependency', confidence: 1, impact: 'medium'},
        {source: 'pkg-b', target: 'pkg-a', type: 'internal-dependency', confidence: 1, impact: 'medium'},
      ]
      const analysis = makeAnalysisResult(['pkg-a', 'pkg-b'], [], relationships)
      const result = await createGroupedChangesets(
        [],
        analysis,
        'Update',
        'patch',
        [],
        makeConfig(),
      )
      // Both are in the same group, so only one changeset
      expect(result).toHaveLength(1)
    })
  })

  describe('createChangesetInfos', () => {
    it('should dispatch to createSingleChangeset for single strategy', async () => {
      const analysis = makeAnalysisResult(['pkg-a'])
      const result = await createChangesetInfos({
        dependencies: [],
        prContext: makePRContext(),
        analysis,
        baseChangesetContent: 'Update',
        changesetType: 'patch',
        strategy: 'single',
        reasoning: [],
        config: makeConfig(),
        getGitShortSha,
      })
      expect(result).toHaveLength(1)
    })

    it('should dispatch to createMultipleChangesets for multiple strategy', async () => {
      const analysis = makeAnalysisResult(['pkg-a', 'pkg-b'])
      const result = await createChangesetInfos({
        dependencies: [],
        prContext: makePRContext(),
        analysis,
        baseChangesetContent: 'Update',
        changesetType: 'patch',
        strategy: 'multiple',
        reasoning: [],
        config: makeConfig(),
        getGitShortSha,
      })
      expect(result).toHaveLength(2)
    })

    it('should dispatch to createGroupedChangesets for grouped strategy', async () => {
      const analysis = makeAnalysisResult(['pkg-a', 'pkg-b'])
      const result = await createChangesetInfos({
        dependencies: [],
        prContext: makePRContext(),
        analysis,
        baseChangesetContent: 'Update',
        changesetType: 'patch',
        strategy: 'grouped',
        reasoning: [],
        config: makeConfig(),
        getGitShortSha,
      })
      expect(result.length).toBeGreaterThanOrEqual(1)
    })

    it('should throw for unknown strategy', async () => {
      const analysis = makeAnalysisResult(['pkg-a'])
      await expect(
        createChangesetInfos({
          dependencies: [],
          prContext: makePRContext(),
          analysis,
          baseChangesetContent: 'Update',
          changesetType: 'patch',
          strategy: 'unknown' as 'single',
          reasoning: [],
          config: makeConfig(),
          getGitShortSha,
        }),
      ).rejects.toThrow()
    })
  })
})
