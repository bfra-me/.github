import type {PRFileInfo, RenovateManagerType} from './renovate-parser-types.js'

const SCOPE_TO_MANAGER: Record<string, RenovateManagerType> = {
  npm: 'npm',
  pnpm: 'pnpm',
  yarn: 'yarn',
  'lock-file': 'lockfile',
  lockfile: 'lockfile',
  'github-actions': 'github-actions',
  actions: 'github-actions',
  docker: 'docker',
  dockerfile: 'dockerfile',
  'docker-compose': 'docker-compose',
  pip: 'pip',
  pipenv: 'pipenv',
  gradle: 'gradle',
  maven: 'maven',
  go: 'go',
  nuget: 'nuget',
  composer: 'composer',
  cargo: 'cargo',
  helm: 'helm',
  terraform: 'terraform',
  ansible: 'ansible',
  'pre-commit': 'pre-commit',
  gitlabci: 'gitlabci',
  circleci: 'circleci',
}

const SUPPORTED_MANAGERS: RenovateManagerType[] = [
  'npm',
  'pnpm',
  'yarn',
  'lockfile',
  'github-actions',
  'docker',
  'dockerfile',
  'docker-compose',
  'pip',
  'pipenv',
  'gradle',
  'maven',
  'go',
  'nuget',
  'composer',
  'cargo',
  'helm',
  'terraform',
  'ansible',
  'pre-commit',
  'gitlabci',
  'circleci',
]

export function detectManagerFromScope(scope?: string): RenovateManagerType {
  if (scope == null || scope.length === 0) return 'unknown'
  return SCOPE_TO_MANAGER[scope.toLowerCase()] ?? 'unknown'
}

export function detectManagerFromCommit(commitMessage: string): RenovateManagerType {
  const messageLower = commitMessage.toLowerCase()

  if (messageLower.includes('package.json') || messageLower.includes('npm')) return 'npm'
  if (messageLower.includes('pnpm-lock.yaml') || messageLower.includes('pnpm')) return 'pnpm'
  if (messageLower.includes('yarn.lock') || messageLower.includes('yarn')) return 'yarn'
  if (messageLower.includes('lock file') || messageLower.includes('lockfile')) return 'lockfile'
  if (messageLower.includes('github action') || messageLower.includes('.github/workflows')) {
    return 'github-actions'
  }
  if (messageLower.includes('dockerfile') || messageLower.includes('docker image')) return 'docker'
  if (messageLower.includes('docker-compose')) return 'docker-compose'
  if (messageLower.includes('requirements.txt') || messageLower.includes('pip')) return 'pip'
  if (messageLower.includes('pipfile') || messageLower.includes('pipenv')) return 'pipenv'
  if (messageLower.includes('build.gradle') || messageLower.includes('gradle')) return 'gradle'
  if (messageLower.includes('pom.xml') || messageLower.includes('maven')) return 'maven'
  if (messageLower.includes('go.mod') || messageLower.includes('go module')) return 'go'
  if (messageLower.includes('.csproj') || messageLower.includes('nuget')) return 'nuget'
  if (messageLower.includes('composer.json') || messageLower.includes('composer')) return 'composer'
  if (messageLower.includes('cargo.toml') || messageLower.includes('cargo')) return 'cargo'
  if (messageLower.includes('chart.yaml') || messageLower.includes('helm')) return 'helm'
  if (messageLower.includes('.tf') || messageLower.includes('terraform')) return 'terraform'
  if (messageLower.includes('ansible')) return 'ansible'
  if (messageLower.includes('pre-commit')) return 'pre-commit'
  if (messageLower.includes('.gitlab-ci.yml')) return 'gitlabci'
  if (messageLower.includes('circle')) return 'circleci'

  return 'unknown'
}

export function detectManagerFromFilename(filename: string): RenovateManagerType {
  const filenameLower = filename.toLowerCase()

  if (filenameLower.includes('package.json')) return 'npm'
  if (filenameLower.includes('pnpm-lock.yaml')) return 'pnpm'
  if (filenameLower.includes('yarn.lock')) return 'yarn'
  if (filenameLower.includes('package-lock.json')) return 'lockfile'
  if (filenameLower.includes('.github/workflows/')) return 'github-actions'
  if (filenameLower.includes('dockerfile')) return 'dockerfile'
  if (filenameLower.includes('docker-compose')) return 'docker-compose'
  if (filenameLower.includes('requirements.txt') || filenameLower.includes('.py')) return 'pip'
  if (filenameLower.includes('pipfile')) return 'pipenv'
  if (filenameLower.includes('build.gradle') || filenameLower.includes('.gradle')) return 'gradle'
  if (filenameLower.includes('pom.xml')) return 'maven'
  if (filenameLower.includes('go.mod') || filenameLower.includes('go.sum')) return 'go'
  if (filenameLower.includes('.csproj') || filenameLower.includes('.nuspec')) return 'nuget'
  if (filenameLower.includes('composer.json')) return 'composer'
  if (filenameLower.includes('cargo.toml') || filenameLower.includes('cargo.lock')) return 'cargo'
  if (filenameLower.includes('chart.yaml') || filenameLower.includes('values.yaml')) return 'helm'
  if (filenameLower.includes('.tf') || filenameLower.includes('.hcl')) return 'terraform'
  if (filenameLower.includes('ansible')) return 'ansible'
  if (filenameLower.includes('.pre-commit-config.yaml')) return 'pre-commit'
  if (filenameLower.includes('.gitlab-ci.yml')) return 'gitlabci'
  if (filenameLower.includes('.circleci/config.yml')) return 'circleci'

  return 'unknown'
}

export function detectManagerFromFiles(files: PRFileInfo[]): RenovateManagerType {
  const counts = new Map<RenovateManagerType, number>()

  for (const file of files) {
    const manager = detectManagerFromFilename(file.filename)
    if (manager !== 'unknown') {
      counts.set(manager, (counts.get(manager) ?? 0) + 1)
    }
  }

  let selected: RenovateManagerType = 'unknown'
  let maxCount = 0

  for (const [manager, count] of counts.entries()) {
    if (count > maxCount) {
      selected = manager
      maxCount = count
    }
  }

  return selected
}

export function detectManagerFromDependencyName(name: string): RenovateManagerType | undefined {
  if (name.startsWith('@types/')) return 'npm'
  if (name.startsWith('@')) return 'npm'
  if (name.includes('/')) return name.includes(':') ? 'docker' : undefined
  return undefined
}

export function getSupportedManagers(): RenovateManagerType[] {
  return [...SUPPORTED_MANAGERS]
}
