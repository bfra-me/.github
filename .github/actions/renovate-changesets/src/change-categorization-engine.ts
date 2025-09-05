import type {RenovateDependency} from './renovate-parser'
import type {DependencyImpact, ImpactAssessment} from './semver-impact-assessor'

/**
 * Change category types for classification
 */
export type ChangeCategory = 'major' | 'minor' | 'patch' | 'security'

/**
 * Categorized dependency with classification details
 */
export interface CategorizedDependency {
  /** Dependency information */
  dependency: RenovateDependency
  /** Impact assessment for this dependency */
  impact: DependencyImpact
  /** Primary category for this change */
  category: ChangeCategory
  /** Secondary categories that also apply */
  secondaryCategories: ChangeCategory[]
  /** Confidence in categorization */
  confidence: 'high' | 'medium' | 'low'
  /** Reasoning for categorization */
  reasoning: string[]
  /** Whether this is a high-priority update */
  isHighPriority: boolean
  /** Risk level of this update */
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
}

/**
 * Overall categorization result
 */
export interface CategorizationResult {
  /** All categorized dependencies */
  dependencies: CategorizedDependency[]
  /** Primary category for the overall changeset */
  primaryCategory: ChangeCategory
  /** All categories present in this update */
  allCategories: ChangeCategory[]
  /** Dependencies grouped by category */
  categorizedGroups: {
    major: CategorizedDependency[]
    minor: CategorizedDependency[]
    patch: CategorizedDependency[]
    security: CategorizedDependency[]
  }
  /** Summary statistics */
  summary: {
    totalDependencies: number
    majorUpdates: number
    minorUpdates: number
    patchUpdates: number
    securityUpdates: number
    breakingChanges: number
    highPriorityUpdates: number
    averageRiskLevel: number // 0-100 scale
  }
  /** Overall confidence in categorization */
  confidence: 'high' | 'medium' | 'low'
  /** Categorization reasoning */
  reasoning: string[]
  /** Recommended changeset type based on categorization */
  recommendedChangesetType: 'major' | 'minor' | 'patch'
}

/**
 * Configuration for categorization engine
 */
export interface CategorizationOptions {
  /** Prioritize security updates regardless of version impact */
  securityFirst: boolean
  /** Consider major version updates as high priority */
  majorAsHighPriority: boolean
  /** Consider pre-release versions as lower priority */
  prereleaseAsLowerPriority: boolean
  /** Custom category rules for specific package managers */
  managerCategoryRules?: {
    [manager: string]: {
      /** Override category for specific update types */
      categoryOverrides?: {
        major?: ChangeCategory
        minor?: ChangeCategory
        patch?: ChangeCategory
      }
      /** Risk adjustment factor (0.5 = lower risk, 2.0 = higher risk) */
      riskAdjustment?: number
    }
  }
}

/**
 * TASK-020: Change Categorization Engine
 *
 * This class categorizes dependency updates by type (major, minor, patch, security)
 * building on the sophisticated impact assessment. It provides detailed categorization
 * with confidence levels, risk assessment, and priority classification.
 *
 * The categorization follows these principles:
 * 1. Security updates take precedence regardless of version impact
 * 2. Breaking changes are prioritized for visibility
 * 3. Version impact (major/minor/patch) guides base categorization
 * 4. Package manager context influences risk assessment
 * 5. Multiple categories can apply to a single dependency
 */
export class ChangeCategorizationEngine {
  private options: CategorizationOptions

  constructor(options: Partial<CategorizationOptions> = {}) {
    this.options = {
      securityFirst: true,
      majorAsHighPriority: true,
      prereleaseAsLowerPriority: true,
      ...options,
    }
  }

  /**
   * Categorize all dependencies from an impact assessment
   */
  categorizeChanges(
    dependencies: RenovateDependency[],
    impactAssessment: ImpactAssessment,
  ): CategorizationResult {
    const categorizedDependencies = this.categorizeDependencies(dependencies, impactAssessment)

    return this.calculateOverallCategorization(categorizedDependencies, impactAssessment)
  }

  /**
   * Categorize individual dependencies
   */
  private categorizeDependencies(
    dependencies: RenovateDependency[],
    impactAssessment: ImpactAssessment,
  ): CategorizedDependency[] {
    return dependencies.map(dependency => {
      const impact = impactAssessment.dependencies.find(dep => dep.name === dependency.name)
      if (!impact) {
        throw new Error(`No impact assessment found for dependency: ${dependency.name}`)
      }

      return this.categorizeSingleDependency(dependency, impact)
    })
  }

