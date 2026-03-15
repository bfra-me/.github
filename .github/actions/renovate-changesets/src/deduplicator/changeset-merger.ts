import type {ChangesetInfo} from '../multi-package-changeset-generator'
import type {ChangesetDeduplicationConfig, MergeChangesetsResult} from './deduplicator-types'
import * as core from '@actions/core'
import {analyzeSimilarity} from './changeset-comparator'

type MergeConfig = Pick<ChangesetDeduplicationConfig, 'maxMergeCount' | 'mergeStrategy'>

const RELEASE_PRIORITY: Record<ChangesetInfo['releases'][number]['type'], number> = {
  patch: 1,
  minor: 2,
  major: 3,
}

export async function performChangesetMerging(
  changesets: ChangesetInfo[],
  config: MergeConfig,
): Promise<MergeChangesetsResult> {
  const merged: ChangesetInfo[] = []
  const mergeOperations: MergeChangesetsResult['mergeOperations'] = []
  const processed = new Set<string>()

  for (const changeset of changesets) {
    if (processed.has(changeset.id)) {
      continue
    }

    const mergeCandidates: ChangesetInfo[] = [changeset]
    processed.add(changeset.id)

    for (const otherChangeset of changesets) {
      if (processed.has(otherChangeset.id) || mergeCandidates.length >= config.maxMergeCount) {
        continue
      }

      const similarity = analyzeSimilarity(changeset, otherChangeset, {
        mergeStrategy: config.mergeStrategy,
        semanticSimilarityThreshold: 0,
      })

      if (similarity.canMerge && similarity.mergeRisk !== 'high') {
        mergeCandidates.push(otherChangeset)
        processed.add(otherChangeset.id)
        core.info(`Merge candidate found: ${otherChangeset.id} (risk: ${similarity.mergeRisk})`)
      }
    }

    if (mergeCandidates.length === 1) {
      merged.push(changeset)
      continue
    }

    const mergedChangeset = await mergeChangesets(mergeCandidates)
    merged.push(mergedChangeset)
    mergeOperations.push({
      merged: mergedChangeset,
      sources: mergeCandidates,
    })
    core.info(`Merged ${mergeCandidates.length} changesets into: ${mergedChangeset.id}`)
  }

  return {merged, mergeOperations}
}

export async function mergeChangesets(changesets: ChangesetInfo[]): Promise<ChangesetInfo> {
  if (changesets.length === 0) {
    throw new Error('Cannot merge empty changeset array')
  }

  const firstChangeset = changesets[0]
  if (changesets.length === 1) {
    if (firstChangeset == null) {
      throw new Error('Invalid changeset in array')
    }

    return firstChangeset
  }

  const mergedId = `renovate-merged-${await getGitShortSha()}`
  const allPackages = new Set<string>()
  const allReleases = new Map<string, ChangesetInfo['releases'][number]>()
  const allRelationships = new Set<string>()
  const allDependencies = new Set<string>()
  const reasoning: string[] = []

  let isSecurityUpdate = false
  let hasBreakingChanges = false

  for (const changeset of changesets) {
    for (const pkg of changeset.packages) {
      allPackages.add(pkg)
    }

    for (const release of changeset.releases) {
      const existingRelease = allReleases.get(release.name)
      if (
        existingRelease == null ||
        RELEASE_PRIORITY[release.type] > RELEASE_PRIORITY[existingRelease.type]
      ) {
        allReleases.set(release.name, {...release})
      }
    }

    for (const relationship of changeset.relationships) {
      allRelationships.add(JSON.stringify(relationship))
    }

    for (const dependency of changeset.metadata.affectedDependencies) {
      allDependencies.add(dependency)
    }

    isSecurityUpdate ||= changeset.metadata.isSecurityUpdate
    hasBreakingChanges ||= changeset.metadata.hasBreakingChanges
    reasoning.push(...changeset.metadata.reasoning)
  }

  const packages = Array.from(allPackages).sort()
  const dependencies = Array.from(allDependencies).sort()
  const summary = createMergedSummary(changesets.length, packages, dependencies, {
    hasBreakingChanges,
    isSecurityUpdate,
  })

  return {
    id: mergedId,
    filename: `${mergedId}.md`,
    packages,
    summary,
    releases: Array.from(allReleases.values()),
    relationships: Array.from(allRelationships, relationship => JSON.parse(relationship)),
    metadata: {
      isGrouped: true,
      isSecurityUpdate,
      hasBreakingChanges,
      affectedDependencies: dependencies,
      reasoning: [
        `Merged changeset created from ${changesets.length} source changesets`,
        `Source changeset IDs: ${changesets.map(changeset => changeset.id).join(', ')}`,
        ...reasoning,
      ],
    },
  }
}

function createMergedSummary(
  sourceCount: number,
  packages: string[],
  dependencies: string[],
  flags: {hasBreakingChanges: boolean; isSecurityUpdate: boolean},
): string {
  let summary = ''
  if (flags.isSecurityUpdate) summary += '🔒 **Security Update**: '
  if (flags.hasBreakingChanges) summary += '⚠️ **Breaking Changes**: '
  summary +=
    packages.length === 1
      ? `Update dependencies for \`${packages[0]}\``
      : `Update dependencies across ${packages.length} packages`

  if (dependencies.length > 0) {
    summary +=
      dependencies.length <= 3
        ? `\n\n**Dependencies updated**: ${dependencies.map(dependency => `\`${dependency}\``).join(', ')}`
        : `\n\n**Dependencies updated**: ${dependencies
            .slice(0, 3)
            .map(dependency => `\`${dependency}\``)
            .join(', ')} and ${dependencies.length - 3} more`
  }

  summary += `\n\n**Merged changeset** combining ${sourceCount} related updates across affected packages.`
  if (packages.length > 1) {
    summary += `\n\n**Affected packages**: ${packages.map(pkg => `\`${pkg}\``).join(', ')}`
  }

  return summary
}

async function getGitShortSha(): Promise<string> {
  try {
    const {getExecOutput} = await import('@actions/exec')
    const {stdout} = await getExecOutput('git', ['rev-parse', '--short', 'HEAD'])
    return stdout.trim()
  } catch {
    return Math.random().toString(36).slice(2, 8)
  }
}
