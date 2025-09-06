import type {BreakingChangeAnalysis} from './breaking-change-detector'
import type {CategorizationResult} from './change-categorization-engine'
import type {RenovatePRContext} from './renovate-parser'
import type {SecurityAnalysis} from './security-vulnerability-detector'
import type {ImpactAssessment} from './semver-impact-assessor'

/**
 * Configuration for semver bump type decision making
 */
export interface SemverBumpDecisionConfig {
  /** Default bump type when no clear decision can be made */
  defaultBumpType: 'patch' | 'minor' | 'major'
  /** Whether security updates always take precedence */
  securityTakesPrecedence: boolean
  /** Whether breaking changes always force major bumps */
  breakingChangesAlwaysMajor: boolean
  /** Minimum bump type for security updates based on severity */
  securityMinimumBumps: {
    low: 'patch' | 'minor' | 'major'
    moderate: 'patch' | 'minor' | 'major'
    high: 'patch' | 'minor' | 'major'
    critical: 'patch' | 'minor' | 'major'
  }
  /** Package manager specific rules */
  managerSpecificRules: {
    [manager: string]: {
      /** Allow downgrading bump types for this manager */
      allowDowngrade: boolean
      /** Maximum bump type for this manager */
      maxBumpType: 'patch' | 'minor' | 'major'
      /** Default bump type for this manager */
      defaultBumpType: 'patch' | 'minor' | 'major'
      /** Whether to treat major version updates as minor for this manager */
      majorAsMinor: boolean
    }
  }
  /** Risk tolerance levels */
  riskTolerance: {
    /** Maximum acceptable risk score for patch bumps */
    patchMaxRisk: number
    /** Maximum acceptable risk score for minor bumps */
    minorMaxRisk: number
    /** Threshold for forcing major bump due to high risk */
    majorRiskThreshold: number
  }
  /** Organization specific overrides */
  organizationRules: {
    /** Always use conservative bumps */
    conservativeMode: boolean
    /** Prefer minor over major for certain conditions */
    preferMinorForMajor: boolean
    /** Special handling for grouped updates */
    groupedUpdateHandling: 'highest' | 'conservative' | 'majority'
    /** Custom bump rules based on dependency patterns */
    dependencyPatternRules: {
      pattern: RegExp
      forceBumpType?: 'patch' | 'minor' | 'major'
      maxBumpType?: 'patch' | 'minor' | 'major'
    }[]
  }
}

/**
 * Decision factors that influence bump type determination
 */
export interface DecisionFactors {
  /** Semver impact assessment result */
  semverImpact: ImpactAssessment
  /** Change categorization result */
  categorization: CategorizationResult
  /** Renovate context */
  renovateContext: RenovatePRContext
  /** Breaking change analysis results */
  breakingChangeAnalyses?: BreakingChangeAnalysis[]
  /** Security analysis results */
  securityAnalyses?: SecurityAnalysis[]
  /** Package manager */
  manager: string
  /** Whether this is a grouped update */
  isGroupedUpdate: boolean
  /** Number of dependencies affected */
  dependencyCount: number
}

/**
 * Result of semver bump type decision
 */
export interface SemverBumpDecision {
  /** Final bump type decision */
  bumpType: 'patch' | 'minor' | 'major'
  /** Confidence in the decision */
  confidence: 'high' | 'medium' | 'low'
  /** Primary reasoning for the decision */
  primaryReason: string
  /** All factors that influenced the decision */
  influencingFactors: string[]
  /** Detailed reasoning chain */
  reasoningChain: string[]
  /** Whether any rules were overridden */
  overriddenRules: string[]
  /** Risk assessment of the decision */
  riskAssessment: {
    level: 'low' | 'medium' | 'high' | 'critical'
    score: number
    factors: string[]
  }
  /** Alternative decisions that were considered */
  alternatives: {
    bumpType: 'patch' | 'minor' | 'major'
    reason: string
    confidence: number
  }[]
}

