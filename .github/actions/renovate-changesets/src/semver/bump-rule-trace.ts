export interface DecisionTrace {
  reasoningChain: string[]
  influencingFactors: string[]
  overriddenRules: string[]
}

export function createDecisionTrace(): DecisionTrace {
  return {
    reasoningChain: ['Starting semver bump type decision analysis'],
    influencingFactors: [],
    overriddenRules: [],
  }
}
