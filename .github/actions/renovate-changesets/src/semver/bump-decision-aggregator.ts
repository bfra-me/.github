import type {DecisionTrace} from './bump-rule-trace'
import type {
  BumpType,
  DecisionConfidence,
  DecisionFactors,
  SemverBumpDecision,
} from './semver-bump-decision-types'

export function aggregateBumpDecision(
  factors: DecisionFactors,
  bumpType: BumpType,
  trace: DecisionTrace,
): SemverBumpDecision {
  const confidence = calculateConfidence(factors, trace.overriddenRules)
  trace.reasoningChain.push(`Final decision: ${bumpType} (confidence: ${confidence})`)

  return {
    bumpType,
    confidence,
    primaryReason: generatePrimaryReason(bumpType, factors),
    influencingFactors: trace.influencingFactors,
    reasoningChain: trace.reasoningChain,
    overriddenRules: trace.overriddenRules,
    riskAssessment: calculateRiskAssessment(factors, bumpType),
    alternatives: generateAlternatives(factors, bumpType),
  }
}

function calculateConfidence(
  factors: DecisionFactors,
  overriddenRules: string[],
): DecisionConfidence {
  let confidence: DecisionConfidence = 'high'

  if (overriddenRules.length > 2) {
    confidence = 'medium'
  }

  if (factors.semverImpact.confidence === 'low') {
    confidence = 'low'
  }

  if (factors.isGroupedUpdate && factors.dependencyCount > 5) {
    confidence = confidence === 'high' ? 'medium' : 'low'
  }

  if (factors.semverImpact.isSecurityUpdate && confidence !== 'low') {
    confidence = 'high'
  }

  return confidence
}

function calculateRiskAssessment(
  factors: DecisionFactors,
  decision: BumpType,
): SemverBumpDecision['riskAssessment'] {
  const riskFactors: string[] = []
  let riskScore = factors.semverImpact.overallRiskScore ?? 0

  if (decision === 'patch') {
    riskScore *= 0.8
  } else if (decision === 'major') {
    riskScore *= 1.2
  }

  if (factors.semverImpact.hasBreakingChanges) {
    riskFactors.push('breaking changes detected')
    riskScore += 10
  }

  if (factors.semverImpact.isSecurityUpdate) {
    riskFactors.push('security update')
    riskScore += 5
  }

  if (factors.isGroupedUpdate) {
    riskFactors.push('grouped update')
    riskScore += factors.dependencyCount * 2
  }

  const level =
    riskScore < 20 ? 'low' : riskScore < 50 ? 'medium' : riskScore < 80 ? 'high' : 'critical'

  return {
    level,
    score: Math.min(100, riskScore),
    factors: riskFactors,
  }
}

function generatePrimaryReason(decision: BumpType, factors: DecisionFactors): string {
  if (factors.semverImpact.isSecurityUpdate) {
    return `${decision} bump for security update affecting ${factors.dependencyCount} dependencies`
  }

  if (factors.semverImpact.hasBreakingChanges) {
    return `${decision} bump due to breaking changes in ${factors.dependencyCount} dependencies`
  }

  if (factors.isGroupedUpdate) {
    return `${decision} bump for grouped update of ${factors.dependencyCount} dependencies`
  }

  return `${decision} bump based on semantic versioning analysis of ${factors.dependencyCount} dependencies`
}

function generateAlternatives(
  factors: DecisionFactors,
  finalDecision: BumpType,
): SemverBumpDecision['alternatives'] {
  const alternatives: SemverBumpDecision['alternatives'] = []
  const semverRecommendation = factors.semverImpact.recommendedChangesetType
  const categorizationRecommendation = factors.categorization.recommendedChangesetType

  if (semverRecommendation !== finalDecision) {
    alternatives.push({
      bumpType: semverRecommendation,
      reason: 'Semver impact assessment recommendation',
      confidence: factors.semverImpact.confidence === 'high' ? 0.8 : 0.6,
    })
  }

  if (categorizationRecommendation != null && categorizationRecommendation !== finalDecision) {
    alternatives.push({
      bumpType: categorizationRecommendation,
      reason: 'Change categorization recommendation',
      confidence: factors.categorization.confidence === 'high' ? 0.8 : 0.6,
    })
  }

  return alternatives
}
