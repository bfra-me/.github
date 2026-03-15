import type {DecisionTrace} from './bump-rule-trace'
import type {
  BumpType,
  DecisionFactors,
  SemverBumpDecisionConfig,
} from './semver-bump-decision-types'

import {
  applyGroupedUpdateLogic,
  applyOrganizationRules,
  applyRiskBasedAdjustments,
} from './bump-adjustment-rules'
import {
  applyBreakingChangeRules,
  applyManagerSpecificRules,
  applySecurityPrecedence,
} from './bump-precedence-rules'

export function evaluateBumpRules(
  factors: DecisionFactors,
  config: SemverBumpDecisionConfig,
  trace: DecisionTrace,
): BumpType {
  const semverRecommendation = factors.semverImpact.recommendedChangesetType
  const categorizationRecommendation = factors.categorization.recommendedChangesetType
  trace.reasoningChain.push(
    `Base recommendations: semver=${semverRecommendation}, categorization=${categorizationRecommendation ?? 'none'}`,
  )

  let currentDecision = applySecurityPrecedence(factors, config, trace)
  currentDecision = applyBreakingChangeRules(factors, config, currentDecision, trace)
  currentDecision = applyManagerSpecificRules(factors, config, currentDecision, trace)
  currentDecision = applyOrganizationRules(factors, config, currentDecision, trace)
  currentDecision = applyRiskBasedAdjustments(factors, config, currentDecision, trace)

  if (factors.isGroupedUpdate) {
    currentDecision = applyGroupedUpdateLogic(factors, config, currentDecision, trace)
  }

  return currentDecision
}
