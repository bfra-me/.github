import type {RenovateDependency} from '../renovate-parser'
import type {DependencyImpact, ImpactAssessment} from '../semver-impact-assessor'

export type ChangeCategory = 'major' | 'minor' | 'patch' | 'security'

export interface CategorizedDependency {
  dependency: RenovateDependency
  impact: DependencyImpact
  category: ChangeCategory
  secondaryCategories: ChangeCategory[]
  confidence: 'high' | 'medium' | 'low'
  reasoning: string[]
  isHighPriority: boolean
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
}

export interface CategorizationResult {
  dependencies: CategorizedDependency[]
  primaryCategory: ChangeCategory
  allCategories: ChangeCategory[]
  categorizedGroups: {
    major: CategorizedDependency[]
    minor: CategorizedDependency[]
    patch: CategorizedDependency[]
    security: CategorizedDependency[]
  }
  summary: {
    totalDependencies: number
    majorUpdates: number
    minorUpdates: number
    patchUpdates: number
    securityUpdates: number
    breakingChanges: number
    highPriorityUpdates: number
    averageRiskLevel: number
  }
  confidence: 'high' | 'medium' | 'low'
  reasoning: string[]
  recommendedChangesetType: 'major' | 'minor' | 'patch'
}

export interface CategorizationOptions {
  securityFirst: boolean
  majorAsHighPriority: boolean
  prereleaseAsLowerPriority: boolean
  managerCategoryRules?: {
    [manager: string]: {
      categoryOverrides?: {
        major?: ChangeCategory
        minor?: ChangeCategory
        patch?: ChangeCategory
      }
      riskAdjustment?: number
    }
  }
}

export type DependencyImpactAssessment = ImpactAssessment
