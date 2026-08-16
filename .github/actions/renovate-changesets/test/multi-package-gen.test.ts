import type {
  MultiPackageAnalysisResult,
  PackageRelationship,
  WorkspacePackage,
} from '../src/multi-package-analyzer'
import type {MultiPackageChangesetConfig} from '../src/multi-package-gen/types'
import type {RenovateDependency, RenovatePRContext} from '../src/renovate-parser'
import {describe, expect, it} from 'vitest'
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

const config: MultiPackageChangesetConfig = {
  workingDirectory: '/tmp/workspace',
  useOfficialChangesets: false,
  createSeparateChangesets: true,
  respectPackageRelationships: true,
  groupRelatedPackages: true,
  packageNameTemplate: '{name}',
  includeRelationshipInfo: true,
  maxChangesetsPerPR: 10,
  enableDeduplication: false,
}

const packageA: WorkspacePackage = {
  name: '@scope/a',
  path: 'packages/a',
  packageJsonPath: 'packages/a/package.json',
  version: '1.0.0',
  dependencies: {lodash: '^4.0.0', express: '^4.0.0'},
  devDependencies: {},
  peerDependencies: {},
  optionalDependencies: {},
  private: false,
}

const packageB: WorkspacePackage = {
  name: '@scope/b',
  path: 'packages/b',
  packageJsonPath: 'packages/b/package.json',
  version: '1.0.0',
  dependencies: {},
  devDependencies: {lodash: '^4.0.0'},
  peerDependencies: {},
  optionalDependencies: {},
  private: false,
}

function relationship(
  source: string,
  target: string,
  type: PackageRelationship['type'] = 'internal-dependency',
): PackageRelationship {
  return {source, target, type, confidence: 1, impact: 'medium'}
}

const relationships = [relationship('@scope/a', '@scope/b')]

const analysis: MultiPackageAnalysisResult = {
  workspacePackages: [packageA, packageB],
  packageRelationships: relationships,
  affectedPackages: ['@scope/a', '@scope/b'],
  impactAnalysis: {
    directlyAffected: ['@scope/a'],
    indirectlyAffected: ['@scope/b'],
    riskLevel: 'medium',
    changesetStrategy: 'multiple',
  },
  recommendations: {
    createSeparateChangesets: true,
  },
}

const dependency: RenovateDependency = {
  name: 'lodash',
  currentVersion: '4.17.20',
  newVersion: '4.17.21',
  manager: 'npm',
  updateType: 'patch',
  isSecurityUpdate: false,
  isGrouped: true,
  groupName: 'lodash ecosystem',
}

const securityDependency: RenovateDependency = {
  ...dependency,
  name: 'express',
  updateType: 'major',
  isSecurityUpdate: true,
}

const prContext: RenovatePRContext = {
  dependencies: [dependency, securityDependency],
  isRenovateBot: true,
  branchName: 'renovate/npm-group',
  prTitle: 'Update npm dependencies',
  prBody: '',
  commitMessages: [],
  isGroupedUpdate: true,
  isSecurityUpdate: true,
  updateType: 'major',
  manager: 'npm',
  files: [],
}

