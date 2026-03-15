import type {ChangesetInfo} from '../multi-package-changeset-generator'
import type {
  ChangesetDeduplicationConfig,
  ExistingChangesetInfo,
  SimilarityAnalysis,
} from './deduplicator-types'

type ComparisonConfig = Pick<
  ChangesetDeduplicationConfig,
  'semanticSimilarityThreshold' | 'mergeStrategy'
>

const RELEASE_PRIORITY: Record<ChangesetInfo['releases'][number]['type'], number> = {
  patch: 1,
  minor: 2,
  major: 3,
}

export function calculateChangesetContentHash(changeset: ChangesetInfo): string {
  return JSON.stringify({
    packages: [...changeset.packages].sort(),
    releases: changeset.releases
      .map(release => ({name: release.name, type: release.type}))
      .sort((left, right) => left.name.localeCompare(right.name)),
    summary: changeset.summary.trim().replaceAll(/\s+/g, ' '),
  })
}

export function analyzeSimilarity(
  changeset1: ChangesetInfo,
  changeset2: ChangesetInfo,
  config: ComparisonConfig,
): SimilarityAnalysis {
  const isExactMatch =
    calculateChangesetContentHash(changeset1) === calculateChangesetContentHash(changeset2)
  const packageOverlap = calculateSetOverlap(
    new Set(changeset1.packages),
    new Set(changeset2.packages),
  )
  const dependencyOverlap = calculateSetOverlap(
    new Set(changeset1.metadata.affectedDependencies),
    new Set(changeset2.metadata.affectedDependencies),
  )
  const semanticSimilarity = packageOverlap * 0.6 + dependencyOverlap * 0.4
  const isSimilar = semanticSimilarity >= config.semanticSimilarityThreshold || isExactMatch
  const sameUpdateType =
    changeset1.metadata.isSecurityUpdate === changeset2.metadata.isSecurityUpdate
  const compatibleBreaking =
    changeset1.metadata.hasBreakingChanges === changeset2.metadata.hasBreakingChanges
  const hasOverlap = packageOverlap > 0 || dependencyOverlap > 0

  return {
    contentSimilarity: isExactMatch ? 1 : 0,
    packageOverlap,
    dependencyOverlap,
    semanticSimilarity,
    isExactMatch,
    isSimilar,
    canMerge:
      sameUpdateType && compatibleBreaking && hasOverlap && config.mergeStrategy !== 'disabled',
    mergeRisk: determineMergeRisk(changeset1, changeset2, packageOverlap, dependencyOverlap),
  }
}

export function isChangesetDuplicateOfExisting(
  changeset: ChangesetInfo,
  existing: ExistingChangesetInfo,
): boolean {
  const newReleases = changeset.releases.map(toReleaseKey).sort(compareReleaseKeys)
  const existingReleases = existing.releases.map(toReleaseKey).sort(compareReleaseKeys)

  if (newReleases.length !== existingReleases.length) {
    return false
  }

  return newReleases.every((release, index) => release === existingReleases[index])
}

function calculateSetOverlap(left: Set<string>, right: Set<string>): number {
  const intersection = new Set([...left].filter(value => right.has(value)))
  const union = new Set([...left, ...right])

  return union.size > 0 ? intersection.size / union.size : 0
}

function determineMergeRisk(
  changeset1: ChangesetInfo,
  changeset2: ChangesetInfo,
  packageOverlap: number,
  dependencyOverlap: number,
): SimilarityAnalysis['mergeRisk'] {
  if (changeset1.metadata.hasBreakingChanges || changeset2.metadata.hasBreakingChanges) {
    return 'high'
  }

  if (packageOverlap < 0.5 && dependencyOverlap < 0.5) {
    return 'medium'
  }

  return 'low'
}

function toReleaseKey(release: ChangesetInfo['releases'][number]): string {
  return `${release.name}:${RELEASE_PRIORITY[release.type]}`
}

function compareReleaseKeys(left: string, right: string): number {
  return left.localeCompare(right)
}
