import type {
  DependencyImpact,
  ImpactAssessment,
  ImpactAssessmentOptions,
} from './impact/impact-types'
import type {RenovateDependency} from './renovate-parser'

import {
  buildReasoning,
  calculateOverallImpact,
  determineConfidence,
} from './impact/impact-aggregator'
import {
  applyManagerRules,
  calculateSemverImpact,
  hasPrerelease,
  isBreakingChange,
  isDowngrade,
} from './impact/impact-calculator'
import {determineVersionChange, parseVersion} from './impact/version-parser'

export type {DependencyImpact, ImpactAssessment, ImpactAssessmentOptions}

const DEFAULT_OPTIONS: ImpactAssessmentOptions = {
  securityMinimumPatch: true,
  majorAsBreaking: true,
  prereleaseAsLowerImpact: true,
  defaultChangesetType: 'patch',
}

export function assessImpact(
  dependencies: RenovateDependency[],
  options: Partial<ImpactAssessmentOptions> = {},
): ImpactAssessment {
  const mergedOptions: ImpactAssessmentOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  }

  const dependencyImpacts = dependencies.map(dependency =>
    assessDependencyImpact(dependency, mergedOptions),
  )

  return calculateOverallImpact(dependencyImpacts, mergedOptions)
}

function assessDependencyImpact(
  dependency: RenovateDependency,
  options: ImpactAssessmentOptions,
): DependencyImpact {
  const currentVersion = parseVersion(dependency.currentVersion)
  const newVersion = parseVersion(dependency.newVersion)
  const versionChange = determineVersionChange(currentVersion, newVersion)

  let semverImpact = calculateSemverImpact(currentVersion, newVersion, versionChange, options)
  const isBreaking = isBreakingChange(
    dependency,
    currentVersion,
    newVersion,
    versionChange,
    options,
  )
  const isDowngradeResult = isDowngrade(currentVersion, newVersion)
  const isPrereleaseResult = hasPrerelease(currentVersion, newVersion)

  if (dependency.isSecurityUpdate && options.securityMinimumPatch) {
    if (semverImpact === 'patch' && dependency.securitySeverity === 'critical') {
      semverImpact = 'minor'
    } else {
      semverImpact = semverImpact || 'patch'
    }
  }

  const managerRule = options.managerRules?.[dependency.manager]
  if (managerRule) {
    semverImpact = applyManagerRules(semverImpact, managerRule)
  }

  const confidence = determineConfidence(currentVersion, newVersion, dependency, versionChange)
  const reasoning = buildReasoning(
    dependency,
    currentVersion,
    newVersion,
    versionChange,
    semverImpact,
    isBreaking,
    isDowngradeResult,
    isPrereleaseResult,
  )

  return {
    name: dependency.name,
    currentVersion: dependency.currentVersion,
    newVersion: dependency.newVersion,
    versionChange,
    semverImpact,
    isBreaking,
    isSecurityUpdate: dependency.isSecurityUpdate,
    securitySeverity: dependency.securitySeverity,
    isDowngrade: isDowngradeResult,
    isPrerelease: isPrereleaseResult,
    confidence,
    reasoning,
  }
}
