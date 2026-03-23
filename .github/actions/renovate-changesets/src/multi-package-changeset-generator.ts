import type {MultiPackageAnalysisResult} from './multi-package-analyzer'
import type {
  MultiPackageChangesetConfig,
  MultiPackageChangesetResult,
} from './multi-package-gen/types'
import type {RenovateDependency, RenovatePRContext} from './renovate-parser'
import process from 'node:process'
import * as core from '@actions/core'
import {deduplicateChangesets} from './changeset-deduplicator'
import {createChangesetInfos, createSingleChangeset} from './multi-package-gen/changeset-creators'
import {determineChangesetStrategy} from './multi-package-gen/changeset-strategy'
import {getGitShortSha, writeChangesetFiles} from './multi-package-gen/changeset-writer'

function buildConfig(config: Partial<MultiPackageChangesetConfig>): MultiPackageChangesetConfig {
  return {
    workingDirectory: config.workingDirectory || process.cwd(),
    useOfficialChangesets: config.useOfficialChangesets ?? true,
    createSeparateChangesets: config.createSeparateChangesets ?? false,
    respectPackageRelationships: config.respectPackageRelationships ?? true,
    groupRelatedPackages: config.groupRelatedPackages ?? true,
    packageNameTemplate: config.packageNameTemplate || 'renovate-{sha}',
    includeRelationshipInfo: config.includeRelationshipInfo ?? true,
    maxChangesetsPerPR: config.maxChangesetsPerPR || 10,
    enableDeduplication: config.enableDeduplication ?? true,
    deduplicationConfig: config.deduplicationConfig ?? {
      enableContentDeduplication: true,
      enableSemanticDeduplication: true,
      enableChangesetMerging: true,
      semanticSimilarityThreshold: 0.8,
      maxMergeCount: 5,
      mergeStrategy: 'conservative',
      preserveMetadata: true,
      analyzeExistingChangesets: true,
      maxExistingChangesetAge: 30,
    },
    ...config,
  }
}

export async function generateMultiPackageChangesets(
  dependencies: RenovateDependency[],
  prContext: RenovatePRContext,
  multiPackageAnalysis: MultiPackageAnalysisResult,
  changesetContent: string,
  changesetType: 'patch' | 'minor' | 'major',
  config: Partial<MultiPackageChangesetConfig> = {},
): Promise<MultiPackageChangesetResult> {
  const resolvedConfig = buildConfig(config)

  try {
    const reasoning: string[] = []
    const warnings: string[] = []

    const strategy = determineChangesetStrategy(multiPackageAnalysis, resolvedConfig, reasoning)

    const changesets = await createChangesetInfos({
      dependencies,
      prContext,
      analysis: multiPackageAnalysis,
      baseChangesetContent: changesetContent,
      changesetType,
      strategy,
      reasoning,
      config: resolvedConfig,
      getGitShortSha,
    })

    if (changesets.length > resolvedConfig.maxChangesetsPerPR) {
      warnings.push(`Too many changesets (${changesets.length}), falling back to single changeset`)
      const singleChangeset = await createSingleChangeset({
        dependencies,
        prContext,
        analysis: multiPackageAnalysis,
        baseChangesetContent: changesetContent,
        changesetType,
        reasoning,
        config: resolvedConfig,
        getGitShortSha,
      })
      return {
        changesets: [singleChangeset],
        strategy: 'single',
        totalPackagesAffected: multiPackageAnalysis.affectedPackages.length,
        filesCreated: [],
        reasoning,
        warnings,
      }
    }

    let finalChangesets = changesets
    let deduplicationReasoning: string[] = []

    if (resolvedConfig.enableDeduplication && changesets.length > 1) {
      core.info('Applying changeset deduplication for grouped updates')

      const deduplicationResult = await deduplicateChangesets(changesets, {
        ...resolvedConfig.deduplicationConfig,
        workingDirectory: resolvedConfig.workingDirectory,
      })

      finalChangesets = deduplicationResult.deduplicatedChangesets
      deduplicationReasoning = deduplicationResult.reasoning

      core.info(
        `Deduplication complete: ${deduplicationResult.stats.totalOriginal} → ${deduplicationResult.stats.totalFinal} changesets`,
      )
      core.info(
        `Removed ${deduplicationResult.stats.duplicatesRemoved} duplicates, merged ${deduplicationResult.stats.changesetseMerged} groups`,
      )

      if (deduplicationResult.warnings.length > 0) {
        warnings.push(...deduplicationResult.warnings)
        for (const warning of deduplicationResult.warnings) {
          core.warning(`Deduplication warning: ${warning}`)
        }
      }

      if (deduplicationResult.existingDuplicates.length > 0) {
        core.info(
          `Found ${deduplicationResult.existingDuplicates.length} duplicate existing changesets: ${deduplicationResult.existingDuplicates.join(', ')}`,
        )
      }

      reasoning.push(...deduplicationReasoning)
    } else if (resolvedConfig.enableDeduplication) {
      reasoning.push(
        'Deduplication enabled but only one changeset generated - skipping deduplication',
      )
    } else {
      reasoning.push('Deduplication disabled in configuration')
    }

    const filesCreated = await writeChangesetFiles(finalChangesets, resolvedConfig)

    return {
      changesets: finalChangesets,
      strategy,
      totalPackagesAffected: multiPackageAnalysis.affectedPackages.length,
      filesCreated,
      reasoning,
      warnings,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Multi-package changeset generation failed: ${errorMessage}`)
  }
}

export type {
  ChangesetInfo,
  MultiPackageChangesetConfig,
  MultiPackageChangesetResult,
} from './multi-package-gen/types'
