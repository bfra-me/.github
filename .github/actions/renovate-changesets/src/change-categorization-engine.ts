import type {
  CategorizationOptions,
  CategorizationResult,
  CategorizedDependency,
  ChangeCategory,
} from './categorization/categorization-types'
import type {RenovateDependency} from './renovate-parser'
import type {ImpactAssessment} from './semver-impact-assessor'

import {calculateOverallCategorization} from './categorization/categorization-aggregator'
import {categorizeDependencies} from './categorization/dependency-categorizer'

export type {CategorizationOptions, CategorizationResult, CategorizedDependency, ChangeCategory}

const DEFAULT_OPTIONS: CategorizationOptions = {
  securityFirst: true,
  majorAsHighPriority: true,
  prereleaseAsLowerPriority: true,
}

export function categorizeChanges(
  dependencies: RenovateDependency[],
  impactAssessment: ImpactAssessment,
  options: Partial<CategorizationOptions> = {},
): CategorizationResult {
  const mergedOptions: CategorizationOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  }

  const categorizedDependencies = categorizeDependencies(
    dependencies,
    impactAssessment,
    mergedOptions,
  )

  return calculateOverallCategorization(categorizedDependencies, impactAssessment)
}
