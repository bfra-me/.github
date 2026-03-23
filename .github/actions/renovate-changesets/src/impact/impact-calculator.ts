import type {RenovateDependency} from '../renovate-parser'
import type {ImpactAssessmentOptions, SemverInfo, VersionChange} from './impact-types'

import {determineStableReleaseImpact} from './version-parser'

export function calculateSemverImpact(
  currentVersion: SemverInfo,
  newVersion: SemverInfo,
  versionChange: VersionChange,
  options: ImpactAssessmentOptions,
): 'major' | 'minor' | 'patch' {
  switch (versionChange) {
    case 'major':
      return 'major'
    case 'minor':
      return 'minor'
    case 'patch':
      return 'patch'
    case 'prerelease':
      if (!currentVersion.isValid || !newVersion.isValid) {
        return options.defaultChangesetType
      }
      if (currentVersion.prerelease && !newVersion.prerelease) {
        return determineStableReleaseImpact(currentVersion, newVersion)
      }
      if (!currentVersion.prerelease && newVersion.prerelease) {
        return options.prereleaseAsLowerImpact ? 'patch' : 'minor'
      }
      return 'patch'
    case 'none':
      return 'patch'
    case 'unknown':
    default:
      return options.defaultChangesetType
  }
}

export function applyManagerRules(
  impact: 'major' | 'minor' | 'patch',
  rule: NonNullable<ImpactAssessmentOptions['managerRules']>[string],
): 'major' | 'minor' | 'patch' {
  if (rule.defaultImpact) {
    if (impact === 'major') {
      return 'major'
    }

    const impactLevels = ['patch', 'minor', 'major']
    const currentLevel = impactLevels.indexOf(impact)
    const defaultLevel = impactLevels.indexOf(rule.defaultImpact)

    if (defaultLevel < currentLevel) {
      return rule.defaultImpact
    }
  }

  return impact
}

export function isBreakingChange(
  dependency: RenovateDependency,
  currentVersion: SemverInfo,
  newVersion: SemverInfo,
  versionChange: VersionChange,
  options: ImpactAssessmentOptions,
): boolean {
  if (versionChange === 'major' && options.majorAsBreaking) {
    if (currentVersion.major === 0 && newVersion.major === 0) {
      return currentVersion.minor !== newVersion.minor
    }
    return true
  }

  if (currentVersion.major === 0 && versionChange === 'minor') {
    return true
  }

  if (dependency.updateType === 'replacement') {
    return true
  }

  if (
    dependency.isSecurityUpdate &&
    dependency.securitySeverity === 'critical' &&
    versionChange === 'major'
  ) {
    return true
  }

  return false
}

export function isDowngrade(currentVersion: SemverInfo, newVersion: SemverInfo): boolean {
  if (!currentVersion.isValid || !newVersion.isValid) {
    return false
  }

  return compareVersions(newVersion, currentVersion) < 0
}

export function hasPrerelease(currentVersion: SemverInfo, newVersion: SemverInfo): boolean {
  return Boolean(currentVersion.prerelease || newVersion.prerelease)
}

export function compareVersions(a: SemverInfo, b: SemverInfo): number {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  if (a.patch !== b.patch) return a.patch - b.patch

  if (a.prerelease && !b.prerelease) return -1
  if (!a.prerelease && b.prerelease) return 1
  if (a.prerelease && b.prerelease) {
    return a.prerelease.localeCompare(b.prerelease)
  }

  return 0
}
