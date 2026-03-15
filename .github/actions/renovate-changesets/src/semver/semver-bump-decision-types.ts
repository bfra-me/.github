import type {BreakingChangeAnalysis} from '../breaking-change-detector'
import type {CategorizationResult} from '../change-categorization-engine'
import type {RenovatePRContext} from '../renovate-parser'
import type {SecurityAnalysis} from '../security-vulnerability-detector'
import type {ImpactAssessment} from '../semver-impact-assessor'

export type BumpType = 'patch' | 'minor' | 'major'
export type DecisionConfidence = 'high' | 'medium' | 'low'
export type SecuritySeverity = 'low' | 'moderate' | 'high' | 'critical'
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface SemverBumpDecisionConfig {
  defaultBumpType: BumpType
  securityTakesPrecedence: boolean
  breakingChangesAlwaysMajor: boolean
  securityMinimumBumps: Record<SecuritySeverity, BumpType>
  managerSpecificRules: Record<
    string,
    {
      allowDowngrade: boolean
      maxBumpType: BumpType
      defaultBumpType: BumpType
      majorAsMinor: boolean
    }
  >
  riskTolerance: {
    patchMaxRisk: number
    minorMaxRisk: number
    majorRiskThreshold: number
  }
  organizationRules: {
    conservativeMode: boolean
    preferMinorForMajor: boolean
    groupedUpdateHandling: 'highest' | 'conservative' | 'majority'
    dependencyPatternRules: {
      pattern: RegExp
      forceBumpType?: BumpType
      maxBumpType?: BumpType
    }[]
  }
}

export interface DecisionFactors {
  semverImpact: ImpactAssessment
  categorization: CategorizationResult
  renovateContext: RenovatePRContext
  breakingChangeAnalyses?: BreakingChangeAnalysis[]
  securityAnalyses?: SecurityAnalysis[]
  manager: string
  isGroupedUpdate: boolean
  dependencyCount: number
}

export interface SemverBumpDecision {
  bumpType: BumpType
  confidence: DecisionConfidence
  primaryReason: string
  influencingFactors: string[]
  reasoningChain: string[]
  overriddenRules: string[]
  riskAssessment: {
    level: RiskLevel
    score: number
    factors: string[]
  }
  alternatives: {
    bumpType: BumpType
    reason: string
    confidence: number
  }[]
}
