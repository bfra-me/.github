import type {RenovatePRContext} from '../renovate-parser'
import type {ImpactAssessment} from '../semver-impact-assessor'
import type {SummaryGeneratorConfig} from '../summary-generator-types'

import {formatVersionText} from './summary-helpers'

export interface InfrastructureSummaryContext {
  config: Pick<
    SummaryGeneratorConfig,
    'includeVersionDetails' | 'maxDependenciesToList' | 'sortDependencies'
  >
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
  getPythonManagerDisplayName: (manager: string) => string
}

function getVersionTextForDep(
  dep: string,
  prContext: RenovatePRContext,
  impactAssessment: ImpactAssessment,
  includeDetails: boolean,
): string {
  const versionInfo = prContext.dependencies.find(d => d.name === dep)
  return formatVersionText(
    versionInfo?.currentVersion,
    versionInfo?.newVersion,
    impactAssessment.overallImpact,
    includeDetails,
  )
}

export function generateDockerSummaryLogic(
  ctx: InfrastructureSummaryContext,
  prContext: RenovatePRContext,
  impactAssessment: ImpactAssessment,
  dependencies: string[],
): string {
  const emoji = ctx.getEmojiForUpdate(prContext, impactAssessment)
  const sortedDeps = ctx.config.sortDependencies ? [...dependencies].sort() : dependencies

  if (prContext.isSecurityUpdate) {
    return ctx.generateSecurityUpdateSummary('Docker', sortedDeps, prContext, impactAssessment)
  }

  if (sortedDeps.length === 1) {
    const dep = sortedDeps[0] || ''
    return `${emoji}Update Docker image \`${dep}\`${getVersionTextForDep(dep, prContext, impactAssessment, ctx.config.includeVersionDetails)}`
  }

  if (sortedDeps.length <= ctx.config.maxDependenciesToList) {
    return `${emoji}Update Docker images: ${sortedDeps.map(dep => `\`${dep}\``).join(', ')}`
  }

  return `${emoji}Update ${sortedDeps.length} Docker images`
}

export function generatePythonSummaryLogic(
  ctx: InfrastructureSummaryContext,
  prContext: RenovatePRContext,
  impactAssessment: ImpactAssessment,
  dependencies: string[],
): string {
  const emoji = ctx.getEmojiForUpdate(prContext, impactAssessment)
  const sortedDeps = ctx.config.sortDependencies ? [...dependencies].sort() : dependencies
  const managerName = ctx.getPythonManagerDisplayName(prContext.manager)

  if (prContext.isSecurityUpdate) {
    return ctx.generateSecurityUpdateSummary(managerName, sortedDeps, prContext, impactAssessment)
  }

  if (sortedDeps.length === 1) {
    const firstDep = sortedDeps[0]
    if (!firstDep) {
      throw new Error('Invalid dependency in array')
    }

    return ctx.generateSingleDependencySummary(
      managerName,
      firstDep,
      prContext,
      impactAssessment,
      emoji,
    )
  }

  if (sortedDeps.length <= ctx.config.maxDependenciesToList) {
    const summary = `${emoji}Update ${managerName} dependencies: ${sortedDeps.map(dep => `\`${dep}\``).join(', ')}`
    return ctx.addBreakingChangeWarning(summary, impactAssessment)
  }

  return ctx.addBreakingChangeWarning(
    `${emoji}Update ${sortedDeps.length} ${managerName} dependencies`,
    impactAssessment,
  )
}

export function generateCargoSummaryLogic(
  ctx: InfrastructureSummaryContext,
  prContext: RenovatePRContext,
  impactAssessment: ImpactAssessment,
  dependencies: string[],
): string {
  const emoji = ctx.getEmojiForUpdate(prContext, impactAssessment)
  const sortedDeps = ctx.config.sortDependencies ? [...dependencies].sort() : dependencies

  if (prContext.isSecurityUpdate) {
    return ctx.generateSecurityUpdateSummary('Cargo', sortedDeps, prContext, impactAssessment)
  }

  if (sortedDeps.length === 1) {
    const dependency = sortedDeps[0]
    if (dependency) {
      return ctx.generateSingleDependencySummary(
        'Cargo',
        dependency,
        prContext,
        impactAssessment,
        emoji,
      )
    }
  }

  if (sortedDeps.length <= ctx.config.maxDependenciesToList) {
    return ctx.addBreakingChangeWarning(
      `${emoji}Update Rust crates: ${sortedDeps.map(dep => `\`${dep}\``).join(', ')}`,
      impactAssessment,
    )
  }

  return ctx.addBreakingChangeWarning(
    `${emoji}Update ${sortedDeps.length} Rust crates`,
    impactAssessment,
  )
}

export function generateHelmSummaryLogic(
  ctx: InfrastructureSummaryContext,
  prContext: RenovatePRContext,
  impactAssessment: ImpactAssessment,
  dependencies: string[],
): string {
  const emoji = ctx.getEmojiForUpdate(prContext, impactAssessment)
  const sortedDeps = ctx.config.sortDependencies ? [...dependencies].sort() : dependencies

  if (prContext.isSecurityUpdate) {
    return ctx.generateSecurityUpdateSummary('Helm', sortedDeps, prContext, impactAssessment)
  }

  if (sortedDeps.length === 1) {
    const dep = sortedDeps[0] || ''
    return `${emoji}Update Helm chart \`${dep}\`${getVersionTextForDep(dep, prContext, impactAssessment, ctx.config.includeVersionDetails)}`
  }

  if (sortedDeps.length <= ctx.config.maxDependenciesToList) {
    return `${emoji}Update Helm charts: ${sortedDeps.map(dep => `\`${dep}\``).join(', ')}`
  }

  return `${emoji}Update ${sortedDeps.length} Helm charts`
}

export function generateTerraformSummaryLogic(
  ctx: InfrastructureSummaryContext,
  prContext: RenovatePRContext,
  impactAssessment: ImpactAssessment,
  dependencies: string[],
): string {
  const emoji = ctx.getEmojiForUpdate(prContext, impactAssessment)
  const sortedDeps = ctx.config.sortDependencies ? [...dependencies].sort() : dependencies

  if (prContext.isSecurityUpdate) {
    return ctx.generateSecurityUpdateSummary('Terraform', sortedDeps, prContext, impactAssessment)
  }

  if (sortedDeps.length === 1) {
    const dep = sortedDeps[0] || ''
    return `${emoji}Update Terraform provider \`${dep}\`${getVersionTextForDep(dep, prContext, impactAssessment, ctx.config.includeVersionDetails)}`
  }

  if (sortedDeps.length <= ctx.config.maxDependenciesToList) {
    return `${emoji}Update Terraform providers: ${sortedDeps.map(dep => `\`${dep}\``).join(', ')}`
  }

  return `${emoji}Update ${sortedDeps.length} Terraform providers`
}
