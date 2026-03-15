import type {DecisionTrace} from './bump-rule-trace'
import type {
  BumpType,
  DecisionFactors,
  SemverBumpDecisionConfig,
} from './semver-bump-decision-types'

import {getBumpTypeLevel, getMajorityGroupedBumpType} from './version-constraint-analyzer'

export function applyOrganizationRules(
  factors: DecisionFactors,
  config: SemverBumpDecisionConfig,
  currentDecision: BumpType,
  trace: DecisionTrace,
): BumpType {
  const orgRules = config.organizationRules
  trace.reasoningChain.push('Applying organization-specific rules')
  trace.influencingFactors.push('organization-rules')

  let result = currentDecision
  if (
    orgRules.conservativeMode &&
    result === 'major' &&
    orgRules.preferMinorForMajor &&
    !factors.semverImpact.isSecurityUpdate &&
    !factors.semverImpact.hasBreakingChanges
  ) {
    result = 'minor'
    trace.overriddenRules.push('Conservative mode: downgraded major to minor')
    trace.reasoningChain.push('Applied conservative major->minor downgrade')
  }

  for (const patternRule of orgRules.dependencyPatternRules) {
    const matchingDependencies = factors.semverImpact.dependencies.filter(dependency =>
      patternRule.pattern.test(dependency.name),
    )
    if (matchingDependencies.length === 0) {
      continue
    }

    trace.reasoningChain.push(
      `Pattern rule matched for ${matchingDependencies.length} dependencies: ${patternRule.pattern}`,
    )

    if (patternRule.forceBumpType != null) {
      result = patternRule.forceBumpType
      trace.overriddenRules.push(
        `Pattern rule forced bump type to ${patternRule.forceBumpType} for ${matchingDependencies.map(d => d.name).join(', ')}`,
      )
      break
    }

    if (
      patternRule.maxBumpType != null &&
      getBumpTypeLevel(result) > getBumpTypeLevel(patternRule.maxBumpType)
    ) {
      const originalResult = result
      result = patternRule.maxBumpType
      trace.overriddenRules.push(
        `Pattern rule restricted ${originalResult} to ${result} for ${matchingDependencies.map(d => d.name).join(', ')}`,
      )
    }
  }

  return result
}

export function applyRiskBasedAdjustments(
  factors: DecisionFactors,
  config: SemverBumpDecisionConfig,
  currentDecision: BumpType,
  trace: DecisionTrace,
): BumpType {
  const riskScore = factors.semverImpact.overallRiskScore ?? 0
  const riskTolerance = config.riskTolerance
  trace.reasoningChain.push(`Applying risk-based adjustments (risk score: ${riskScore})`)
  trace.influencingFactors.push('risk-assessment')

  if (riskScore >= riskTolerance.majorRiskThreshold && currentDecision !== 'major') {
    trace.reasoningChain.push(
      `High risk score (${riskScore}) forces major bump (threshold: ${riskTolerance.majorRiskThreshold})`,
    )
    return 'major'
  }

  if (currentDecision === 'patch' && riskScore > riskTolerance.patchMaxRisk) {
    trace.reasoningChain.push(
      `Risk score (${riskScore}) exceeds patch threshold (${riskTolerance.patchMaxRisk}), upgrading to minor`,
    )
    return 'minor'
  }

  if (currentDecision === 'minor' && riskScore > riskTolerance.minorMaxRisk) {
    trace.reasoningChain.push(
      `Risk score (${riskScore}) exceeds minor threshold (${riskTolerance.minorMaxRisk}), upgrading to major`,
    )
    return 'major'
  }

  return currentDecision
}

export function applyGroupedUpdateLogic(
  factors: DecisionFactors,
  config: SemverBumpDecisionConfig,
  currentDecision: BumpType,
  trace: DecisionTrace,
): BumpType {
  const groupedHandling = config.organizationRules.groupedUpdateHandling
  trace.reasoningChain.push(`Applying grouped update logic (strategy: ${groupedHandling})`)
  trace.influencingFactors.push('grouped-update')

  if (groupedHandling === 'highest') {
    trace.reasoningChain.push('Using highest impact strategy - no change needed')
    return currentDecision
  }

  if (groupedHandling === 'conservative' && currentDecision === 'major') {
    trace.reasoningChain.push('Conservative grouped update: considering major as minor')
    return 'minor'
  }

  if (groupedHandling === 'majority') {
    const majorityType = getMajorityGroupedBumpType(factors)
    const bumpCounts = {patch: 0, minor: 0, major: 0}
    for (const dependency of factors.semverImpact.dependencies) {
      bumpCounts[dependency.semverImpact] += 1
    }

    trace.reasoningChain.push(
      `Majority strategy: patch=${bumpCounts.patch}, minor=${bumpCounts.minor}, major=${bumpCounts.major}, majority=${majorityType}`,
    )
    return majorityType
  }

  return currentDecision
}
