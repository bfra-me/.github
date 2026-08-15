import type {Config} from './action-config.js'
import type {CategorizationInfo, ReleaseEntry} from './changeset-info-formatter.js'
import type {MultiPackageChangesetResult} from './multi-package-changeset-generator.js'
import type {RenovatePRContext} from './renovate-parser.js'

import * as core from '@actions/core'
import {writeRenovateChangeset} from './changeset-writer.js'
import {classifyRenovateUpdates} from './classify/renovate-classifier.js'
import {adaptClassifiedUpdates} from './compatibility-adapter.js'
import {extractRenovateUpdates} from './extract/renovate-body-extractor.js'
import {formatChangesetSummary} from './format/changeset-summary-formatter.js'
import {analyzeMultiPackageUpdate} from './multi-package-analyzer.js'
import {generateMultiPackageChangesets} from './multi-package-changeset-generator.js'
import {getRootPackageName} from './run-generation-helpers.js'
import {setRunGenerationOutputs} from './run-generation-outputs.js'

export interface RunGenerationResult {
  changesetContent: string
  releases: ReleaseEntry[]
  dependencyNames: string[]
  changesetPath: string
  multiPackageResult: MultiPackageChangesetResult
  categorizationResult: CategorizationInfo
}

export async function generateChangesetsFromAnalysis(params: {
  config: Config
  owner: string
  repo: string
  prNumber: number
  prContext: RenovatePRContext
  prBody?: string
  prTitle: string
  workingDirectory: string
  changedFiles: string[]
  enhancedDependencies: unknown[]
  impactAssessment: unknown
  categorizationResult: unknown
  updateType: string
  changesetType: 'patch' | 'minor' | 'major'
}): Promise<RunGenerationResult> {
  const commitMessage =
    params.prContext.commitMessages.find(message => /\[security\]\s*$/iu.test(message)) ??
    params.prContext.commitMessages.at(-1)
  const prBody = params.prBody ?? params.prContext.prBody
  const extracted = extractRenovateUpdates({
    prNumber: params.prNumber,
    body: prBody,
    branchName: params.prContext.branchName,
    commitMessage,
    labels: params.prContext.labels,
  })
  const classification = classifyRenovateUpdates(extracted)
  const parsed = adaptClassifiedUpdates(extracted, classification)
  const classifiedPRContext: RenovatePRContext = {
    ...params.prContext,
    dependencies: parsed.dependencies,
    manager: extracted.manager,
    updateType: classification.bumpType,
    isGroupedUpdate: extracted.updates.length > 1,
    isSecurityUpdate: classification.isSecurityUpdate,
  }
  const changesetContent = formatChangesetSummary(classification, extracted, {
    emoji: params.config.emoji,
  })

  core.info(
    `Extracted ${extracted.updates.length} Renovate updates for ${extracted.manager}; ` +
      `classified as ${classification.updateCategory} (${classification.bumpType})`,
  )

  // Workspace analysis still determines which local packages receive releases, but it no longer
  // determines what Renovate changed. That source of truth is the PR body extraction above.
  core.info('Analyzing multi-package dependencies and relationships')
  const multiPackageAnalysis = await analyzeMultiPackageUpdate(
    parsed.dependencies,
    params.changedFiles,
    {
      workspaceRoot: params.workingDirectory,
      detectWorkspaces: true,
      analyzeInternalDependencies: true,
      enforceVersionConsistency: true,
      maxPackagesToAnalyze: 50,
    },
  )
  const releaseNames =
    multiPackageAnalysis.affectedPackages.length > 0
      ? multiPackageAnalysis.affectedPackages
      : [
          getRootPackageName(
            multiPackageAnalysis.workspacePackages,
            params.repo,
            params.config.targetPackage,
          ),
        ]
  const compatibility = adaptClassifiedUpdates(extracted, classification, releaseNames)

  const multiPackageConfig = {
    workingDirectory: params.workingDirectory,
    useOfficialChangesets: true,
    createSeparateChangesets: multiPackageAnalysis.recommendations.createSeparateChangesets,
    respectPackageRelationships: true,
    groupRelatedPackages: true,
    includeRelationshipInfo: true,
    maxChangesetsPerPR: 10,
  }

  let multiPackageResult: MultiPackageChangesetResult
  let changesetPath: string

  if (multiPackageAnalysis.affectedPackages.length > 0) {
    multiPackageResult = await generateMultiPackageChangesets(
      parsed.dependencies,
      classifiedPRContext,
      multiPackageAnalysis,
      changesetContent,
      classification.bumpType,
      multiPackageConfig,
    )
    changesetPath = multiPackageResult.filesCreated[0] ?? 'existing'
  } else {
    const writtenPath = await writeRenovateChangeset(
      {releases: compatibility.releases, summary: changesetContent},
      params.workingDirectory,
    )
    changesetPath = writtenPath
    const filename = writtenPath === 'existing' ? 'renovate-existing.md' : writtenPath
    const changeset = {
      id: filename.replace(/\.md$/u, ''),
      filename,
      packages: releaseNames,
      summary: changesetContent,
      releases: compatibility.releases,
      relationships: [],
      metadata: {
        isGrouped: extracted.updates.length > 1,
        isSecurityUpdate: classification.isSecurityUpdate,
        hasBreakingChanges: classification.bumpType === 'major',
        affectedDependencies: compatibility.dependencyNames,
        reasoning: ['Single changeset generated from extracted Renovate updates'],
      },
    }
    multiPackageResult = {
      changesets: [changeset],
      strategy: 'single',
      totalPackagesAffected: releaseNames.length,
      filesCreated: writtenPath === 'existing' ? [] : [`.changeset/${writtenPath}`],
      reasoning: ['No affected workspace package required the single-release fallback'],
      warnings: [],
    }
  }

  const releases = multiPackageResult.changesets[0]?.releases ?? compatibility.releases
  core.info(`Multi-package changeset generation: ${JSON.stringify(multiPackageResult)}`)
  setRunGenerationOutputs({
    multiPackageResult,
    multiPackageAnalysis,
    updateType: extracted.manager,
    dependencyNames: compatibility.dependencyNames,
    changesetContent,
    categorizationResult: compatibility.categorizationResult,
  })

  return {
    changesetContent,
    releases,
    dependencyNames: compatibility.dependencyNames,
    changesetPath,
    multiPackageResult,
    categorizationResult: compatibility.categorizationResult,
  }
}
