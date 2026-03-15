import type {ChangesetInfo} from '../multi-package-changeset-generator'

export function validateDeduplicationResult(
  deduplicatedChangesets: ChangesetInfo[],
  originalChangesets: ChangesetInfo[],
  warnings: string[],
): void {
  const reductionRatio = 1 - deduplicatedChangesets.length / originalChangesets.length
  if (reductionRatio > 0.8) {
    warnings.push(
      `High deduplication ratio (${(reductionRatio * 100).toFixed(1)}%) - verify results are correct`,
    )
  }

  const originalPackages = new Set(originalChangesets.flatMap(changeset => changeset.packages))
  const finalPackages = new Set(deduplicatedChangesets.flatMap(changeset => changeset.packages))
  for (const pkg of originalPackages) {
    if (!finalPackages.has(pkg)) {
      warnings.push(
        `Package '${pkg}' was present in original changesets but missing in final result`,
      )
    }
  }

  const packageReleases = new Map<string, Set<string>>()
  for (const changeset of deduplicatedChangesets) {
    for (const release of changeset.releases) {
      const packageTypes = packageReleases.get(release.name) ?? new Set<string>()
      packageTypes.add(release.type)
      packageReleases.set(release.name, packageTypes)
    }
  }

  for (const [pkg, types] of packageReleases.entries()) {
    if (types.size > 1) {
      warnings.push(
        `Package '${pkg}' has conflicting release types: ${Array.from(types).join(', ')}`,
      )
    }
  }
}