  /**
   * Categorize a single dependency
   */
  private categorizeSingleDependency(
    dependency: RenovateDependency,
    impact: DependencyImpact,
  ): CategorizedDependency {
    const categories: ChangeCategory[] = []
    const reasoning: string[] = []
    let primaryCategory: ChangeCategory
    let confidence: 'high' | 'medium' | 'low' = impact.confidence
    let isHighPriority = false
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'

    // Security categorization takes precedence
    if (impact.isSecurityUpdate) {
      categories.push('security')
      primaryCategory = 'security'
      isHighPriority = true
      reasoning.push('Security update detected')

      // Determine risk level based on security severity
      switch (impact.securitySeverity) {
        case 'critical': {
          riskLevel = 'critical'
          reasoning.push('Critical security vulnerability')
          break
        }
        case 'high': {
          riskLevel = 'high'
          reasoning.push('High severity security vulnerability')
          break
        }
        case 'moderate': {
          riskLevel = 'medium'
          reasoning.push('Moderate security vulnerability')
          break
        }
        case 'low': {
          riskLevel = 'low'
          reasoning.push('Low severity security vulnerability')
          break
        }
        default: {
          riskLevel = 'medium'
          reasoning.push('Security vulnerability with unknown severity')
        }
      }
    } else {
      // Non-security categorization based on semver impact
      primaryCategory = impact.semverImpact
      categories.push(impact.semverImpact)

      switch (impact.semverImpact) {
        case 'major': {
          reasoning.push('Major version update')
          if (this.options.majorAsHighPriority) {
            isHighPriority = true
            reasoning.push('Major updates are high priority')
          }
          riskLevel = impact.isBreaking ? 'high' : 'medium'
          break
        }
        case 'minor': {
          reasoning.push('Minor version update')
          riskLevel = 'low'
          break
        }
        case 'patch': {
          reasoning.push('Patch version update')
          riskLevel = 'low'
          break
        }
      }
    }

    // Additional categorization factors
    if (impact.isBreaking) {
      if (!categories.includes('major')) {
        categories.push('major')
      }
      reasoning.push('Breaking changes detected')
      isHighPriority = true
      riskLevel = this.elevateRiskLevel(riskLevel, 'high')
    }

    if (impact.isDowngrade) {
      reasoning.push('Version downgrade detected')
      confidence = this.lowerConfidence(confidence)
      riskLevel = this.elevateRiskLevel(riskLevel, 'medium')
    }

    if (impact.isPrerelease && this.options.prereleaseAsLowerPriority) {
      reasoning.push('Pre-release version')
      isHighPriority = false
      riskLevel = this.lowerRiskLevel(riskLevel)
    }

    // Apply manager-specific rules
    const managerRules = this.options.managerCategoryRules?.[dependency.manager]
    if (managerRules) {
      const categoryOverride = managerRules.categoryOverrides?.[impact.semverImpact]
      if (categoryOverride && !impact.isSecurityUpdate) {
        primaryCategory = categoryOverride
        reasoning.push(
          `Manager-specific override: ${dependency.manager} ${impact.semverImpact} → ${categoryOverride}`,
        )
      }

      if (managerRules.riskAdjustment) {
        riskLevel = this.adjustRiskLevel(riskLevel, managerRules.riskAdjustment)
        reasoning.push(`Risk adjusted for ${dependency.manager} manager`)
      }
    }

    // Determine secondary categories (all categories except primary)
    const secondaryCategories = categories.filter(cat => cat !== primaryCategory)

    return {
      dependency,
      impact,
      category: primaryCategory,
      secondaryCategories,
      confidence,
      reasoning,
      isHighPriority,
      riskLevel,
    }
  }

  /**
   * Calculate overall categorization from individual dependencies
   */
  private calculateOverallCategorization(
    dependencies: CategorizedDependency[],
    impactAssessment: ImpactAssessment,
  ): CategorizationResult {
    // Group by category
    const categorizedGroups = {
      major: dependencies.filter(dep => dep.category === 'major'),
      minor: dependencies.filter(dep => dep.category === 'minor'),
      patch: dependencies.filter(dep => dep.category === 'patch'),
      security: dependencies.filter(dep => dep.category === 'security'),
    }

    // Determine all categories present
    const allCategories: ChangeCategory[] = []
    if (categorizedGroups.security.length > 0) allCategories.push('security')
    if (categorizedGroups.major.length > 0) allCategories.push('major')
    if (categorizedGroups.minor.length > 0) allCategories.push('minor')
    if (categorizedGroups.patch.length > 0) allCategories.push('patch')

    // Determine primary category using hierarchy: security > major > minor > patch
    let primaryCategory: ChangeCategory = 'patch'
    if (allCategories.includes('security')) {
      primaryCategory = 'security'
    } else if (allCategories.includes('major')) {
      primaryCategory = 'major'
    } else if (allCategories.includes('minor')) {
      primaryCategory = 'minor'
    }

    // Calculate summary statistics
    const summary = {
      totalDependencies: dependencies.length,
      majorUpdates: categorizedGroups.major.length,
      minorUpdates: categorizedGroups.minor.length,
      patchUpdates: categorizedGroups.patch.length,
      securityUpdates: categorizedGroups.security.length,
      breakingChanges: dependencies.filter(dep => dep.impact.isBreaking).length,
      highPriorityUpdates: dependencies.filter(dep => dep.isHighPriority).length,
      averageRiskLevel: this.calculateAverageRiskLevel(dependencies),
    }

    // Determine overall confidence
    const confidenceLevels = dependencies.map(dep => dep.confidence)
    const confidence = this.calculateOverallConfidence(confidenceLevels)

    // Build categorization reasoning
    const reasoning: string[] = []
    if (categorizedGroups.security.length > 0) {
      reasoning.push(`${categorizedGroups.security.length} security update(s) found`)
    }
    if (categorizedGroups.major.length > 0) {
      reasoning.push(`${categorizedGroups.major.length} major update(s) found`)
    }
    if (categorizedGroups.minor.length > 0) {
      reasoning.push(`${categorizedGroups.minor.length} minor update(s) found`)
    }
    if (categorizedGroups.patch.length > 0) {
      reasoning.push(`${categorizedGroups.patch.length} patch update(s) found`)
    }

    if (summary.breakingChanges > 0) {
      reasoning.push(`${summary.breakingChanges} dependency/ies with breaking changes`)
    }

    if (summary.highPriorityUpdates > 0) {
      reasoning.push(`${summary.highPriorityUpdates} high-priority update(s)`)
    }

    reasoning.push(`Primary category: ${primaryCategory}`)

    // Determine recommended changeset type based on categorization and impact assessment
    const recommendedChangesetType = this.determineRecommendedChangesetType(
      primaryCategory,
      impactAssessment,
      summary,
    )

    return {
      dependencies,
      primaryCategory,
      allCategories,
      categorizedGroups,
      summary,
      confidence,
      reasoning,
      recommendedChangesetType,
    }
  }

