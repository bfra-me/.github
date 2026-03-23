import type {
  DecisionFactors,
  SemverBumpDecision,
  SemverBumpDecisionConfig,
} from './semver/semver-bump-decision-types'

import {aggregateBumpDecision} from './semver/bump-decision-aggregator'
import {evaluateBumpRules} from './semver/bump-rule-evaluator'
import {createDecisionTrace} from './semver/bump-rule-trace'
import {mergeSemverBumpDecisionConfig} from './semver/semver-bump-decision-config'

export type {
  BumpType,
  DecisionConfidence,
  DecisionFactors,
  RiskLevel,
  SecuritySeverity,
  SemverBumpDecision,
  SemverBumpDecisionConfig,
} from './semver/semver-bump-decision-types'

export function decideBumpType(
  factors: DecisionFactors,
  config: Partial<SemverBumpDecisionConfig> = {},
): SemverBumpDecision {
  const mergedConfig = mergeSemverBumpDecisionConfig(config)
  const trace = createDecisionTrace()
  const bumpType = evaluateBumpRules(factors, mergedConfig, trace)

  return aggregateBumpDecision(factors, bumpType, trace)
}
