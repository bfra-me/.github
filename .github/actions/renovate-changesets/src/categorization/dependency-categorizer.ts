import type {RenovateDependency} from '../renovate-parser'
import type {DependencyImpact, ImpactAssessment} from '../semver-impact-assessor'
import type {CategorizationOptions, CategorizedDependency} from './categorization-types'

import {adjustRiskLevel, elevateRiskLevel, lowerConfidence, lowerRiskLevel} from './risk-calculator'

export function categorizeDependencies(
  dependencies: RenovateDependency[],
  impactAssessment: ImpactAssessment,
  options: CategorizationOptions,
): CategorizedDependency[] {
  return dependencies.map(dependency => {
    const impact = impactAssessment.dependencies.find(dep => dep.name === dependency.name)
    if (!impact) {
      throw new Error(`No impact assessment found for dependency: ${dependency.name}`)
    }

    return categorizeSingleDependency(dependency, impact, options)
  })
}

export function categorizeSingleDependency(
  dependency: RenovateDependency,
  impact: DependencyImpact,
  options: CategorizationOptions,
): CategorizedDependency {
  const categories: ('major' | 'minor' | 'patch' | 'security')[] = []
  const reasoning: string[] = []
  let primaryCategory: 'major' | 'minor' | 'patch' | 'security'
  let confidence: 'high' | 'medium' | 'low' = impact.confidence
  let isHighPriority = false
  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'

  if (impact.isSecurityUpdate) {
    categories.push('security')
    primaryCategory = 'security'
    isHighPriority = true
    reasoning.push('Security update detected')

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
    primaryCategory = impact.semverImpact
    categories.push(impact.semverImpact)

    switch (impact.semverImpact) {
      case 'major': {
        reasoning.push('Major version update')
        if (options.majorAsHighPriority) {
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

  if (impact.isBreaking) {
    if (!categories.includes('major')) {
      categories.push('major')
    }
    reasoning.push('Breaking changes detected')
    isHighPriority = true
    riskLevel = elevateRiskLevel(riskLevel, 'high')
  }

  if (impact.isDowngrade) {
    reasoning.push('Version downgrade detected')
    confidence = lowerConfidence(confidence)
    riskLevel = elevateRiskLevel(riskLevel, 'medium')
  }

  if (impact.isPrerelease && options.prereleaseAsLowerPriority) {
    reasoning.push('Pre-release version')
    isHighPriority = false
    riskLevel = lowerRiskLevel(riskLevel)
  }

  const managerRules = options.managerCategoryRules?.[dependency.manager]
  if (managerRules) {
    const categoryOverride = managerRules.categoryOverrides?.[impact.semverImpact]
    if (categoryOverride && !impact.isSecurityUpdate) {
      primaryCategory = categoryOverride
      reasoning.push(
        `Manager-specific override: ${dependency.manager} ${impact.semverImpact} → ${categoryOverride}`,
      )
    }

    if (managerRules.riskAdjustment) {
      riskLevel = adjustRiskLevel(riskLevel, managerRules.riskAdjustment)
      reasoning.push(`Risk adjusted for ${dependency.manager} manager`)
    }
  }

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
