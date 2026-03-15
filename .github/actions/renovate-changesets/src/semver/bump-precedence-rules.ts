import type {DecisionTrace} from './bump-rule-trace'
import type {
  BumpType,
  DecisionFactors,
  SemverBumpDecisionConfig,
} from './semver-bump-decision-types'

import {
  getBaseRecommendation,
  getBumpTypeLevel,
  getCriticalBreakingChangeCount,
  getHigherBumpType,
  getHighestSecuritySeverity,
} from './version-constraint-analyzer'

export function applySecurityPrecedence(
  factors: DecisionFactors,
  config: SemverBumpDecisionConfig,
  trace: DecisionTrace,
): BumpType {
  const baseRecommendation = getBaseRecommendation(factors)

  if (!config.securityTakesPrecedence || !factors.semverImpact.isSecurityUpdate) {
    return baseRecommendation
  }

  trace.reasoningChain.push('Applying security update precedence rules')
  trace.influencingFactors.push('security-precedence')

  const highestSeverity = getHighestSecuritySeverity(factors)
  const securityMinimumBump = config.securityMinimumBumps[highestSeverity]
  const result = getHigherBumpType(securityMinimumBump, baseRecommendation)

  trace.reasoningChain.push(
    `Security severity: ${highestSeverity}, minimum bump: ${securityMinimumBump}, result: ${result}`,
  )

  return result
}

export function applyBreakingChangeRules(
  factors: DecisionFactors,
  config: SemverBumpDecisionConfig,
  currentDecision: BumpType,
  trace: DecisionTrace,
): BumpType {
  if (!factors.semverImpact.hasBreakingChanges) {
    return currentDecision
  }

  trace.reasoningChain.push('Applying breaking change rules')
  trace.influencingFactors.push('breaking-changes')

  if (config.breakingChangesAlwaysMajor && currentDecision !== 'major') {
    trace.overriddenRules.push(`Overriding ${currentDecision} to major due to breaking changes`)
    trace.reasoningChain.push('Breaking changes detected - forcing major bump')
    return 'major'
  }

  const criticalBreakingChanges = getCriticalBreakingChangeCount(factors)
  if (criticalBreakingChanges === 0 || currentDecision === 'major') {
    return currentDecision
  }

  trace.overriddenRules.push('Overriding to major due to critical breaking changes')
  trace.reasoningChain.push(
    `${criticalBreakingChanges} critical breaking changes detected - forcing major bump`,
  )
  return 'major'
}

export function applyManagerSpecificRules(
  factors: DecisionFactors,
  config: SemverBumpDecisionConfig,
  currentDecision: BumpType,
  trace: DecisionTrace,
): BumpType {
  const managerRules = config.managerSpecificRules[factors.manager]
  if (managerRules == null) {
    return currentDecision
  }

  trace.reasoningChain.push(`Applying ${factors.manager} manager-specific rules`)
  trace.influencingFactors.push(`manager-rules-${factors.manager}`)

  let result = currentDecision
  if (managerRules.majorAsMinor && result === 'major') {
    result = 'minor'
    trace.overriddenRules.push(`Downgraded major to minor for ${factors.manager} manager`)
    trace.reasoningChain.push(`Major version treated as minor for ${factors.manager}`)
  }

  if (getBumpTypeLevel(result) > getBumpTypeLevel(managerRules.maxBumpType)) {
    const originalResult = result
    result = managerRules.maxBumpType
    trace.overriddenRules.push(
      `Restricted ${originalResult} to ${result} due to ${factors.manager} manager max bump type`,
    )
    trace.reasoningChain.push(`Restricted to max bump type ${result} for ${factors.manager}`)
  }

  if (
    managerRules.allowDowngrade &&
    result === currentDecision &&
    getBumpTypeLevel(managerRules.defaultBumpType) < getBumpTypeLevel(result)
  ) {
    const originalResult = result
    result = managerRules.defaultBumpType
    trace.overriddenRules.push(`Downgraded ${originalResult} to ${result} for ${factors.manager}`)
    trace.reasoningChain.push(`Used default bump type ${result} for ${factors.manager}`)
  }

  return result
}
