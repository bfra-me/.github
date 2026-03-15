import type {RenovatePRContext} from '../renovate-parser'
import type {ImpactAssessment} from '../semver-impact-assessor'
import type {SummaryGeneratorConfig} from '../summary-generator-types'

export interface JsEcosystemSummaryContext {
  config: Pick<
    SummaryGeneratorConfig,
    | 'includeBreakingChangeWarnings'
    | 'includeVersionDetails'
    | 'maxDependenciesToList'
    | 'sortDependencies'
  >
  addBreakingChangeWarning: (summary: string, impactAssessment: ImpactAssessment) => string
  generateGroupedUpdateSummary: (
    managerType: string,
    dependencies: string[],
    impactAssessment: ImpactAssessment,
  ) => string
  generateSecurityUpdateSummary: (
    managerType: string,
    dependencies: string[],
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
  ) => string
  generateSingleDependencySummary: (
    managerType: string,
    dependency: string,
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    emoji: string,
  ) => string
  getEmojiForUpdate: (prContext: RenovatePRContext, impactAssessment: ImpactAssessment) => string
}

export function generateNpmSummaryLogic(
  ctx: JsEcosystemSummaryContext,
  prContext: RenovatePRContext,
  impactAssessment: ImpactAssessment,
  dependencies: string[],
): string {
  const emoji = ctx.getEmojiForUpdate(prContext, impactAssessment)
  const sortedDeps = ctx.config.sortDependencies ? [...dependencies].sort() : dependencies

  if (prContext.isSecurityUpdate) {
    return ctx.generateSecurityUpdateSummary('npm', sortedDeps, prContext, impactAssessment)
  }

  if (prContext.isGroupedUpdate) {
    return ctx.generateGroupedUpdateSummary('npm', sortedDeps, impactAssessment)
  }

  if (sortedDeps.length === 0) {
    return `${emoji}Update npm dependencies`
  }

  if (sortedDeps.length === 1) {
    const dependency = sortedDeps[0]
    if (dependency) {
      return ctx.generateSingleDependencySummary(
        'npm',
        dependency,
        prContext,
        impactAssessment,
        emoji,
      )
    }
  }

  if (sortedDeps.length <= ctx.config.maxDependenciesToList) {
    const depList = sortedDeps.map(dep => `\`${dep}\``).join(', ')
    const summary = `${emoji}Update npm dependencies: ${depList}`

    if (impactAssessment.hasBreakingChanges && ctx.config.includeBreakingChangeWarnings) {
      return `${summary}\n\n⚠️ **Breaking Changes**: This update includes breaking changes that may require code modifications.`
    }

    return summary
  }

  const summary = `${emoji}Update ${sortedDeps.length} npm dependencies`
  return ctx.addBreakingChangeWarning(summary, impactAssessment)
}

export function generateGitHubActionsSummaryLogic(
  ctx: JsEcosystemSummaryContext,
  prContext: RenovatePRContext,
  impactAssessment: ImpactAssessment,
  dependencies: string[],
): string {
  const emoji = ctx.getEmojiForUpdate(prContext, impactAssessment)
  const sortedDeps = ctx.config.sortDependencies ? [...dependencies].sort() : dependencies

  if (prContext.isSecurityUpdate) {
    return ctx.generateSecurityUpdateSummary(
      'GitHub Actions',
      sortedDeps,
      prContext,
      impactAssessment,
    )
  }

  if (sortedDeps.length === 1) {
    const dep = sortedDeps[0]
    const versionInfo = prContext.dependencies.find(d => d.name === dep)
    let versionText = ''

    if (
      ctx.config.includeVersionDetails &&
      versionInfo?.currentVersion &&
      versionInfo?.newVersion
    ) {
      versionText = ` from \`${versionInfo.currentVersion}\` to \`${versionInfo.newVersion}\``
    }

    return `${emoji}Update GitHub Actions workflow dependency \`${dep}\`${versionText}`
  }

  if (sortedDeps.length <= ctx.config.maxDependenciesToList) {
    const depList = sortedDeps.map(dep => `\`${dep}\``).join(', ')
    return `${emoji}Update GitHub Actions workflow dependencies: ${depList}`
  }

  return `${emoji}Update ${sortedDeps.length} GitHub Actions workflow dependencies`
}

export function generateGoSummaryLogic(
  ctx: JsEcosystemSummaryContext,
  prContext: RenovatePRContext,
  impactAssessment: ImpactAssessment,
  dependencies: string[],
): string {
  const emoji = ctx.getEmojiForUpdate(prContext, impactAssessment)
  const sortedDeps = ctx.config.sortDependencies ? [...dependencies].sort() : dependencies

  if (prContext.isSecurityUpdate) {
    return ctx.generateSecurityUpdateSummary('Go', sortedDeps, prContext, impactAssessment)
  }

  if (sortedDeps.length === 1) {
    return ctx.generateSingleDependencySummary(
      'Go',
      sortedDeps[0] || '',
      prContext,
      impactAssessment,
      emoji,
    )
  }

  if (sortedDeps.length <= ctx.config.maxDependenciesToList) {
    const depList = sortedDeps.map(dep => `\`${dep}\``).join(', ')
    const summary = `${emoji}Update Go modules: ${depList}`

    return ctx.addBreakingChangeWarning(summary, impactAssessment)
  }

  const summary = `${emoji}Update ${sortedDeps.length} Go modules`
  return ctx.addBreakingChangeWarning(summary, impactAssessment)
}
