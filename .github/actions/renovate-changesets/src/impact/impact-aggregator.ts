import type {RenovateDependency} from '../renovate-parser'
import type {
  DependencyImpact,
  ImpactAssessment,
  ImpactAssessmentOptions,
  SemverInfo,
  VersionChange,
} from './impact-types'

export function determineConfidence(
  currentVersion: SemverInfo,
  newVersion: SemverInfo,
  dependency: RenovateDependency,
  versionChange: VersionChange,
): 'high' | 'medium' | 'low' {
  let confidence: 'high' | 'medium' | 'low' = 'high'

  if (!currentVersion.isValid || !newVersion.isValid) {
    confidence = 'low'
  }

  if (versionChange === 'unknown') {
    confidence = 'low'
  }

  if (currentVersion.major === 0 || newVersion.major === 0) {
    confidence = confidence === 'high' ? 'medium' : 'low'
  }

  if (currentVersion.prerelease || newVersion.prerelease) {
    confidence = confidence === 'high' ? 'medium' : 'low'
  }

  if (dependency.isSecurityUpdate) {
    confidence = confidence === 'low' ? 'medium' : 'high'
  }

  return confidence
}

export function buildReasoning(
  dependency: RenovateDependency,
  currentVersion: SemverInfo,
  newVersion: SemverInfo,
  versionChange: VersionChange,
  semverImpact: 'major' | 'minor' | 'patch',
  isBreaking: boolean,
  isDowngrade: boolean,
  isPrerelease: boolean,
): string[] {
  const reasoning: string[] = []

  if (versionChange === 'major') {
    reasoning.push(`Major version update from ${currentVersion.raw} to ${newVersion.raw}`)
  } else if (versionChange === 'minor') {
    reasoning.push(`Minor version update from ${currentVersion.raw} to ${newVersion.raw}`)
  } else if (versionChange === 'patch') {
    reasoning.push(`Patch version update from ${currentVersion.raw} to ${newVersion.raw}`)
  } else if (versionChange === 'prerelease') {
    reasoning.push(`Prerelease version change from ${currentVersion.raw} to ${newVersion.raw}`)
  } else if (versionChange === 'unknown') {
    reasoning.push(`Unable to parse version change from ${currentVersion.raw} to ${newVersion.raw}`)
  }

  if (dependency.isSecurityUpdate) {
    const severity = dependency.securitySeverity || 'unknown'
    reasoning.push(`Security update with ${severity} severity`)
  }

  if (isBreaking) {
    reasoning.push('Potentially breaking change detected')
    if (currentVersion.major === 0) {
      reasoning.push('0.x.x version - minor updates may introduce breaking changes')
    }
  }

  if (isDowngrade) {
    reasoning.push('Version downgrade detected - requires careful review')
  }

  if (isPrerelease) {
    reasoning.push('Involves prerelease versions - may be unstable')
  }

  reasoning.push(`Assessed as ${semverImpact} level change for changeset`)

  return reasoning
}

export function calculateOverallImpact(
  dependencyImpacts: DependencyImpact[],
  options: ImpactAssessmentOptions,
): ImpactAssessment {
  if (dependencyImpacts.length === 0) {
    return {
      dependencies: [],
      overallImpact: options.defaultChangesetType,
      recommendedChangesetType: options.defaultChangesetType,
      isSecurityUpdate: false,
      hasBreakingChanges: false,
      hasDowngrades: false,
      hasPreleases: false,
      confidence: 'high',
      reasoning: ['No dependencies to assess'],
      totalVulnerabilities: 0,
      highSeverityVulnerabilities: 0,
      criticalBreakingChanges: 0,
      overallRiskScore: 0,
    }
  }

  const impactLevels = ['patch', 'minor', 'major'] as const
  let maxImpactLevel = 0
  for (const dep of dependencyImpacts) {
    const level = impactLevels.indexOf(dep.semverImpact)
    if (level > maxImpactLevel) {
      maxImpactLevel = level
    }
  }

  const overallImpact = impactLevels[maxImpactLevel] || options.defaultChangesetType
  const isSecurityUpdate = dependencyImpacts.some(dep => dep.isSecurityUpdate)
  const hasBreakingChanges = dependencyImpacts.some(dep => dep.isBreaking)
  const hasDowngrades = dependencyImpacts.some(dep => dep.isDowngrade)
  const hasPreleases = dependencyImpacts.some(dep => dep.isPrerelease)

  const confidenceLevels = ['high', 'medium', 'low'] as const
  let minConfidenceLevel = 0
  for (const dep of dependencyImpacts) {
    const level = confidenceLevels.indexOf(dep.confidence)
    if (level > minConfidenceLevel) {
      minConfidenceLevel = level
    }
  }
  const confidence = confidenceLevels[minConfidenceLevel] || 'medium'

  const reasoning: string[] = [`Assessed ${dependencyImpacts.length} dependencies`]
  if (isSecurityUpdate) {
    reasoning.push(
      `${dependencyImpacts.filter(dep => dep.isSecurityUpdate).length} security update(s) detected`,
    )
  }
  if (hasBreakingChanges) {
    reasoning.push(
      `${dependencyImpacts.filter(dep => dep.isBreaking).length} potentially breaking change(s)`,
    )
  }
  reasoning.push(`Overall impact: ${overallImpact}`)

  const totalVulnerabilities = dependencyImpacts.reduce(
    (sum, dep) => sum + (dep.securityAnalysis?.vulnerabilities.length || 0),
    0,
  )
  const highSeverityVulnerabilities = dependencyImpacts.reduce(
    (sum, dep) =>
      sum +
      (dep.securityAnalysis?.vulnerabilities.filter(
        v => v.severity === 'high' || v.severity === 'critical',
      ).length || 0),
    0,
  )
  const criticalBreakingChanges = dependencyImpacts.reduce(
    (sum, dep) =>
      sum +
      (dep.breakingChangeAnalysis?.indicators.filter(i => i.severity === 'critical').length || 0),
    0,
  )
  const overallRiskScore = Math.min(
    100,
    dependencyImpacts.reduce(
      (sum, dep) =>
        sum +
        (dep.securityAnalysis?.riskScore || 0) +
        (dep.breakingChangeAnalysis?.indicators.length || 0) * 10,
      0,
    ) / dependencyImpacts.length,
  )

  return {
    dependencies: dependencyImpacts,
    overallImpact,
    recommendedChangesetType: overallImpact,
    isSecurityUpdate,
    hasBreakingChanges,
    hasDowngrades,
    hasPreleases,
    confidence,
    reasoning,
    totalVulnerabilities,
    highSeverityVulnerabilities,
    criticalBreakingChanges,
    overallRiskScore,
  }
}
