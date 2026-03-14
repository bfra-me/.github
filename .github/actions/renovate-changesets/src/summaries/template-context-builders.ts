import type {CategorizationResult} from '../change-categorization-engine'
import type {
  ChangesetTemplateEngine,
  EnhancedTemplateContext,
  TemplateConfig,
} from '../changeset-template-engine'
import type {RenovatePRContext} from '../renovate-parser'
import type {ImpactAssessment} from '../semver-impact-assessor'
import type {SummaryGeneratorConfig, TemplateContext} from '../summary-generator-types'
import {env} from 'node:process'

import {
  determineRiskLevel,
  getEcosystemName,
  getEmojiForUpdate,
  getPackageManagerDisplayName,
} from './summary-helpers'

type TemplateBuilderConfig = Pick<SummaryGeneratorConfig, 'sortDependencies' | 'useEmojis'>

export function buildTemplateContext(
  prContext: RenovatePRContext,
  impactAssessment: ImpactAssessment,
  categorizationResult: CategorizationResult,
  updateType: string,
  dependencies: string[],
  config: TemplateBuilderConfig,
): TemplateContext {
  const sortedDeps = config.sortDependencies ? [...dependencies].sort() : dependencies
  const primaryDep = prContext.dependencies[0]
  const resolvedManager = prContext.manager === 'unknown' ? updateType : prContext.manager

  return {
    updateType,
    manager: resolvedManager,
    dependencies: sortedDeps,
    dependencyCount: sortedDeps.length,
    isSecurityUpdate: prContext.isSecurityUpdate,
    isGroupedUpdate: prContext.isGroupedUpdate,
    hasBreakingChanges: impactAssessment.hasBreakingChanges,
    primaryVersion: primaryDep?.newVersion,
    versionRange:
      primaryDep?.currentVersion && primaryDep?.newVersion
        ? `${primaryDep.currentVersion} → ${primaryDep.newVersion}`
        : undefined,
    riskLevel: determineRiskLevel(impactAssessment),
    primaryCategory: categorizationResult.primaryCategory,
    emoji: getEmojiForUpdate(prContext, impactAssessment, config.useEmojis).trim(),
  }
}

export function interpolateTemplate(template: string, context: TemplateContext): string {
  const replacements: [string, string][] = [
    ['{updateType}', context.updateType],
    ['{manager}', context.manager],
    ['{dependencies}', context.dependencies.join(', ')],
    ['{dependencyCount}', context.dependencyCount.toString()],
    ['{isSecurityUpdate}', context.isSecurityUpdate.toString()],
    ['{isGroupedUpdate}', context.isGroupedUpdate.toString()],
    ['{hasBreakingChanges}', context.hasBreakingChanges.toString()],
    ['{primaryVersion}', context.primaryVersion || ''],
    ['{version}', context.primaryVersion || 'latest'],
    ['{versionRange}', context.versionRange || ''],
    ['{riskLevel}', context.riskLevel],
    ['{primaryCategory}', context.primaryCategory],
    ['{emoji}', context.emoji],
  ]
  return replacements.reduce((result, [token, value]) => result.split(token).join(value), template)
}

export async function generateWithTemplateEngine(
  templateEngine: ChangesetTemplateEngine | undefined,
  prContext: RenovatePRContext,
  impactAssessment: ImpactAssessment,
  categorizationResult: CategorizationResult,
  updateType: string,
  dependencies: string[],
  legacyTemplate: string | undefined,
  generateContextAwareSummary: (
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    updateType: string,
    dependencies: string[],
  ) => string,
  buildEnhancedContext: (
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    categorizationResult: CategorizationResult,
    updateType: string,
    dependencies: string[],
  ) => EnhancedTemplateContext,
): Promise<string> {
  if (!templateEngine) throw new Error('Template engine not available')
  const enhancedContext = buildEnhancedContext(
    prContext,
    impactAssessment,
    categorizationResult,
    updateType,
    dependencies,
  )

  try {
    const orgResult = await templateEngine.createFromOrganization(
      prContext.manager,
      updateType,
      enhancedContext,
    )
    if (orgResult.trim().length > 0) return orgResult

    if (legacyTemplate) {
      const legacyConfig: TemplateConfig = {content: legacyTemplate, format: 'simple'}
      return await templateEngine.renderTemplate(legacyConfig, enhancedContext)
    }

    return generateContextAwareSummary(prContext, impactAssessment, updateType, dependencies)
  } catch (error) {
    console.warn(`Template engine failed, falling back to legacy generation: ${error}`)
    return generateContextAwareSummary(prContext, impactAssessment, updateType, dependencies)
  }
}