  /**
   * Helper methods for risk and confidence adjustments
   */
  private elevateRiskLevel(
    current: 'low' | 'medium' | 'high' | 'critical',
    target: 'medium' | 'high' | 'critical',
  ): 'low' | 'medium' | 'high' | 'critical' {
    const levels = ['low', 'medium', 'high', 'critical']
    const currentIndex = levels.indexOf(current)
    const targetIndex = levels.indexOf(target)
    return levels[Math.max(currentIndex, targetIndex)] as typeof current
  }

  private lowerRiskLevel(
    current: 'low' | 'medium' | 'high' | 'critical',
  ): 'low' | 'medium' | 'high' | 'critical' {
    const levels = ['low', 'medium', 'high', 'critical']
    const currentIndex = levels.indexOf(current)
    return levels[Math.max(0, currentIndex - 1)] as typeof current
  }

  private adjustRiskLevel(
    current: 'low' | 'medium' | 'high' | 'critical',
    factor: number,
  ): 'low' | 'medium' | 'high' | 'critical' {
    const levels = ['low', 'medium', 'high', 'critical']
    const currentIndex = levels.indexOf(current)

    // For factors > 1, we want to increase risk level
    // For factors < 1, we want to decrease risk level
    let adjustedIndex: number
    if (factor > 1) {
      // Increase risk: add one step for factor = 2
      adjustedIndex = currentIndex + Math.round(factor - 1)
    } else if (factor < 1) {
      // Decrease risk: subtract steps based on factor
      adjustedIndex = currentIndex - Math.round((1 - factor) * 2)
    } else {
      // factor = 1, no change
      adjustedIndex = currentIndex
    }

    return levels[Math.max(0, Math.min(3, adjustedIndex))] as typeof current
  }

  private lowerConfidence(current: 'high' | 'medium' | 'low'): 'high' | 'medium' | 'low' {
    const levels = ['high', 'medium', 'low']
    const currentIndex = levels.indexOf(current)
    return levels[Math.min(2, currentIndex + 1)] as typeof current
  }

  private calculateAverageRiskLevel(dependencies: CategorizedDependency[]): number {
    if (dependencies.length === 0) return 0

    const riskValues = {
      low: 25,
      medium: 50,
      high: 75,
      critical: 100,
    }

    const totalRisk = dependencies.reduce((sum, dep) => sum + riskValues[dep.riskLevel], 0)
    return Math.round(totalRisk / dependencies.length)
  }

  private calculateOverallConfidence(
    confidenceLevels: ('high' | 'medium' | 'low')[],
  ): 'high' | 'medium' | 'low' {
    if (confidenceLevels.length === 0) return 'low'

    const confidenceValues = {high: 3, medium: 2, low: 1}
    const totalConfidence = confidenceLevels.reduce(
      (sum, level) => sum + confidenceValues[level],
      0,
    )
    const averageConfidence = totalConfidence / confidenceLevels.length

    if (averageConfidence >= 2.5) return 'high'
    if (averageConfidence >= 1.5) return 'medium'
    return 'low'
  }

  private determineRecommendedChangesetType(
    primaryCategory: ChangeCategory,
    impactAssessment: ImpactAssessment,
    summary: CategorizationResult['summary'],
  ): 'major' | 'minor' | 'patch' {
    // Security updates with high/critical severity should be at least minor
    if (primaryCategory === 'security') {
      if (summary.averageRiskLevel >= 75) {
        return 'minor' // High/critical security issues
      }
      return 'patch' // Lower severity security issues
    }

    // Breaking changes warrant major version
    if (impactAssessment.hasBreakingChanges) {
      return 'major'
    }

    // Use impact assessment recommendation as fallback
    return impactAssessment.recommendedChangesetType
  }
}
