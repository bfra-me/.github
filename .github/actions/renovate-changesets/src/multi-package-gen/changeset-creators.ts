import type {MultiPackageAnalysisResult} from '../multi-package-analyzer'
import type {RenovateDependency, RenovatePRContext} from '../renovate-parser'
import type {ChangesetInfo, MultiPackageChangesetConfig} from './types'
import {enhanceChangesetSummary} from './changeset-enhancer'
import {
  findDependenciesForPackage,
  findPackageGroup,
  packageHasDependency,
} from './package-relationship-helpers'

export async function createChangesetInfos(params: {
  dependencies: RenovateDependency[]
  prContext: RenovatePRContext
  analysis: MultiPackageAnalysisResult
  baseChangesetContent: string
  changesetType: 'patch' | 'minor' | 'major'
  strategy: 'single' | 'multiple' | 'grouped'
  reasoning: string[]
  config: MultiPackageChangesetConfig
  getGitShortSha: () => Promise<string>
}): Promise<ChangesetInfo[]> {
  switch (params.strategy) {
    case 'single':
      return [
        await createSingleChangeset({
          dependencies: params.dependencies,
          prContext: params.prContext,
          analysis: params.analysis,
          baseChangesetContent: params.baseChangesetContent,
          changesetType: params.changesetType,
          reasoning: params.reasoning,
          config: params.config,
          getGitShortSha: params.getGitShortSha,
        }),
      ]

    case 'multiple':
      return createMultipleChangesets(
        params.dependencies,
        params.analysis,
        params.baseChangesetContent,
        params.changesetType,
        params.reasoning,
        params.config,
      )

    case 'grouped':
      return createGroupedChangesets(
        params.dependencies,
        params.analysis,
        params.baseChangesetContent,
        params.changesetType,
        params.reasoning,
        params.config,
      )

    default:
      throw new Error(`Unknown strategy: ${params.strategy}`)
  }
}

export async function createSingleChangeset(params: {
  dependencies: RenovateDependency[]
  prContext: RenovatePRContext
  analysis: MultiPackageAnalysisResult
  baseChangesetContent: string
  changesetType: 'patch' | 'minor' | 'major'
  reasoning: string[]
  config: MultiPackageChangesetConfig
  getGitShortSha: () => Promise<string>
}): Promise<ChangesetInfo> {
  params.reasoning.push('Creating single changeset for all affected packages')

  const shaReference = await params.getGitShortSha()
  const changesetId = `renovate-${shaReference}`

  const releases = params.analysis.affectedPackages.map(packageName => ({
    name: packageName,
    type: params.changesetType,
  }))

  const enhancedSummary = enhanceChangesetSummary(
    params.baseChangesetContent,
    params.analysis,
    params.config,
  )

  return {
    id: changesetId,
    filename: `${changesetId}.md`,
    packages: params.analysis.affectedPackages,
    summary: enhancedSummary,
    releases,
    relationships: params.analysis.packageRelationships,
    metadata: {
      isGrouped: params.prContext.isGroupedUpdate,
      isSecurityUpdate: params.prContext.isSecurityUpdate,
      hasBreakingChanges: params.dependencies.some(dep => dep.updateType === 'major'),
      affectedDependencies: params.dependencies.map(dep => dep.name),
      reasoning: ['Single changeset strategy for all affected packages'],
    },
  }
}

export function createMultipleChangesets(
  dependencies: RenovateDependency[],
  analysis: MultiPackageAnalysisResult,
  baseChangesetContent: string,
  changesetType: 'patch' | 'minor' | 'major',
  reasoning: string[],
  config: MultiPackageChangesetConfig,
): Promise<ChangesetInfo[]> {
  reasoning.push('Creating separate changesets for each affected package')

  const changesets: ChangesetInfo[] = []

  for (const [index, packageName] of analysis.affectedPackages.entries()) {
    const changesetId = `renovate-${packageName.replaceAll(/[^a-z0-9]/gi, '-')}-${index}`

    const packageDependencies = findDependenciesForPackage(
      packageName,
      dependencies,
      analysis.workspacePackages,
    )

    const packageRelationships = analysis.packageRelationships.filter(
      rel => rel.source === packageName || rel.target === packageName,
    )

    const enhancedSummary = enhanceChangesetSummary(
      baseChangesetContent,
      analysis,
      config,
      packageName,
    )

    changesets.push({
      id: changesetId,
      filename: `${changesetId}.md`,
      packages: [packageName],
      summary: enhancedSummary,
      releases: [{name: packageName, type: changesetType}],
      relationships: packageRelationships,
      metadata: {
        isGrouped: false,
        isSecurityUpdate: packageDependencies.some(dep => dep.isSecurityUpdate),
        hasBreakingChanges: packageDependencies.some(dep => dep.updateType === 'major'),
        affectedDependencies: packageDependencies.map(dep => dep.name),
        reasoning: [`Separate changeset for package: ${packageName}`],
      },
    })
  }

  return Promise.resolve(changesets)
}

export function createGroupedChangesets(
  dependencies: RenovateDependency[],
  analysis: MultiPackageAnalysisResult,
  baseChangesetContent: string,
  changesetType: 'patch' | 'minor' | 'major',
  reasoning: string[],
  config: MultiPackageChangesetConfig,
): Promise<ChangesetInfo[]> {
  reasoning.push('Creating grouped changesets based on package relationships')

  const changesets: ChangesetInfo[] = []
  const processedPackages = new Set<string>()

  for (const packageName of analysis.affectedPackages) {
    if (processedPackages.has(packageName)) {
      continue
    }

    const group = findPackageGroup(
      packageName,
      analysis.packageRelationships,
      analysis.affectedPackages,
    )
    const changesetId = `renovate-group-${group
      .map(p => p.replaceAll(/[^a-z0-9]/gi, '-'))
      .join('-')
      .slice(0, 50)}`

    const groupDependencies = dependencies.filter(dep =>
      group.some(pkg => packageHasDependency(pkg, dep, analysis.workspacePackages)),
    )

    const groupRelationships = analysis.packageRelationships.filter(
      rel => group.includes(rel.source) && group.includes(rel.target),
    )

    const enhancedSummary = enhanceChangesetSummary(
      baseChangesetContent,
      analysis,
      config,
      undefined,
      group,
    )

    const releases = group.map(pkg => ({name: pkg, type: changesetType}))

    changesets.push({
      id: changesetId,
      filename: `${changesetId}.md`,
      packages: group,
      summary: enhancedSummary,
      releases,
      relationships: groupRelationships,
      metadata: {
        isGrouped: true,
        isSecurityUpdate: groupDependencies.some(dep => dep.isSecurityUpdate),
        hasBreakingChanges: groupDependencies.some(dep => dep.updateType === 'major'),
        affectedDependencies: groupDependencies.map(dep => dep.name),
        reasoning: [`Grouped changeset for related packages: ${group.join(', ')}`],
      },
    })

    for (const pkg of group) {
      processedPackages.add(pkg)
    }
  }

  return Promise.resolve(changesets)
}
