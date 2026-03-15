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

export class SemverBumpTypeDecisionEngine {
  private config: SemverBumpDecisionConfig

  constructor(config: Partial<SemverBumpDecisionConfig> = {}) {
    this.config = mergeSemverBumpDecisionConfig(config)
  }

  decideBumpType(factors: DecisionFactors): SemverBumpDecision {
    const trace = createDecisionTrace()
    const bumpType = evaluateBumpRules(factors, this.config, trace)

    return aggregateBumpDecision(factors, bumpType, trace)
  }
}
