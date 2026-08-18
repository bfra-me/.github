import type {Config} from './action-config.js'
import type {CategorizationInfo, ReleaseEntry} from './changeset-info-formatter.js'
import type {MultiPackageChangesetResult} from './multi-package-changeset-generator.js'
import type {RenovatePRContext} from './renovate-parser.js'

import * as core from '@actions/core'
import {writeRenovateChangeset} from './changeset-writer.js'
import {isPackageReleasable, readChangesetsReleasePolicy} from './changesets-release-policy.js'
import {classifyRenovateUpdates} from './classify/renovate-classifier.js'
import {adaptClassifiedUpdates} from './compatibility-adapter.js'
import {classifyNoPackageOperation} from './extract/non-package-renovate-operation.js'
import {extractRenovateUpdates, NoPackageTableError} from './extract/renovate-body-extractor.js'
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
}): Promise<RunGenerationResult | undefined> {
  const commitMessage =
    params.prContext.commitMessages.find(message => /\[security\]\s*$/iu.test(message)) ??
    params.prContext.commitMessages.at(-1)
  const prBody = params.prBody ?? params.prContext.prBody
  let extracted
  try {
    extracted = extractRenovateUpdates({
      prNumber: params.prNumber,
      body: prBody,
      branchName: params.prContext.branchName,
      manager: params.prContext.manager,
      changedFiles: params.changedFiles,
      commitMessage,
      labels: params.prContext.labels,
    })
  } catch (error) {
    if (!(error instanceof NoPackageTableError)) throw error

    const disposition = classifyNoPackageOperation(
      prBody,
      params.prContext.branchName,
      params.config.branchPrefix,
    )
    if (disposition.kind === 'skip') {
      core.info(
        `Recognized ${disposition.reason} Renovate control-plane operation; skipping changeset generation`,
      )
      return undefined
    }

    throw new Error(
      `Failed to parse Renovate PR #${params.prNumber}: body has no dependency table and was not recognized as a known control-plane operation`,
    )
  }
  const classification = classifyRenovateUpdates(extracted)
  const parsed = adaptClassifiedUpdates(extracted, classification)
  const classifiedPRContext: RenovatePRContext = {
    ...params.prContext,
    dependencies: parsed.dependencies,
    manager: extracted.manager === 'mixed' ? 'unknown' : extracted.manager,
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
  const releasePolicy = await readChangesetsReleasePolicy(params.workingDirectory)
  const releasableWorkspacePackages = multiPackageAnalysis.workspacePackages.filter(pkg =>
    isPackageReleasable(pkg, releasePolicy),
  )
  const releasableNames = new Set(releasableWorkspacePackages.map(pkg => pkg.name))
  const releasableAffectedPackages = multiPackageAnalysis.affectedPackages.filter(name =>
    releasableNames.has(name),
  )
  const releasableDirectPackages = multiPackageAnalysis.impactAnalysis.directlyAffected.filter(
    name => releasableNames.has(name),
  )
  const useFallback = releasableDirectPackages.length === 0
  const excludedAffectedPackages = multiPackageAnalysis.affectedPackages.filter(
    name => !releasableNames.has(name),
  )

  if (excludedAffectedPackages.length > 0) {
    core.info(`Excluded unreleasable affected packages: ${excludedAffectedPackages.join(', ')}`)
  }

  const discoveredTarget =
    params.config.targetPackage == null
      ? undefined
      : (multiPackageAnalysis.workspacePackages.find(
          pkg => pkg.name === params.config.targetPackage && pkg.workspaceMember !== false,
        ) ??
        multiPackageAnalysis.workspacePackages.find(
          pkg => pkg.name === params.config.targetPackage,
        ))
  if (discoveredTarget != null) {
    const targetIsReleasable = isPackageReleasable(discoveredTarget, releasePolicy)
    const targetIsWorkspaceMember = discoveredTarget.workspaceMember !== false
    if (!targetIsReleasable || !targetIsWorkspaceMember) {
      const reasons = [
        ...(targetIsReleasable ? [] : ['it is not releasable under .changeset/config.json']),
        ...(targetIsWorkspaceMember ? [] : ['it is not a declared workspace member']),
      ]
      throw new Error(
        `Configured target-package "${params.config.targetPackage}" cannot be used as a Changesets release target: ${reasons.join('; ')}`,
      )
    }
  }

  const fallbackPackages = releasableWorkspacePackages.filter(pkg => pkg.workspaceMember !== false)
  const fallbackName = getRootPackageName(
    fallbackPackages,
    params.repo,
    params.config.targetPackage,
  )
  if (
    useFallback &&
    params.config.targetPackage == null &&
    !fallbackPackages.some(pkg => pkg.name === fallbackName)
  ) {
    throw new Error(
      'No releasable workspace member is available as the Changesets fallback release target',
    )
  }

  const releaseNames = useFallback ? [fallbackName] : releasableAffectedPackages
  const releaseAnalysis = {
    ...multiPackageAnalysis,
    affectedPackages: releasableAffectedPackages,
  }
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

  if (useFallback) {
    // compatibility.releases carries the uncapped classification.bumpType, matching the
    // multi-package path below. params.changesetType is capped by capChangesetType; whether
    // either path should honour that cap is an open question, so both stay uncapped for now.
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
  } else {
    multiPackageResult = await generateMultiPackageChangesets(
      parsed.dependencies,
      classifiedPRContext,
      releaseAnalysis,
      changesetContent,
      classification.bumpType,
      multiPackageConfig,
    )
    changesetPath = multiPackageResult.filesCreated[0] ?? 'existing'
  }

  const releases = multiPackageResult.changesets[0]?.releases ?? compatibility.releases
  core.info(`Multi-package changeset generation: ${JSON.stringify(multiPackageResult)}`)
  setRunGenerationOutputs({
    multiPackageResult,
    multiPackageAnalysis,
    updateType:
      extracted.operation?.kind === 'lockfile-maintenance'
        ? extracted.operation.kind
        : extracted.manager,
    dependencyNames: compatibility.dependencyNames,
    changesetContent,
    categorizationResult: compatibility.categorizationResult,
  })

  const failedFiles = multiPackageResult.filesFailed ?? []
  if (failedFiles.length > 0) {
    const failureMessage = `Failed to write changesets: ${failedFiles
      .map(({file, reason}) => `${file} (${reason})`)
      .join(', ')}`
    core.setFailed(failureMessage)
    throw new Error(failureMessage)
  }

  return {
    changesetContent,
    releases,
    dependencyNames: compatibility.dependencyNames,
    changesetPath,
    multiPackageResult,
    categorizationResult: compatibility.categorizationResult,
  }
}
