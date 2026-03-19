import type {RenovatePRContext} from '../renovate-parser'
import type {ImpactAssessment} from '../semver-impact-assessor'
import type {SummaryGeneratorConfig} from '../summary-generator-types'

import {formatVersionText} from './summary-helpers'

export interface CiSummaryContext {
  config: Pick<
    SummaryGeneratorConfig,
    'includeVersionDetails' | 'maxDependenciesToList' | 'sortDependencies'
  >
  generateSecurityUpdateSummary: (
    managerType: string,
    dependencies: string[],
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
  ) => string
  getEmojiForUpdate: (prContext: RenovatePRContext, impactAssessment: ImpactAssessment) => string
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

export function generateAnsibleSummaryLogic(
  ctx: CiSummaryContext,
  prContext: RenovatePRContext,
  impactAssessment: ImpactAssessment,
  dependencies: string[],
): string {
  const emoji = ctx.getEmojiForUpdate(prContext, impactAssessment)
  const sortedDeps = ctx.config.sortDependencies ? [...dependencies].sort() : dependencies

  if (prContext.isSecurityUpdate) {
    return ctx.generateSecurityUpdateSummary('Ansible', sortedDeps, prContext, impactAssessment)
  }

  if (sortedDeps.length === 1) {
    const dep = sortedDeps[0] || ''
    return `${emoji}Update Ansible role \`${dep}\`${getVersionTextForDep(dep, prContext, impactAssessment, ctx.config.includeVersionDetails)}`
  }

  if (sortedDeps.length <= ctx.config.maxDependenciesToList) {
    return `${emoji}Update Ansible roles: ${sortedDeps.map(dep => `\`${dep}\``).join(', ')}`
  }

  return `${emoji}Update ${sortedDeps.length} Ansible roles`
}

export function generatePreCommitSummaryLogic(
  ctx: CiSummaryContext,
  prContext: RenovatePRContext,
  impactAssessment: ImpactAssessment,
  dependencies: string[],
): string {
  const emoji = ctx.getEmojiForUpdate(prContext, impactAssessment)
  const sortedDeps = ctx.config.sortDependencies ? [...dependencies].sort() : dependencies

  if (prContext.isSecurityUpdate) {
    return ctx.generateSecurityUpdateSummary('pre-commit', sortedDeps, prContext, impactAssessment)
  }

  if (sortedDeps.length === 1) {
    const dep = sortedDeps[0] || ''
    return `${emoji}Update pre-commit hook \`${dep}\`${getVersionTextForDep(dep, prContext, impactAssessment, ctx.config.includeVersionDetails)}`
  }

  if (sortedDeps.length <= ctx.config.maxDependenciesToList) {
    return `${emoji}Update pre-commit hooks: ${sortedDeps.map(dep => `\`${dep}\``).join(', ')}`
  }

  return `${emoji}Update ${sortedDeps.length} pre-commit hooks`
}

export function generateGitLabCISummaryLogic(
  ctx: CiSummaryContext,
  prContext: RenovatePRContext,
  impactAssessment: ImpactAssessment,
  dependencies: string[],
): string {
  const emoji = ctx.getEmojiForUpdate(prContext, impactAssessment)
  const sortedDeps = ctx.config.sortDependencies ? [...dependencies].sort() : dependencies

  if (prContext.isSecurityUpdate) {
    return ctx.generateSecurityUpdateSummary('GitLab CI', sortedDeps, prContext, impactAssessment)
  }

  if (sortedDeps.length === 1) {
    const dep = sortedDeps[0] || ''
    return `${emoji}Update GitLab CI dependency \`${dep}\`${getVersionTextForDep(dep, prContext, impactAssessment, ctx.config.includeVersionDetails)}`
  }

  if (sortedDeps.length <= ctx.config.maxDependenciesToList) {
    return `${emoji}Update GitLab CI dependencies: ${sortedDeps.map(dep => `\`${dep}\``).join(', ')}`
  }

  return `${emoji}Update ${sortedDeps.length} GitLab CI dependencies`
}

export function generateCircleCISummaryLogic(
  ctx: CiSummaryContext,
  prContext: RenovatePRContext,
  impactAssessment: ImpactAssessment,
  dependencies: string[],
): string {
  const emoji = ctx.getEmojiForUpdate(prContext, impactAssessment)
  const sortedDeps = ctx.config.sortDependencies ? [...dependencies].sort() : dependencies

  if (prContext.isSecurityUpdate) {
    return ctx.generateSecurityUpdateSummary('CircleCI', sortedDeps, prContext, impactAssessment)
  }

  if (sortedDeps.length === 1) {
    const dep = sortedDeps[0] || ''
    return `${emoji}Update CircleCI orb \`${dep}\`${getVersionTextForDep(dep, prContext, impactAssessment, ctx.config.includeVersionDetails)}`
  }

  if (sortedDeps.length <= ctx.config.maxDependenciesToList) {
    return `${emoji}Update CircleCI orbs: ${sortedDeps.map(dep => `\`${dep}\``).join(', ')}`
  }

  return `${emoji}Update ${sortedDeps.length} CircleCI orbs`
}
