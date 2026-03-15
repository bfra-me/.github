import type {Config} from './action-config'
import type {CategorizationResult} from './change-categorization-engine'
import type {ReleaseEntry} from './changeset-info-formatter'
import type {MultiPackageChangesetResult} from './multi-package-changeset-generator'
import type {RenovateDependency, RenovatePRContext} from './renovate-parser'
import type {ImpactAssessment} from './semver-impact-assessor'
import process from 'node:process'
import * as core from '@actions/core'
import {ChangesetSummaryGenerator} from './changeset-summary-generator'
import {ChangesetTemplateEngine} from './changeset-template-engine'
import {writeRenovateChangeset} from './changeset-writer'
import {MultiPackageAnalyzer} from './multi-package-analyzer'
import {MultiPackageChangesetGenerator} from './multi-package-changeset-generator'
import {getRootPackageName, resolveDependencyNames} from './run-generation-helpers'
import {setRunGenerationOutputs} from './run-generation-outputs'
import {sortChangesetReleases} from './utils'

export interface RunGenerationResult {
  changesetContent: string
  releases: ReleaseEntry[]
  dependencyNames: string[]
  changesetPath: string
  multiPackageResult: MultiPackageChangesetResult
}

export async function generateChangesetsFromAnalysis(params: {
  config: Config
  owner: string
  repo: string
  prContext: RenovatePRContext
  prTitle: string
  workingDirectory: string
  changedFiles: string[]
  enhancedDependencies: RenovateDependency[]
  impactAssessment: ImpactAssessment
  categorizationResult: CategorizationResult
  updateType: string
  changesetType: 'patch' | 'minor' | 'major'
}): Promise<RunGenerationResult> {
  core.info('Analyzing multi-package dependencies and relationships')
  const multiPackageAnalyzer = new MultiPackageAnalyzer({
    workspaceRoot: params.workingDirectory,
    detectWorkspaces: true,
    analyzeInternalDependencies: true,
    enforceVersionConsistency: true,
    maxPackagesToAnalyze: 50,
  })
  const multiPackageAnalysis = await multiPackageAnalyzer.analyzeMultiPackageUpdate(
    params.enhancedDependencies,
    params.changedFiles,
  )

  core.info(
    `Multi-package analysis: ${JSON.stringify(
      {
        workspacePackages: multiPackageAnalysis.workspacePackages.length,
        packageRelationships: multiPackageAnalysis.packageRelationships.length,
        affectedPackages: multiPackageAnalysis.affectedPackages.length,
        strategy: multiPackageAnalysis.impactAnalysis.changesetStrategy,
        riskLevel: multiPackageAnalysis.impactAnalysis.riskLevel,
        createSeparateChangesets: multiPackageAnalysis.recommendations.createSeparateChangesets,
      },
      null,
      2,
    )}`,
  )
  if (multiPackageAnalysis.recommendations.reasoningChain.length > 0) {
    core.info(
      `Multi-package reasoning: ${multiPackageAnalysis.recommendations.reasoningChain.join('; ')}`,
    )
  }
  for (const depImpact of params.impactAssessment.dependencies) {
    core.debug(
      `Dependency ${depImpact.name}: ${depImpact.versionChange} change, ${depImpact.semverImpact} impact, confidence: ${depImpact.confidence}`,
    )
  }

  const dependencyNames = resolveDependencyNames(
    params.enhancedDependencies,
    params.prContext.isGroupedUpdate,
    params.prTitle,
    params.updateType,
  )

  const templateEngine = new ChangesetTemplateEngine({
    workingDirectory: process.cwd(),
    errorHandling: 'fallback',
    security: {
      allowFileInclusion: true,
      allowCodeExecution: false,
      maxTemplateSize: 1024 * 1024,
      maxRenderTime: 5000,
    },
  })
  const summaryGenerator = new ChangesetSummaryGenerator(
    {
      useEmojis: true,
      includeVersionDetails: true,
      includeRiskAssessment: false,
      includeBreakingChangeWarnings: true,
      sortDependencies: params.config.sort || false,
      maxDependenciesToList: 5,
    },
    templateEngine,
  )
  const changesetContent = await summaryGenerator.generateSummary(
    params.prContext,
    params.impactAssessment,
    params.categorizationResult,
    params.updateType,
    dependencyNames,
    params.config.updateTypes[params.updateType]?.template,
  )

  const generator = new MultiPackageChangesetGenerator({
    workingDirectory: params.workingDirectory,
    useOfficialChangesets: true,
    createSeparateChangesets: multiPackageAnalysis.recommendations.createSeparateChangesets,
    respectPackageRelationships: true,
    groupRelatedPackages: true,
    includeRelationshipInfo: true,
    maxChangesetsPerPR: 10,
  })
  const multiPackageResult = await generator.generateMultiPackageChangesets(
    params.enhancedDependencies,
    params.prContext,
    multiPackageAnalysis,
    changesetContent,
    params.changesetType,
  )

  core.info(
    `Multi-package changeset generation: ${JSON.stringify(
      {
        strategy: multiPackageResult.strategy,
        changesetsCreated: multiPackageResult.changesets.length,
        filesCreated: multiPackageResult.filesCreated.length,
        totalPackagesAffected: multiPackageResult.totalPackagesAffected,
        warnings: multiPackageResult.warnings.length,
      },
      null,
      2,
    )}`,
  )
  if (multiPackageResult.reasoning.length > 0) {
    core.info(`Multi-package generation reasoning: ${multiPackageResult.reasoning.join('; ')}`)
  }
  for (const warning of multiPackageResult.warnings) {
    core.warning(warning)
  }

  let changesetExists = multiPackageResult.filesCreated.length > 0
  let changesetPath = 'multi-package'
  let releases =
    multiPackageResult.changesets.length > 0 && multiPackageResult.changesets[0] != null
      ? multiPackageResult.changesets[0].releases
      : [
          {
            name: getRootPackageName(multiPackageAnalysis.workspacePackages, params.repo),
            type: params.changesetType,
          },
        ]

  if (!changesetExists) {
    core.info('Multi-package generation created no files, falling back to original changeset logic')
    releases = [
      {
        name: getRootPackageName(multiPackageAnalysis.workspacePackages, params.repo),
        type: params.changesetType,
      },
    ]
    if (params.config.sort) releases = sortChangesetReleases(releases)
    changesetPath = await writeRenovateChangeset(
      {releases, summary: changesetContent},
      params.workingDirectory,
    )
    changesetExists = changesetPath !== 'existing'
    if (!changesetExists) {
      core.info(`Changeset already exists: ${changesetPath}`)
    }
  }

  setRunGenerationOutputs({
    multiPackageResult,
    multiPackageAnalysis,
    updateType: params.updateType,
    dependencyNames,
    changesetContent,
    categorizationResult: params.categorizationResult,
  })

  return {changesetContent, releases, dependencyNames, changesetPath, multiPackageResult}
}