describe('multi-package generator characterization', () => {
  it('discovers transitive package groups and dependency ownership', () => {
    expect(findPackageGroup('@scope/a', relationships, ['@scope/a', '@scope/b'])).toEqual([
      '@scope/a',
      '@scope/b',
    ])
    expect(
      findPackageGroup(
        '@scope/a',
        [relationship('@scope/a', '@scope/b', 'dev-dependency')],
        ['@scope/a', '@scope/b'],
      ),
    ).toEqual(['@scope/a'])
    expect(findDependenciesForPackage('@scope/a', [dependency], [packageA])).toEqual([dependency])
    expect(findDependenciesForPackage('@scope/missing', [dependency], [packageA])).toEqual([])
    expect(packageHasDependency('@scope/b', dependency, [packageB])).toBe(true)
    expect(packageHasDependency('@scope/missing', dependency, [packageA])).toBe(false)
  })

  it('selects a single, grouped, or recommended strategy from analysis and config', () => {
    const reasoning: string[] = []
    expect(
      determineChangesetStrategy(analysis, {...config, createSeparateChangesets: false}, reasoning),
    ).toBe('single')

    expect(determineChangesetStrategy(analysis, config, reasoning)).toBe('grouped')
    expect(
      determineChangesetStrategy(
        {
          ...analysis,
          packageRelationships: [relationship('@scope/a', '@scope/b', 'dev-dependency')],
        },
        {...config, groupRelatedPackages: false},
        reasoning,
      ),
    ).toBe('multiple')
    expect(reasoning).toContain('Configuration forces single changeset')
  })

  it('adds multi-package, relationship, and impact details to summaries', () => {
    const manyRelationships = Array.from({length: 6}, (_, index) =>
      relationship('@scope/a', `@scope/related-${index}`),
    )
    const richAnalysis = {
      ...analysis,
      packageRelationships: manyRelationships,
    }

    expect(
      enhanceChangesetSummary('Base summary', {...analysis, workspacePackages: [packageA]}, config),
    ).toBe('Base summary')
    const across = enhanceChangesetSummary('Base summary', richAnalysis, config)
    expect(across).toContain('across 2 packages')
    expect(across).toContain('... and 1 more')
    expect(across).toContain('1 packages directly affected, 1 indirectly affected')
    expect(enhanceChangesetSummary('Base summary', richAnalysis, config, '@scope/a')).toContain(
      'for package `@scope/a`',
    )
    expect(
      enhanceChangesetSummary('Base summary', richAnalysis, config, undefined, [
        '@scope/a',
        '@scope/b',
      ]),
    ).toContain('for packages: `@scope/a`, `@scope/b`')
    expect(
      enhanceChangesetSummary('Base summary', richAnalysis, {
        ...config,
        includeRelationshipInfo: false,
      }),
    ).not.toContain('Package relationships')
  })

  it('creates a single changeset with exact releases and security metadata', async () => {
    const reasoning: string[] = []
    const result = await createSingleChangeset({
      dependencies: [dependency, securityDependency],
      prContext,
      analysis,
      baseChangesetContent: 'Update summary',
      changesetType: 'major',
      reasoning,
      config,
      getGitShortSha: async () => 'abc1234',
    })

    expect(result).toMatchObject({
      id: 'renovate-abc1234',
      filename: 'renovate-abc1234.md',
      packages: ['@scope/a', '@scope/b'],
      releases: [
        {name: '@scope/a', type: 'major'},
        {name: '@scope/b', type: 'major'},
      ],
      metadata: {
        isGrouped: true,
        isSecurityUpdate: true,
        hasBreakingChanges: true,
        affectedDependencies: ['lodash', 'express'],
      },
    })
    expect(reasoning).toContain('Creating single changeset for all affected packages')
  })

  it('creates separate changesets with package-specific dependencies and relationships', async () => {
    const reasoning: string[] = []
    const results = await createMultipleChangesets(
      [dependency, securityDependency],
      analysis,
      'Update summary',
      'patch',
      reasoning,
      config,
    )

    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({
      filename: 'renovate--scope-a-0.md',
      packages: ['@scope/a'],
      metadata: {isSecurityUpdate: true, affectedDependencies: ['lodash', 'express']},
    })
    expect(results[1]).toMatchObject({packages: ['@scope/b']})
    expect(reasoning).toContain('Creating separate changesets for each affected package')
  })

  it('creates one grouped changeset and marks packages as processed', async () => {
    const reasoning: string[] = []
    const results = await createGroupedChangesets(
      [dependency, securityDependency],
      analysis,
      'Update summary',
      'major',
      reasoning,
      config,
    )

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      packages: ['@scope/a', '@scope/b'],
      releases: [
        {name: '@scope/a', type: 'major'},
        {name: '@scope/b', type: 'major'},
      ],
      metadata: {isGrouped: true, isSecurityUpdate: true, hasBreakingChanges: true},
    })
    expect(reasoning).toContain('Creating grouped changesets based on package relationships')
  })

  it('dispatches all supported creation strategies', async () => {
    const params = {
      dependencies: [dependency],
      prContext,
      analysis,
      baseChangesetContent: 'Update summary',
      changesetType: 'patch' as const,
      reasoning: [] as string[],
      config,
      getGitShortSha: async () => 'abc1234',
    }

    await expect(createChangesetInfos({...params, strategy: 'single'})).resolves.toHaveLength(1)
    await expect(createChangesetInfos({...params, strategy: 'multiple'})).resolves.toHaveLength(2)
    await expect(createChangesetInfos({...params, strategy: 'grouped'})).resolves.toHaveLength(1)
    await expect(createChangesetInfos({...params, strategy: 'invalid' as never})).rejects.toThrow(
      'Unknown strategy: invalid',
    )
  })
})
