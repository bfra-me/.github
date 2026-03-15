import type {BumpType, DecisionFactors, SecuritySeverity} from './semver-bump-decision-types'

const bumpTypeLevels: Record<BumpType, number> = {patch: 1, minor: 2, major: 3}
const securitySeverityLevels: Record<SecuritySeverity, number> = {
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
}

export function getBaseRecommendation(factors: DecisionFactors): BumpType {
  const semverRecommendation = factors.semverImpact.recommendedChangesetType
  const categorizationRecommendation = factors.categorization.recommendedChangesetType

  if (categorizationRecommendation == null) {
    return semverRecommendation
  }

  if (factors.categorization.confidence === 'high') {
    return categorizationRecommendation
  }

  return getHigherBumpType(semverRecommendation, categorizationRecommendation)
}

export function getHighestSecuritySeverity(factors: DecisionFactors): SecuritySeverity {
  let highestSeverity: SecuritySeverity = 'low'

  for (const dependency of factors.semverImpact.dependencies) {
    if (!dependency.isSecurityUpdate || dependency.securitySeverity == null) {
      continue
    }

    if (
      getSecuritySeverityLevel(dependency.securitySeverity) >
      getSecuritySeverityLevel(highestSeverity)
    ) {
      highestSeverity = dependency.securitySeverity
    }
  }

  return highestSeverity
}

export function getCriticalBreakingChangeCount(factors: DecisionFactors): number {
  return (
    factors.breakingChangeAnalyses?.filter(analysis =>
      analysis.indicators.some(indicator => indicator.severity === 'critical'),
    ).length ?? 0
  )
}

export function getMajorityGroupedBumpType(factors: DecisionFactors): BumpType {
  const bumpCounts: Record<BumpType, number> = {patch: 0, minor: 0, major: 0}

  for (const dependency of factors.semverImpact.dependencies) {
    bumpCounts[dependency.semverImpact] += 1
  }

  return Object.entries(bumpCounts).reduce((currentMajority, nextEntry) =>
    bumpCounts[currentMajority[0] as BumpType] > bumpCounts[nextEntry[0] as BumpType]
      ? currentMajority
      : nextEntry,
  )[0] as BumpType
}

export function getBumpTypeLevel(bumpType: BumpType): number {
  return bumpTypeLevels[bumpType]
}

export function getHigherBumpType(a: BumpType, b: BumpType): BumpType {
  return getBumpTypeLevel(a) > getBumpTypeLevel(b) ? a : b
}

export function getSecuritySeverityLevel(severity: SecuritySeverity): number {
  return securitySeverityLevels[severity]
}