/**
 * TASK-023: Sophisticated semver bump type decision engine
 *
 * This class implements a comprehensive decision-making algorithm for determining
 * the appropriate semantic versioning bump type for changeset generation. It
 * consolidates inputs from multiple analysis engines and applies organization-specific
 * rules to make intelligent bump type decisions.
 *
 * Key features:
 * - Multi-factor decision making combining semver impact, categorization, security, and breaking changes
 * - Package manager specific logic and conventions
 * - Organization-specific rules and risk tolerance
 * - Sophisticated conflict resolution and precedence handling
 * - Comprehensive reasoning and audit trail
 * - Support for grouped updates and complex dependency scenarios
 */
export class SemverBumpTypeDecisionEngine {
  private config: SemverBumpDecisionConfig

  constructor(config: Partial<SemverBumpDecisionConfig> = {}) {
    this.config = this.mergeConfig(config)
  }

  /**
   * Main decision method - determines the optimal bump type based on all available factors
   */
  decideBumpType(factors: DecisionFactors): SemverBumpDecision {
    const reasoningChain: string[] = []
    const influencingFactors: string[] = []
    const overriddenRules: string[] = []
    const alternatives: SemverBumpDecision['alternatives'] = []

    reasoningChain.push('Starting semver bump type decision analysis')

    // Step 1: Extract base recommendations from different analyzers
    const semverRecommendation = factors.semverImpact.recommendedChangesetType
    const categorizationRecommendation = factors.categorization.recommendedChangesetType

    reasoningChain.push(
      `Base recommendations: semver=${semverRecommendation}, categorization=${categorizationRecommendation || 'none'}`,
    )

    // Step 2: Apply security precedence rules
    let currentDecision = this.applySecurityPrecedence(
      factors,
      semverRecommendation,
      categorizationRecommendation,
      reasoningChain,
      influencingFactors,
    )

    // Step 3: Apply breaking change rules
    currentDecision = this.applyBreakingChangeRules(
      factors,
      currentDecision,
      reasoningChain,
      influencingFactors,
      overriddenRules,
    )

    // Step 4: Apply package manager specific rules
    currentDecision = this.applyManagerSpecificRules(
      factors,
      currentDecision,
      reasoningChain,
      influencingFactors,
      overriddenRules,
    )

    // Step 5: Apply organization-specific rules
    currentDecision = this.applyOrganizationRules(
      factors,
      currentDecision,
      reasoningChain,
      influencingFactors,
      overriddenRules,
    )

    // Step 6: Apply risk-based adjustments
    currentDecision = this.applyRiskBasedAdjustments(
      factors,
      currentDecision,
      reasoningChain,
      influencingFactors,
    )

    // Step 7: Handle grouped update logic
    if (factors.isGroupedUpdate) {
      currentDecision = this.applyGroupedUpdateLogic(
        factors,
        currentDecision,
        reasoningChain,
        influencingFactors,
      )
    }

    // Step 8: Calculate confidence and risk assessment
    const confidence = this.calculateConfidence(factors, currentDecision, overriddenRules)
    const riskAssessment = this.calculateRiskAssessment(factors, currentDecision)

    // Step 9: Generate primary reason and alternatives
    const primaryReason = this.generatePrimaryReason(currentDecision, factors, reasoningChain)
    this.generateAlternatives(factors, currentDecision, alternatives)

    reasoningChain.push(`Final decision: ${currentDecision} (confidence: ${confidence})`)

    return {
      bumpType: currentDecision,
      confidence,
      primaryReason,
      influencingFactors,
      reasoningChain,
      overriddenRules,
      riskAssessment,
      alternatives,
    }
  }

