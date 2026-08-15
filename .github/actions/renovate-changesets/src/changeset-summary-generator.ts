import type {CategorizationResult} from './change-categorization-engine.js'
import type {RenovatePRContext} from './renovate-parser.js'
import type {ImpactAssessment} from './semver-impact-assessor.js'
import type {SummaryGeneratorConfig} from './summary-generator-types.js'

import {DEFAULT_SUMMARY_CONFIG} from './summary-generator-types.js'

export type {SummaryGeneratorConfig}
export {DEFAULT_SUMMARY_CONFIG}

interface GenerateChangesetSummaryOptions {
  config?: Partial<SummaryGeneratorConfig>
  templateEngine?: unknown
  template?: string
}

interface SummaryLabels {
  singular: string
  plural: string
}

const LABELS: Record<string, SummaryLabels> = {
  npm: {singular: 'npm dependency', plural: 'npm dependencies'},
  pnpm: {singular: 'pnpm dependency', plural: 'pnpm dependencies'},
  yarn: {singular: 'Yarn dependency', plural: 'Yarn dependencies'},
  'github-actions': {
    singular: 'GitHub Actions workflow dependency',
    plural: 'GitHub Actions workflow dependencies',
  },
  docker: {singular: 'Docker image', plural: 'Docker images'},
  nuget: {singular: 'NuGet dependency', plural: '.NET packages'},
  composer: {singular: 'Composer dependency', plural: 'PHP dependencies'},
  cargo: {singular: 'Cargo dependency', plural: 'Rust crates'},
  helm: {singular: 'Helm chart', plural: 'Helm charts'},
  terraform: {singular: 'Terraform provider', plural: 'Terraform providers'},
  ansible: {singular: 'Ansible role', plural: 'Ansible roles'},
  'pre-commit': {singular: 'pre-commit hook', plural: 'pre-commit hooks'},
  gitlabci: {singular: 'GitLab CI dependency', plural: 'GitLab CI dependencies'},
  circleci: {singular: 'CircleCI orb', plural: 'CircleCI orbs'},
}

const EMOJIS: Record<string, string> = {
  npm: '📦 ',
  pnpm: '📦 ',
  yarn: '📦 ',
  'github-actions': '⚙️ ',
  docker: '🐳 ',
  dockerfile: '🐳 ',
  'docker-compose': '🐳 ',
  nuget: '💎 ',
  composer: '🐘 ',
  cargo: '🦀 ',
  helm: '⎈ ',
  terraform: '🏗️ ',
  ansible: '🤖 ',
  'pre-commit': '🪝 ',
  gitlabci: '🦊 ',
  circleci: '🔄 ',
}

export async function generateChangesetSummary(
  pr: RenovatePRContext,
  impact: ImpactAssessment,
  _cat: CategorizationResult,
  type: string,
  deps: string[],
  options: GenerateChangesetSummaryOptions = {},
): Promise<string> {
  const config = {...DEFAULT_SUMMARY_CONFIG, ...(options.config ?? {})}
  const sortedDependencies = config.sortDependencies ? [...deps].sort() : deps

  if (options.template != null) {
    return interpolateTemplate(options.template, pr, impact, type, sortedDependencies, config)
  }

  const emoji = getEmoji(pr, impact, config.useEmojis)
  const labels = LABELS[pr.manager] ?? {
    singular: `${type} dependency`,
    plural: `${type} dependencies`,
  }

  let summary: string
  if (pr.isSecurityUpdate) {
    summary = createSecuritySummary(emoji, labels, sortedDependencies, pr, impact, config)
  } else if (pr.isGroupedUpdate) {
    summary = `${emoji}Group update for ${labels.plural}: ${formatDependencies(sortedDependencies)}`
  } else if (sortedDependencies.length === 0) {
    summary = `${emoji}Update ${labels.plural}`
  } else if (sortedDependencies.length === 1) {
    const dependency = sortedDependencies[0] ?? ''
    const versionInfo = pr.dependencies.find(item => item.name === dependency)
    const versionText = config.includeVersionDetails
      ? formatVersionText(
          versionInfo?.currentVersion,
          versionInfo?.newVersion,
          impact.overallImpact,
        )
      : ''
    summary = `${emoji}Update ${labels.singular} \`${dependency}\`${versionText}`
  } else if (sortedDependencies.length <= config.maxDependenciesToList) {
    summary = `${emoji}Update ${labels.plural}: ${formatDependencies(sortedDependencies)}`
  } else {
    summary = `${emoji}Update ${sortedDependencies.length} ${labels.plural}`
  }

  if (impact.hasBreakingChanges && config.includeBreakingChangeWarnings) {
    summary +=
      '\n\n⚠️ **Breaking Changes**: This update includes breaking changes that may require code modifications.'
  }

  return summary
}

