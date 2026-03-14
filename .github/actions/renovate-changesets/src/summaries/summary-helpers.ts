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
    case 'pip':
    case 'pipenv':
      return '🐍 '
    case 'gradle':
    case 'maven':
      return '☕ '
    case 'go':
      return '🐹 '
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
    pip: 'python',
    poetry: 'python',
    pipenv: 'python',
    maven: 'jvm',
    gradle: 'jvm',
    cargo: 'rust',
    nuget: 'dotnet',
    composer: 'php',
    gomod: 'go',
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
    pip: 'pip',
    poetry: 'Poetry',
    pipenv: 'Pipenv',
    maven: 'Maven',
    gradle: 'Gradle',
    cargo: 'Cargo',
    nuget: 'NuGet',
    composer: 'Composer',
    gomod: 'Go modules',
  }
  return displayNames[manager] || manager
}

export function getJvmManagerDisplayName(manager: string): string {
  switch (manager) {
    case 'gradle':
      return 'Gradle'
    case 'maven':
      return 'Maven'
    case 'sbt':
      return 'SBT'
    case 'gradle-wrapper':
      return 'Gradle Wrapper'
    default:
      return 'JVM'
  }
}

export function getPythonManagerDisplayName(manager: string): string {
  switch (manager) {
    case 'pip':
      return 'pip'
    case 'pipenv':
      return 'Pipenv'
    case 'poetry':
      return 'Poetry'
    case 'setuptools':
      return 'setuptools'
    case 'pip-compile':
      return 'pip-compile'
    case 'pip_setup':
      return 'pip'
    default:
      return 'Python'
  }
}

export function determineRiskLevel(impactAssessment: ImpactAssessment): RiskLevel {
  if (impactAssessment.overallRiskScore >= 80) return 'critical'
  if (impactAssessment.overallRiskScore >= 60) return 'high'
  if (impactAssessment.overallRiskScore >= 30) return 'medium'
  return 'low'
}