  /**
   * Apply security update precedence rules
   */
  private applySecurityPrecedence(
    factors: DecisionFactors,
    semverRecommendation: 'patch' | 'minor' | 'major',
    categorizationRecommendation: 'patch' | 'minor' | 'major' | undefined,
    reasoningChain: string[],
    influencingFactors: string[],
  ): 'patch' | 'minor' | 'major' {
    // Determine base recommendation - prefer categorization if available and high confidence, otherwise semver
    let baseRecommendation = semverRecommendation
    if (categorizationRecommendation && factors.categorization.confidence === 'high') {
      baseRecommendation = categorizationRecommendation
    } else if (categorizationRecommendation) {
      // Use the higher of the two recommendations when categorization confidence is not high
      baseRecommendation = this.getHigherBumpType(
        semverRecommendation,
        categorizationRecommendation,
      )
    }

    if (!this.config.securityTakesPrecedence || !factors.semverImpact.isSecurityUpdate) {
      return baseRecommendation
    }

    reasoningChain.push('Applying security update precedence rules')
    influencingFactors.push('security-precedence')

    // Find the highest security severity
    let highestSeverity: 'low' | 'moderate' | 'high' | 'critical' = 'low'
    for (const dep of factors.semverImpact.dependencies) {
      if (dep.isSecurityUpdate && dep.securitySeverity) {
        const severityLevel = this.getSecuritySeverityLevel(dep.securitySeverity)
        if (severityLevel > this.getSecuritySeverityLevel(highestSeverity)) {
          highestSeverity = dep.securitySeverity as 'low' | 'moderate' | 'high' | 'critical'
        }
      }
    }

    const securityMinimumBump = this.config.securityMinimumBumps[highestSeverity]

    // Use the higher of security minimum or base recommendation
    const result = this.getHigherBumpType(securityMinimumBump, baseRecommendation)

    reasoningChain.push(
      `Security severity: ${highestSeverity}, minimum bump: ${securityMinimumBump}, result: ${result}`,
    )

    return result
  }

  /**
   * Apply breaking change rules
   */
  private applyBreakingChangeRules(
    factors: DecisionFactors,
    currentDecision: 'patch' | 'minor' | 'major',
    reasoningChain: string[],
    influencingFactors: string[],
    overriddenRules: string[],
  ): 'patch' | 'minor' | 'major' {
    if (!factors.semverImpact.hasBreakingChanges) {
      return currentDecision
    }

    reasoningChain.push('Applying breaking change rules')
    influencingFactors.push('breaking-changes')

    if (this.config.breakingChangesAlwaysMajor && currentDecision !== 'major') {
      overriddenRules.push(`Overriding ${currentDecision} to major due to breaking changes`)
      reasoningChain.push('Breaking changes detected - forcing major bump')
      return 'major'
    }

    // Check critical breaking changes from detailed analysis
    if (factors.breakingChangeAnalyses) {
      const criticalBreakingChanges = factors.breakingChangeAnalyses.filter(analysis =>
        analysis.indicators.some(indicator => indicator.severity === 'critical'),
      )

      if (criticalBreakingChanges.length > 0 && currentDecision !== 'major') {
        overriddenRules.push('Overriding to major due to critical breaking changes')
        reasoningChain.push(
          `${criticalBreakingChanges.length} critical breaking changes detected - forcing major bump`,
        )
        return 'major'
      }
    }

    return currentDecision
  }

  /**
   * Apply package manager specific rules
   */
  private applyManagerSpecificRules(
    factors: DecisionFactors,
    currentDecision: 'patch' | 'minor' | 'major',
    reasoningChain: string[],
    influencingFactors: string[],
    overriddenRules: string[],
  ): 'patch' | 'minor' | 'major' {
    const managerRules = this.config.managerSpecificRules[factors.manager]
    if (!managerRules) {
      return currentDecision
    }

    reasoningChain.push(`Applying ${factors.manager} manager-specific rules`)
    influencingFactors.push(`manager-rules-${factors.manager}`)

    let result = currentDecision

    // Apply major-as-minor rule
    if (managerRules.majorAsMinor && result === 'major') {
      result = 'minor'
      overriddenRules.push(`Downgraded major to minor for ${factors.manager} manager`)
      reasoningChain.push(`Major version treated as minor for ${factors.manager}`)
    }

    // Apply maximum bump type restriction
    if (this.getBumpTypeLevel(result) > this.getBumpTypeLevel(managerRules.maxBumpType)) {
      const originalResult = result
      result = managerRules.maxBumpType
      overriddenRules.push(
        `Restricted ${originalResult} to ${result} due to ${factors.manager} manager max bump type`,
      )
      reasoningChain.push(`Restricted to max bump type ${result} for ${factors.manager}`)
    }

    // Apply downgrade logic if allowed (but only if no specific transformations were applied)
    if (managerRules.allowDowngrade && result === currentDecision) {
      const defaultBump = managerRules.defaultBumpType
      if (this.getBumpTypeLevel(defaultBump) < this.getBumpTypeLevel(result)) {
        const originalResult = result
        result = defaultBump
        overriddenRules.push(`Downgraded ${originalResult} to ${result} for ${factors.manager}`)
        reasoningChain.push(`Used default bump type ${result} for ${factors.manager}`)
      }
    }

    return result
  }

