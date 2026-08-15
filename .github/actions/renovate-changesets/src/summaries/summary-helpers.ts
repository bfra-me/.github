import type {RenovateManagerType, RenovatePRContext} from '../renovate-parser'
import type {ImpactAssessment} from '../semver-impact-assessor'

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export function getEmojiForUpdate(
  prContext: RenovatePRContext,
  impactAssessment: ImpactAssessment,
  useEmojis: boolean,
): string {
  if (!useEmojis) return ''
  if (prContext.isSecurityUpdate) return '🔒 '
  if (prContext.isGroupedUpdate) return '📦 '
  if (impactAssessment.hasBreakingChanges) return '⚠️ '

  switch (prContext.manager) {
    case 'npm':
    case 'pnpm':
    case 'yarn':
      return '📦 '
    case 'github-actions':
      return '⚙️ '
    case 'docker':
    case 'dockerfile':
    case 'docker-compose':
      return '🐳 '
    case 'nuget':
      return '💎 '
    case 'composer':
      return '🐘 '
    case 'cargo':
      return '🦀 '
    case 'helm':
      return '⎈ '
    case 'terraform':
      return '🏗️ '
    case 'ansible':
      return '🤖 '
    case 'pre-commit':
      return '🪝 '
    case 'gitlabci':
      return '🦊 '
    case 'circleci':
      return '🔄 '
    default:
      return '📋 '
  }
}

export function getEcosystemName(manager: RenovateManagerType | string): string {
  const ecosystemMap: Record<string, string> = {
    npm: 'node',
    pnpm: 'node',
    yarn: 'node',
    'github-actions': 'github',
    docker: 'container',
    cargo: 'rust',
    nuget: 'dotnet',
    composer: 'php',
  }
  return ecosystemMap[manager] || 'unknown'
}

export function getPackageManagerDisplayName(manager: RenovateManagerType | string): string {
  const displayNames: Record<string, string> = {
    npm: 'npm',
    pnpm: 'pnpm',
    yarn: 'Yarn',
    'github-actions': 'GitHub Actions',
    docker: 'Docker',
    cargo: 'Cargo',
    nuget: 'NuGet',
    composer: 'Composer',
  }
  return displayNames[manager] || manager
}

export function determineRiskLevel(impactAssessment: ImpactAssessment): RiskLevel {
  if (impactAssessment.overallRiskScore >= 80) return 'critical'
  if (impactAssessment.overallRiskScore >= 60) return 'high'
  if (impactAssessment.overallRiskScore >= 30) return 'medium'
  return 'low'
}

function isCommitSha(version: string): boolean {
  return /^[0-9a-f]{40}$/i.test(version)
}

export function formatVersionText(
  currentVersion: string | undefined,
  newVersion: string | undefined,
  overallImpact: 'major' | 'minor' | 'patch',
  includeDetails: boolean,
): string {
  if (!includeDetails || newVersion == null) return ''
  if (isCommitSha(newVersion)) return ''

  if (overallImpact === 'major') {
    const stripped = newVersion.replace(/^v/i, '')
    const majorVersion = stripped.split('.')[0]
    if (majorVersion != null && /^\d+$/.test(majorVersion)) {
      // Omit the redundant parenthetical when the full version is just the major digit
      // e.g. `to v4` instead of `to v4 (4)` for major-only versions like `v4`
      if (stripped === majorVersion) return ` to v${majorVersion}`
      return ` to v${majorVersion} (${newVersion})`
    }
    return ` to \`${newVersion}\``
  }

  if (currentVersion != null && !isCommitSha(currentVersion)) {
    return ` from \`${currentVersion}\` to \`${newVersion}\``
  }

  return ` to \`${newVersion}\``
}