export function buildEnhancedTemplateContext(
  prContext: RenovatePRContext,
  impactAssessment: ImpactAssessment,
  categorizationResult: CategorizationResult,
  updateType: string,
  dependencies: string[],
  buildContext: (
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    categorizationResult: CategorizationResult,
    updateType: string,
    dependencies: string[],
  ) => TemplateContext,
): EnhancedTemplateContext {
  const now = new Date()
  const resolvedManager = prContext.manager === 'unknown' ? updateType : prContext.manager
  const securitySeverity =
    prContext.dependencies.find(dep => dep.isSecurityUpdate)?.securitySeverity || undefined

  return {
    ...buildContext(prContext, impactAssessment, categorizationResult, updateType, dependencies),
    timestamp: now.toISOString(),
    date: now.toISOString().split('T')[0] ?? '',
    packageManager: getPackageManagerDisplayName(resolvedManager),
    ecosystem: getEcosystemName(resolvedManager),
    updateScope: impactAssessment.recommendedChangesetType,
    securitySeverity: securitySeverity === null ? undefined : securitySeverity,
    dependencyList: prContext.dependencies.map(dep => ({
      name: dep.name,
      currentVersion: dep.currentVersion,
      newVersion: dep.newVersion,
      versionRange:
        dep.currentVersion && dep.newVersion
          ? `${dep.currentVersion} → ${dep.newVersion}`
          : undefined,
      isBreaking: false,
      isSecurity: dep.isSecurityUpdate || false,
    })),
    impact: {
      overall: impactAssessment.overallImpact,
      score: impactAssessment.overallRiskScore,
      confidence:
        impactAssessment.confidence === 'high'
          ? 0.9
          : impactAssessment.confidence === 'medium'
            ? 0.7
            : 0.5,
      hasBreaking: impactAssessment.hasBreakingChanges,
      hasSecurity: prContext.isSecurityUpdate,
    },
    organization: {
      name: 'bfra.me',
      standards: {},
      branding: {
        colors: {primary: '#0366d6', success: '#28a745', warning: '#ffc107', danger: '#dc3545'},
        icons: {},
      },
    },
    repository: {
      name: env.GITHUB_REPOSITORY?.split('/')[1] || 'unknown',
      language: 'typescript',
      framework: 'node',
      size: 'medium',
    },
    helpers: createEnhancedHelpers(),
  }
}

export function createEnhancedHelpers(): EnhancedTemplateContext['helpers'] {
  return {
    formatDate: (date: Date | string) =>
      (typeof date === 'string' ? new Date(date) : date).toISOString().split('T')[0] || '',
    capitalize: (text: string) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase(),
    pluralize: (word: string, count: number) => (count === 1 ? word : `${word}s`),
    truncate: (text: string, length: number) =>
      text.length > length ? `${text.slice(0, length)}...` : text,
    joinWithAnd: (items: string[]) => {
      if (items.length <= 1) return items[0] || ''
      if (items.length === 2) return `${items[0] || ''} and ${items[1] || ''}`
      const last = items.at(-1) || ''
      return `${items.slice(0, -1).join(', ')}, and ${last}`
    },
    formatVersion: (version: string) => (version.startsWith('v') ? version : `v${version}`),
    formatSemverBump: (current: string, next: string) => `${current} → ${next}`,
  }
}