  /**
   * Apply organization-specific rules
   */
  private applyOrganizationRules(
    factors: DecisionFactors,
    currentDecision: 'patch' | 'minor' | 'major',
    reasoningChain: string[],
    influencingFactors: string[],
    overriddenRules: string[],
  ): 'patch' | 'minor' | 'major' {
    const orgRules = this.config.organizationRules
    reasoningChain.push('Applying organization-specific rules')
    influencingFactors.push('organization-rules')

    let result = currentDecision

    // Apply conservative mode (but not for security updates or breaking changes)
    if (
      orgRules.conservativeMode &&
      result === 'major' &&
      orgRules.preferMinorForMajor &&
      !factors.semverImpact.isSecurityUpdate &&
      !factors.semverImpact.hasBreakingChanges
    ) {
      // In conservative mode, prefer patch over minor, minor over major
      result = 'minor'
      overriddenRules.push('Conservative mode: downgraded major to minor')
      reasoningChain.push('Applied conservative major->minor downgrade')
    }

    // Apply dependency pattern rules
    for (const patternRule of orgRules.dependencyPatternRules) {
      const matchingDeps = factors.semverImpact.dependencies.filter(dep =>
        patternRule.pattern.test(dep.name),
      )

      if (matchingDeps.length > 0) {
        reasoningChain.push(
          `Pattern rule matched for ${matchingDeps.length} dependencies: ${patternRule.pattern}`,
        )

        if (patternRule.forceBumpType) {
          result = patternRule.forceBumpType
          overriddenRules.push(
            `Pattern rule forced bump type to ${patternRule.forceBumpType} for ${matchingDeps.map(d => d.name).join(', ')}`,
          )
          break
        }

        if (
          patternRule.maxBumpType &&
          this.getBumpTypeLevel(result) > this.getBumpTypeLevel(patternRule.maxBumpType)
        ) {
          const originalResult = result
          result = patternRule.maxBumpType
          overriddenRules.push(
            `Pattern rule restricted ${originalResult} to ${result} for ${matchingDeps.map(d => d.name).join(', ')}`,
          )
        }
      }
    }

    return result
  }

  /**
   * Apply risk-based adjustments
   */
  private applyRiskBasedAdjustments(
    factors: DecisionFactors,
    currentDecision: 'patch' | 'minor' | 'major',
    reasoningChain: string[],
    influencingFactors: string[],
  ): 'patch' | 'minor' | 'major' {
    const riskScore = factors.semverImpact.overallRiskScore || 0
    const riskTolerance = this.config.riskTolerance

    reasoningChain.push(`Applying risk-based adjustments (risk score: ${riskScore})`)
    influencingFactors.push('risk-assessment')

    // Force major bump for very high risk
    if (riskScore >= riskTolerance.majorRiskThreshold && currentDecision !== 'major') {
      reasoningChain.push(
        `High risk score (${riskScore}) forces major bump (threshold: ${riskTolerance.majorRiskThreshold})`,
      )
      return 'major'
    }

    // Validate current decision against risk thresholds
    if (currentDecision === 'patch' && riskScore > riskTolerance.patchMaxRisk) {
      reasoningChain.push(
        `Risk score (${riskScore}) exceeds patch threshold (${riskTolerance.patchMaxRisk}), upgrading to minor`,
      )
      return 'minor'
    }

    if (currentDecision === 'minor' && riskScore > riskTolerance.minorMaxRisk) {
      reasoningChain.push(
        `Risk score (${riskScore}) exceeds minor threshold (${riskTolerance.minorMaxRisk}), upgrading to major`,
      )
      return 'major'
    }

    return currentDecision
  }

