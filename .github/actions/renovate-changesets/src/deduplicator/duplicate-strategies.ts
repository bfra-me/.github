import type {ChangesetInfo} from '../multi-package-changeset-generator'
import type {
  ChangesetDeduplicationConfig,
  DeduplicationPassResult,
  ExistingChangesetCheckResult,
  ExistingChangesetInfo,
} from './deduplicator-types'
import * as core from '@actions/core'
import {
  analyzeSimilarity,
  calculateChangesetContentHash,
  isChangesetDuplicateOfExisting,
} from './changeset-comparator'

type SimilarityConfig = Pick<
  ChangesetDeduplicationConfig,
  'semanticSimilarityThreshold' | 'mergeStrategy'
>

export function performContentDeduplication(changesets: ChangesetInfo[]): DeduplicationPassResult {
  const unique: ChangesetInfo[] = []
  const duplicates: ChangesetInfo[] = []
  const seenContent = new Set<string>()

  for (const changeset of changesets) {
    const contentHash = calculateChangesetContentHash(changeset)

    if (seenContent.has(contentHash)) {
      duplicates.push(changeset)
      core.info(`Content duplicate detected: ${changeset.id}`)
      continue
    }

    seenContent.add(contentHash)
    unique.push(changeset)
  }

  return {unique, duplicates}
}

export function performSemanticDeduplication(
  changesets: ChangesetInfo[],
  config: SimilarityConfig,
): DeduplicationPassResult {
  const unique: ChangesetInfo[] = []
  const duplicates: ChangesetInfo[] = []
  const processed = new Set<string>()

  for (let index = 0; index < changesets.length; index++) {
    const changeset = changesets[index]

    if (changeset == null || processed.has(changeset.id)) {
      continue
    }

    let foundSimilar = false

    for (let otherIndex = index + 1; otherIndex < changesets.length; otherIndex++) {
      const otherChangeset = changesets[otherIndex]

      if (otherChangeset == null || processed.has(otherChangeset.id)) {
        continue
      }

      const similarity = analyzeSimilarity(changeset, otherChangeset, config)
      if (
        similarity.isSimilar &&
        similarity.semanticSimilarity >= config.semanticSimilarityThreshold
      ) {
        duplicates.push(otherChangeset)
        processed.add(otherChangeset.id)
        foundSimilar = true
        core.info(
          `Semantic duplicate detected: ${otherChangeset.id} (similarity: ${similarity.semanticSimilarity.toFixed(2)})`,
        )
      }
    }

    if (!foundSimilar) {
      unique.push(changeset)
    }

    processed.add(changeset.id)
  }

  return {unique, duplicates}
}

export function checkAgainstExistingChangesets(
  changesets: ChangesetInfo[],
  existingChangesets: ExistingChangesetInfo[],
): ExistingChangesetCheckResult {
  const unique: ChangesetInfo[] = []
  const duplicateFiles: string[] = []

  for (const changeset of changesets) {
    const duplicateFile = existingChangesets.find(existing =>
      isChangesetDuplicateOfExisting(changeset, existing),
    )

    if (duplicateFile != null) {
      duplicateFiles.push(duplicateFile.filename)
      core.info(
        `Duplicate of existing changeset detected: ${changeset.id} matches ${duplicateFile.filename}`,
      )
      continue
    }

    unique.push(changeset)
  }

  return {unique, duplicateFiles}
}
