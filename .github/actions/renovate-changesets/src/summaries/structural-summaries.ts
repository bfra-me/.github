import type {RenovatePRContext} from '../renovate-parser'
import type {ImpactAssessment} from '../semver-impact-assessor'
import type {SummaryGeneratorConfig} from '../summary-generator-types'

import {getEmojiForUpdate} from './summary-helpers'

type StructuralConfig = Pick<
  SummaryGeneratorConfig,
  | 'includeBreakingChangeWarnings'
  | 'includeVersionDetails'
  | 'maxDependenciesToList'
  | 'sortDependencies'
  | 'useEmojis'
>

export function addBreakingChangeWarning(
  summary: string,
  impactAssessment: ImpactAssessment,
  config: StructuralConfig,
): string {
  if (impactAssessment.hasBreakingChanges && config.includeBreakingChangeWarnings) {
    return `${summary}\n\n⚠️ **Breaking Changes**: This update includes breaking changes that may require code modifications.`
  }
  return summary
}

export function generateSingleDependencySummary(
  dep: string,
  emoji: string,
  ecosystem: string,
  updateType: string,
  prContext: RenovatePRContext,
  impactAssessment: ImpactAssessment,
  config: StructuralConfig,
): string {
  const versionInfo = prContext.dependencies.find(d => d.name === dep)
  const versionText =
    config.includeVersionDetails && versionInfo?.currentVersion && versionInfo?.newVersion
      ? ` from \`${versionInfo.currentVersion}\` to \`${versionInfo.newVersion}\``
      : ''
  const summary = `${emoji}Update ${updateType} ${ecosystem} \`${dep}\`${versionText}`
  return addBreakingChangeWarning(summary, impactAssessment, config)
}

export function generateSecurityUpdateSummary(
  ecosystem: string,
  deps: string[],
  prContext: RenovatePRContext,
  impactAssessment: ImpactAssessment,
  config: StructuralConfig,
): string {
  const securityEmoji = config.useEmojis ? '🔒 ' : ''
  const vulnText = impactAssessment.totalVulnerabilities === 1 ? 'vulnerability' : 'vulnerabilities'

  if (deps.length === 0) return `${securityEmoji}Security update for ${ecosystem} dependencies`

  if (deps.length === 1) {
    const dep = deps[0] || ''
    const versionInfo = prContext.dependencies.find(d => d.name === dep)
    const versionText =
      config.includeVersionDetails && versionInfo?.currentVersion && versionInfo?.newVersion
        ? ` from \`${versionInfo.currentVersion}\` to \`${versionInfo.newVersion}\``
        : ''
    let summary = `${securityEmoji}Security update for ${ecosystem} dependency \`${dep}\`${versionText}`

    if (impactAssessment.totalVulnerabilities > 0) {
      summary += `\n\n🛡️ **Security**: Addresses ${impactAssessment.totalVulnerabilities} ${vulnText}`
      if (impactAssessment.highSeverityVulnerabilities > 0) {
        summary += ` (${impactAssessment.highSeverityVulnerabilities} high severity)`
      }
    }
    return summary
  }

  if (deps.length <= config.maxDependenciesToList) {
    let summary = `${securityEmoji}Security update for ${ecosystem} dependencies: ${deps.map(dep => `\`${dep}\``).join(', ')}`
    if (impactAssessment.totalVulnerabilities > 0) {
      summary += `\n\n🛡️ **Security**: Addresses ${impactAssessment.totalVulnerabilities} ${vulnText}`
    }
    return summary
  }

  let summary = `${securityEmoji}Security update for ${deps.length} ${ecosystem} dependencies`
  if (impactAssessment.totalVulnerabilities > 0) {
    summary += `\n\n🛡️ **Security**: Addresses ${impactAssessment.totalVulnerabilities} ${vulnText}`
  }
  return summary
}

export function generateGroupedUpdateSummary(
  ecosystem: string,
  deps: string[],
  impactAssessment: ImpactAssessment,
  config: StructuralConfig,
): string {
  const groupEmoji = config.useEmojis ? '📦 ' : ''
  const summary =
    deps.length <= config.maxDependenciesToList
      ? `${groupEmoji}Group update for ${ecosystem} dependencies: ${deps.map(dep => `\`${dep}\``).join(', ')}`
      : `${groupEmoji}Group update for ${deps.length} ${ecosystem} dependencies`
  return addBreakingChangeWarning(summary, impactAssessment, config)
}

export function generateLockfileSummary(
  prContext: RenovatePRContext,
  impactAssessment: ImpactAssessment,
  dependencies: string[],
  config: StructuralConfig,
): string {
  const emoji = getEmojiForUpdate(prContext, impactAssessment, config.useEmojis)

  if (prContext.isSecurityUpdate) return `${emoji}Update lockfile for security patches`
  if (dependencies.length === 0) return `${emoji}Update lockfile`

  const sortedDeps = config.sortDependencies ? [...dependencies].sort() : dependencies
  if (sortedDeps.length <= config.maxDependenciesToList) {
    return `${emoji}Update lockfile for: ${sortedDeps.map(dep => `\`${dep}\``).join(', ')}`
  }
  return `${emoji}Update lockfile for ${sortedDeps.length} dependencies`
}

export function generateGenericSummary(
  prContext: RenovatePRContext,
  impactAssessment: ImpactAssessment,
  updateType: string,
  dependencies: string[],
  config: StructuralConfig,
): string {
  const emoji = getEmojiForUpdate(prContext, impactAssessment, config.useEmojis)
  const sortedDeps = config.sortDependencies ? [...dependencies].sort() : dependencies

  if (prContext.isSecurityUpdate) {
    return generateSecurityUpdateSummary(
      updateType,
      sortedDeps,
      prContext,
      impactAssessment,
      config,
    )
  }
  if (prContext.isGroupedUpdate) {
    return generateGroupedUpdateSummary(updateType, sortedDeps, impactAssessment, config)
  }
  if (sortedDeps.length === 0) return `${emoji}Update ${updateType} dependencies`
  if (sortedDeps.length === 1) {
    const dep = sortedDeps[0] || ''
    return generateSingleDependencySummary(
      dep,
      emoji,
      'dependency',
      updateType,
      prContext,
      impactAssessment,
      config,
    )
  }

  const summary =
    sortedDeps.length <= config.maxDependenciesToList
      ? `${emoji}Update ${updateType} dependencies: ${sortedDeps.map(dep => `\`${dep}\``).join(', ')}`
      : `${emoji}Update ${sortedDeps.length} ${updateType} dependencies`
  return addBreakingChangeWarning(summary, impactAssessment, config)
}
