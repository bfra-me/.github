import type {ImpactAssessment} from '../semver-impact-assessor'
import type {
  CategorizationResult,
  CategorizedDependency,
  ChangeCategory,
} from './categorization-types'

import {calculateAverageRiskLevel, calculateOverallConfidence} from './risk-calculator'

export function calculateOverallCategorization(
  dependencies: CategorizedDependency[],
  impactAssessment: ImpactAssessment,
): CategorizationResult {
  const categorizedGroups = {
    major: dependencies.filter(dep => dep.category === 'major'),
    minor: dependencies.filter(dep => dep.category === 'minor'),
    patch: dependencies.filter(dep => dep.category === 'patch'),
    security: dependencies.filter(dep => dep.category === 'security'),
  }

  const allCategories: ChangeCategory[] = []
  if (categorizedGroups.security.length > 0) allCategories.push('security')
  if (categorizedGroups.major.length > 0) allCategories.push('major')
  if (categorizedGroups.minor.length > 0) allCategories.push('minor')
  if (categorizedGroups.patch.length > 0) allCategories.push('patch')

  let primaryCategory: ChangeCategory = 'patch'
  if (allCategories.includes('security')) {
    primaryCategory = 'security'
  } else if (allCategories.includes('major')) {
    primaryCategory = 'major'
  } else if (allCategories.includes('minor')) {
    primaryCategory = 'minor'
  }

  const summary = {
    totalDependencies: dependencies.length,
    majorUpdates: categorizedGroups.major.length,
    minorUpdates: categorizedGroups.minor.length,
    patchUpdates: categorizedGroups.patch.length,
    securityUpdates: categorizedGroups.security.length,
    breakingChanges: dependencies.filter(dep => dep.impact.isBreaking).length,
    highPriorityUpdates: dependencies.filter(dep => dep.isHighPriority).length,
    averageRiskLevel: calculateAverageRiskLevel(dependencies),
  }

  const confidence = calculateOverallConfidence(dependencies.map(dep => dep.confidence))

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

  const recommendedChangesetType = determineRecommendedChangesetType(
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

export function determineRecommendedChangesetType(
  primaryCategory: ChangeCategory,
  impactAssessment: ImpactAssessment,
  summary: CategorizationResult['summary'],
): 'major' | 'minor' | 'patch' {
  if (primaryCategory === 'security') {
    if (summary.averageRiskLevel >= 75) {
      return 'minor'
    }
    return 'patch'
  }

  if (impactAssessment.hasBreakingChanges) {
    return 'major'
  }

  return impactAssessment.recommendedChangesetType
}