  /**
   * Apply grouped update logic
   */
  private applyGroupedUpdateLogic(
    factors: DecisionFactors,
    currentDecision: 'patch' | 'minor' | 'major',
    reasoningChain: string[],
    influencingFactors: string[],
  ): 'patch' | 'minor' | 'major' {
    const groupedHandling = this.config.organizationRules.groupedUpdateHandling
    reasoningChain.push(`Applying grouped update logic (strategy: ${groupedHandling})`)
    influencingFactors.push('grouped-update')

    if (groupedHandling === 'highest') {
      // Already using the highest impact, no change needed
      reasoningChain.push('Using highest impact strategy - no change needed')
      return currentDecision
    }

    if (groupedHandling === 'conservative' && currentDecision === 'major') {
      // Use more conservative approach for grouped updates
      reasoningChain.push('Conservative grouped update: considering major as minor')
      return 'minor'
    }

    if (groupedHandling === 'majority') {
      // Use the majority bump type from all dependencies
      const bumpCounts = {patch: 0, minor: 0, major: 0}

      for (const dep of factors.semverImpact.dependencies) {
        bumpCounts[dep.semverImpact]++
      }

      const majorityType = Object.entries(bumpCounts).reduce((a, b) =>
        bumpCounts[a[0] as keyof typeof bumpCounts] > bumpCounts[b[0] as keyof typeof bumpCounts]
          ? a
          : b,
      )[0] as 'patch' | 'minor' | 'major'

      reasoningChain.push(
        `Majority strategy: patch=${bumpCounts.patch}, minor=${bumpCounts.minor}, major=${bumpCounts.major}, majority=${majorityType}`,
      )

      return majorityType
    }

    return currentDecision
  }

  /**
   * Calculate confidence in the decision
   */
  private calculateConfidence(
    factors: DecisionFactors,
    _decision: 'patch' | 'minor' | 'major',
    overriddenRules: string[],
  ): 'high' | 'medium' | 'low' {
    let confidence: 'high' | 'medium' | 'low' = 'high'

    // Lower confidence if many rules were overridden
    if (overriddenRules.length > 2) {
      confidence = 'medium'
    }

    // Lower confidence for low-confidence impact assessment
    if (factors.semverImpact.confidence === 'low') {
      confidence = 'low'
    }

    // Lower confidence for complex grouped updates
    if (factors.isGroupedUpdate && factors.dependencyCount > 5) {
      confidence = confidence === 'high' ? 'medium' : 'low'
    }

    // Higher confidence for security updates (well-documented)
    if (factors.semverImpact.isSecurityUpdate && confidence !== 'low') {
      confidence = 'high'
    }

    return confidence
  }

  /**
   * Calculate risk assessment for the decision
   */
  private calculateRiskAssessment(
    factors: DecisionFactors,
    decision: 'patch' | 'minor' | 'major',
  ): SemverBumpDecision['riskAssessment'] {
    const riskFactors: string[] = []
    let riskScore = factors.semverImpact.overallRiskScore || 0

    // Adjust risk based on decision type
    if (decision === 'patch') {
      riskScore *= 0.8 // Patch updates are generally lower risk
    } else if (decision === 'major') {
      riskScore *= 1.2 // Major updates are generally higher risk
    }

    // Add specific risk factors
    if (factors.semverImpact.hasBreakingChanges) {
      riskFactors.push('breaking changes detected')
      riskScore += 10
    }

    if (factors.semverImpact.isSecurityUpdate) {
      riskFactors.push('security update')
      riskScore += 5 // Security updates add some risk but are necessary
    }

    if (factors.isGroupedUpdate) {
      riskFactors.push('grouped update')
      riskScore += factors.dependencyCount * 2
    }

    // Determine risk level
    let level: 'low' | 'medium' | 'high' | 'critical'
    if (riskScore < 20) {
      level = 'low'
    } else if (riskScore < 50) {
      level = 'medium'
    } else if (riskScore < 80) {
      level = 'high'
    } else {
      level = 'critical'
    }

    return {
      level,
      score: Math.min(100, riskScore),
      factors: riskFactors,
    }
  }

