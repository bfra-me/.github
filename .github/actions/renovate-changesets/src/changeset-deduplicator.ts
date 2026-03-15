import type {
  ChangesetDeduplicationConfig,
  DeduplicationResult,
} from './deduplicator/deduplicator-types'
import type {ChangesetInfo} from './multi-package-changeset-generator'
import process from 'node:process'
import * as core from '@actions/core'
import {performChangesetMerging} from './deduplicator/changeset-merger'
import {validateDeduplicationResult} from './deduplicator/deduplication-validator'
import {
  checkAgainstExistingChangesets,
  performContentDeduplication,
  performSemanticDeduplication,
} from './deduplicator/duplicate-strategies'
import {analyzeExistingChangesets} from './deduplicator/existing-changeset-analyzer'

function buildConfig(config: Partial<ChangesetDeduplicationConfig>): ChangesetDeduplicationConfig {
  return {
    enableContentDeduplication: config.enableContentDeduplication ?? true,
    enableSemanticDeduplication: config.enableSemanticDeduplication ?? true,
    enableChangesetMerging: config.enableChangesetMerging ?? true,
    semanticSimilarityThreshold: config.semanticSimilarityThreshold ?? 0.8,
    maxMergeCount: config.maxMergeCount ?? 5,
    mergeStrategy: config.mergeStrategy ?? 'conservative',
    preserveMetadata: config.preserveMetadata ?? true,
    workingDirectory: config.workingDirectory ?? process.cwd(),
    analyzeExistingChangesets: config.analyzeExistingChangesets ?? true,
    maxExistingChangesetAge: config.maxExistingChangesetAge ?? 30,
    ...config,
  }
}

export class ChangesetDeduplicator {
  private config: ChangesetDeduplicationConfig

  constructor(config: Partial<ChangesetDeduplicationConfig> = {}) {
    this.config = buildConfig(config)
  }

  async deduplicateChangesets(changesets: ChangesetInfo[]): Promise<DeduplicationResult> {
    const reasoning: string[] = []
    const warnings: string[] = []

    core.info('Starting changeset deduplication analysis')
    reasoning.push(`Starting deduplication with ${changesets.length} changesets`)
    reasoning.push(`Configuration: ${JSON.stringify(this.config, null, 2)}`)

    const existingChangesets = this.config.analyzeExistingChangesets
      ? await analyzeExistingChangesets(this.config)
      : []

    if (existingChangesets.length > 0) {
      reasoning.push(`Found ${existingChangesets.length} existing changesets to analyze`)
    }

    let deduplicatedChangesets = [...changesets]
    const contentDuplicates = this.config.enableContentDeduplication
      ? performContentDeduplication(deduplicatedChangesets)
      : {unique: deduplicatedChangesets, duplicates: []}

    deduplicatedChangesets = contentDuplicates.unique
    reasoning.push(
      `Content deduplication: removed ${contentDuplicates.duplicates.length} exact duplicates`,
    )

    const semanticDuplicates = this.config.enableSemanticDeduplication
      ? performSemanticDeduplication(deduplicatedChangesets, this.config)
      : {unique: deduplicatedChangesets, duplicates: []}

    deduplicatedChangesets = semanticDuplicates.unique
    reasoning.push(
      `Semantic deduplication: removed ${semanticDuplicates.duplicates.length} similar changesets`,
    )

    const mergeResult =
      this.config.enableChangesetMerging && this.config.mergeStrategy !== 'disabled'
        ? await performChangesetMerging(deduplicatedChangesets, this.config)
        : {merged: deduplicatedChangesets, mergeOperations: []}

    deduplicatedChangesets = mergeResult.merged
    reasoning.push(
      `Changeset merging: merged ${mergeResult.mergeOperations.length} groups of changesets`,
    )

    const existingResult =
      existingChangesets.length > 0
        ? checkAgainstExistingChangesets(deduplicatedChangesets, existingChangesets)
        : {unique: deduplicatedChangesets, duplicateFiles: []}

    deduplicatedChangesets = existingResult.unique
    reasoning.push(
      `Existing changeset check: found ${existingResult.duplicateFiles.length} duplicates with existing files`,
    )

    validateDeduplicationResult(deduplicatedChangesets, changesets, warnings)

    const result: DeduplicationResult = {
      originalChangesets: changesets,
      deduplicatedChangesets,
      removedDuplicates: [...contentDuplicates.duplicates, ...semanticDuplicates.duplicates],
      mergedChangesets: mergeResult.mergeOperations,
      existingDuplicates: existingResult.duplicateFiles,
      reasoning,
      warnings,
      stats: {
        totalOriginal: changesets.length,
        totalFinal: deduplicatedChangesets.length,
        duplicatesRemoved:
          contentDuplicates.duplicates.length + semanticDuplicates.duplicates.length,
        changesetseMerged: mergeResult.mergeOperations.length,
        existingDuplicates: existingResult.duplicateFiles.length,
      },
    }

    core.info(
      `Deduplication complete: ${result.stats.totalOriginal} → ${result.stats.totalFinal} changesets`,
    )
    return result
  }
}