function createSecuritySummary(
  emoji: string,
  labels: SummaryLabels,
  dependencies: string[],
  pr: RenovatePRContext,
  impact: ImpactAssessment,
  config: SummaryGeneratorConfig,
): string {
  if (dependencies.length === 0) return `${emoji}Security update for ${labels.plural}`

  const versionInfo =
    dependencies.length === 1
      ? pr.dependencies.find(item => item.name === dependencies[0])
      : undefined
  const versionText =
    dependencies.length === 1 && config.includeVersionDetails
      ? formatVersionText(
          versionInfo?.currentVersion,
          versionInfo?.newVersion,
          impact.overallImpact,
        )
      : ''
  let summary =
    dependencies.length === 1
      ? `${emoji}Security update for ${labels.singular} \`${dependencies[0] ?? ''}\`${versionText}`
      : `${emoji}Security update for ${labels.plural}: ${formatDependencies(dependencies)}`

  if (impact.totalVulnerabilities > 0) {
    const vulnerabilityWord =
      impact.totalVulnerabilities === 1 ? 'vulnerability' : 'vulnerabilities'
    summary += `\n\n🛡️ **Security**: Addresses ${impact.totalVulnerabilities} ${vulnerabilityWord}`
    if (impact.highSeverityVulnerabilities > 0) {
      summary += ` (${impact.highSeverityVulnerabilities} high severity)`
    }
  }

  return summary
}

function interpolateTemplate(
  template: string,
  pr: RenovatePRContext,
  impact: ImpactAssessment,
  type: string,
  dependencies: string[],
  config: SummaryGeneratorConfig,
): string {
  const primaryDependency = pr.dependencies.find(dep => dep.name === dependencies[0])
  const context: Record<string, string> = {
    emoji: getEmoji(pr, impact, config.useEmojis).trim(),
    updateType: type,
    manager: pr.manager === 'unknown' ? type : pr.manager,
    dependencies: dependencies.join(', '),
    version: stripVersionPrefix(primaryDependency?.newVersion ?? ''),
    riskLevel: getRiskLevel(impact.overallRiskScore),
    hasBreakingChanges: String(impact.hasBreakingChanges),
  }

  return template.replaceAll(
    /\{(\w+)\}/gu,
    (placeholder, key: string) => context[key] ?? placeholder,
  )
}

function formatDependencies(dependencies: string[]): string {
  return dependencies.map(dependency => `\`${dependency}\``).join(', ')
}

function getEmoji(pr: RenovatePRContext, impact: ImpactAssessment, enabled: boolean): string {
  if (!enabled) return ''
  if (pr.isSecurityUpdate) return '🔒 '
  if (pr.isGroupedUpdate) return '📦 '
  if (impact.hasBreakingChanges) return '⚠️ '
  return EMOJIS[pr.manager] ?? '📋 '
}

function formatVersionText(
  currentVersion: string | undefined,
  newVersion: string | undefined,
  overallImpact: 'major' | 'minor' | 'patch',
): string {
  if (newVersion == null || /^[0-9a-f]{40}$/iu.test(newVersion)) return ''

  if (overallImpact === 'major') {
    const stripped = stripVersionPrefix(newVersion)
    const majorVersion = stripped.split('.')[0]
    if (majorVersion != null && /^\d+$/u.test(majorVersion)) {
      return stripped === majorVersion
        ? ` to v${majorVersion}`
        : ` to v${majorVersion} (${newVersion})`
    }
  }

  if (currentVersion != null && !/^[0-9a-f]{40}$/iu.test(currentVersion)) {
    return ` from \`${currentVersion}\` to \`${newVersion}\``
  }

  return ` to \`${newVersion}\``
}

function stripVersionPrefix(version: string): string {
  return version.replace(/^v/iu, '')
}

function getRiskLevel(score: number): string {
  if (score >= 80) return 'critical'
  if (score >= 60) return 'high'
  if (score >= 30) return 'medium'
  return 'low'
}