  /**
   * Generate primary reason for the decision
   */
  private generatePrimaryReason(
    decision: 'patch' | 'minor' | 'major',
    factors: DecisionFactors,
    _reasoningChain: string[],
  ): string {
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

  /**
   * Generate alternative decisions that were considered
   */
  private generateAlternatives(
    factors: DecisionFactors,
    finalDecision: 'patch' | 'minor' | 'major',
    alternatives: SemverBumpDecision['alternatives'],
  ): void {
    const semverRecommendation = factors.semverImpact.recommendedChangesetType
    const categorizationRecommendation = factors.categorization.recommendedChangesetType

    if (semverRecommendation !== finalDecision) {
      alternatives.push({
        bumpType: semverRecommendation,
        reason: 'Semver impact assessment recommendation',
        confidence: factors.semverImpact.confidence === 'high' ? 0.8 : 0.6,
      })
    }

    if (categorizationRecommendation && categorizationRecommendation !== finalDecision) {
      alternatives.push({
        bumpType: categorizationRecommendation,
        reason: 'Change categorization recommendation',
        confidence: factors.categorization.confidence === 'high' ? 0.8 : 0.6,
      })
    }
  }

  /**
   * Helper methods
   */
  private getSecuritySeverityLevel(severity: string): number {
    const levels = {low: 1, moderate: 2, high: 3, critical: 4}
    return levels[severity as keyof typeof levels] || 1
  }

  private getBumpTypeLevel(bumpType: 'patch' | 'minor' | 'major'): number {
    const levels = {patch: 1, minor: 2, major: 3}
    return levels[bumpType]
  }

  private getHigherBumpType(
    a: 'patch' | 'minor' | 'major',
    b: 'patch' | 'minor' | 'major',
  ): 'patch' | 'minor' | 'major' {
    return this.getBumpTypeLevel(a) > this.getBumpTypeLevel(b) ? a : b
  }

  /**
   * Merge user config with defaults
   */
  private mergeConfig(userConfig: Partial<SemverBumpDecisionConfig>): SemverBumpDecisionConfig {
    const defaultConfig: SemverBumpDecisionConfig = {
      defaultBumpType: 'patch',
      securityTakesPrecedence: true,
      breakingChangesAlwaysMajor: true,
      securityMinimumBumps: {
        low: 'patch',
        moderate: 'patch',
        high: 'minor',
        critical: 'minor',
      },
      managerSpecificRules: {
        'github-actions': {
          allowDowngrade: true,
          maxBumpType: 'minor',
          defaultBumpType: 'patch',
          majorAsMinor: true,
        },
        docker: {
          allowDowngrade: true,
          maxBumpType: 'minor',
          defaultBumpType: 'patch',
          majorAsMinor: false,
        },
        npm: {
          allowDowngrade: false,
          maxBumpType: 'major',
          defaultBumpType: 'patch',
          majorAsMinor: false,
        },
      },
      riskTolerance: {
        patchMaxRisk: 20,
        minorMaxRisk: 50,
        majorRiskThreshold: 80,
      },
      organizationRules: {
        conservativeMode: true,
        preferMinorForMajor: true,
        groupedUpdateHandling: 'conservative',
        dependencyPatternRules: [
          {
            pattern: /^@types\//,
            maxBumpType: 'patch',
          },
          {
            pattern: /eslint|prettier|typescript/,
            maxBumpType: 'patch',
          },
        ],
      },
    }

    return {
      ...defaultConfig,
      ...userConfig,
      securityMinimumBumps: {
        ...defaultConfig.securityMinimumBumps,
        ...userConfig.securityMinimumBumps,
      },
      managerSpecificRules: {
        ...defaultConfig.managerSpecificRules,
        ...userConfig.managerSpecificRules,
      },
      riskTolerance: {
        ...defaultConfig.riskTolerance,
        ...userConfig.riskTolerance,
      },
      organizationRules: {
        ...defaultConfig.organizationRules,
        ...userConfig.organizationRules,
        dependencyPatternRules: [
          ...defaultConfig.organizationRules.dependencyPatternRules,
          ...(userConfig.organizationRules?.dependencyPatternRules || []),
        ],
      },
    }
  }
}
