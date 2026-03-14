import type {RenovatePRContext} from '../renovate-parser'
import type {ImpactAssessment} from '../semver-impact-assessor'
import type {SummaryGeneratorConfig} from '../summary-generator-types'

export interface JvmEcosystemSummaryContext {
  config: Pick<SummaryGeneratorConfig, 'maxDependenciesToList' | 'sortDependencies'>
  addBreakingChangeWarning: (summary: string, impactAssessment: ImpactAssessment) => string
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
  getJvmManagerDisplayName: (manager: string) => string
}

export function generateJvmSummaryLogic(
  ctx: JvmEcosystemSummaryContext,
  prContext: RenovatePRContext,
  impactAssessment: ImpactAssessment,
  dependencies: string[],
): string {
  const emoji = ctx.getEmojiForUpdate(prContext, impactAssessment)
  const sortedDeps = ctx.config.sortDependencies ? [...dependencies].sort() : dependencies
  const managerName = ctx.getJvmManagerDisplayName(prContext.manager)

  if (prContext.isSecurityUpdate) {
    return ctx.generateSecurityUpdateSummary(managerName, sortedDeps, prContext, impactAssessment)
  }

  if (sortedDeps.length === 1) {
    return ctx.generateSingleDependencySummary(
      managerName,
      sortedDeps[0] || '',
      prContext,
      impactAssessment,
      emoji,
    )
  }

  if (sortedDeps.length <= ctx.config.maxDependenciesToList) {
    const depList = sortedDeps.map(dep => `\`${dep}\``).join(', ')
    const summary = `${emoji}Update ${managerName} dependencies: ${depList}`

    return ctx.addBreakingChangeWarning(summary, impactAssessment)
  }

  const summary = `${emoji}Update ${sortedDeps.length} ${managerName} dependencies`
  return ctx.addBreakingChangeWarning(summary, impactAssessment)
}

export function generateNuGetSummaryLogic(
  ctx: JvmEcosystemSummaryContext,
  prContext: RenovatePRContext,
  impactAssessment: ImpactAssessment,
  dependencies: string[],
): string {
  const emoji = ctx.getEmojiForUpdate(prContext, impactAssessment)
  const sortedDeps = ctx.config.sortDependencies ? [...dependencies].sort() : dependencies

  if (prContext.isSecurityUpdate) {
    return ctx.generateSecurityUpdateSummary('NuGet', sortedDeps, prContext, impactAssessment)
  }

  if (sortedDeps.length === 1) {
    const dependency = sortedDeps[0]
    if (dependency) {
      return ctx.generateSingleDependencySummary(
        'NuGet',
        dependency,
        prContext,
        impactAssessment,
        emoji,
      )
    }
  }

  if (sortedDeps.length <= ctx.config.maxDependenciesToList) {
    const depList = sortedDeps.map(dep => `\`${dep}\``).join(', ')
    const summary = `${emoji}Update .NET packages: ${depList}`

    return ctx.addBreakingChangeWarning(summary, impactAssessment)
  }

  const summary = `${emoji}Update ${sortedDeps.length} .NET packages`
  return ctx.addBreakingChangeWarning(summary, impactAssessment)
}

export function generateComposerSummaryLogic(
  ctx: JvmEcosystemSummaryContext,
  prContext: RenovatePRContext,
  impactAssessment: ImpactAssessment,
  dependencies: string[],
): string {
  const emoji = ctx.getEmojiForUpdate(prContext, impactAssessment)
  const sortedDeps = ctx.config.sortDependencies ? [...dependencies].sort() : dependencies

  if (prContext.isSecurityUpdate) {
    return ctx.generateSecurityUpdateSummary('Composer', sortedDeps, prContext, impactAssessment)
  }

  if (sortedDeps.length === 1) {
    const dependency = sortedDeps[0]
    if (dependency) {
      return ctx.generateSingleDependencySummary(
        'Composer',
        dependency,
        prContext,
        impactAssessment,
        emoji,
      )
    }
  }

  if (sortedDeps.length <= ctx.config.maxDependenciesToList) {
    const depList = sortedDeps.map(dep => `\`${dep}\``).join(', ')
    const summary = `${emoji}Update PHP dependencies: ${depList}`

    return ctx.addBreakingChangeWarning(summary, impactAssessment)
  }

  const summary = `${emoji}Update ${sortedDeps.length} PHP dependencies`
  return ctx.addBreakingChangeWarning(summary, impactAssessment)
}
