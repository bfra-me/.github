export type RenovateManagerType =
  | 'npm'
  | 'pnpm'
  | 'yarn'
  | 'lockfile'
  | 'github-actions'
  | 'docker'
  | 'dockerfile'
  | 'docker-compose'
  | 'pip'
  | 'pipenv'
  | 'gradle'
  | 'maven'
  | 'go'
  | 'nuget'
  | 'composer'
  | 'cargo'
  | 'helm'
  | 'terraform'
  | 'ansible'
  | 'pre-commit'
  | 'gitlabci'
  | 'circleci'
  | 'unknown'

export type RenovateUpdateType =
  | 'major'
  | 'minor'
  | 'patch'
  | 'pin'
  | 'digest'
  | 'lockfile'
  | 'rollback'
  | 'replacement'

export type RenovateSecurityType = 'low' | 'moderate' | 'high' | 'critical' | null

export interface RenovateDependency {
  name: string
  currentVersion?: string
  newVersion?: string
  manager: RenovateManagerType
  updateType: RenovateUpdateType
  isSecurityUpdate: boolean
  securitySeverity?: RenovateSecurityType
  isGrouped: boolean
  groupName?: string
  packageFile?: string
  scope?: string
}

export interface PRFileInfo {
  filename: string
  status: string
  additions?: number
  deletions?: number
}

export interface RenovatePRContext {
  dependencies: RenovateDependency[]
  isRenovateBot: boolean
  branchName: string
  prTitle: string
  prBody: string
  commitMessages: string[]
  isGroupedUpdate: boolean
  isSecurityUpdate: boolean
  updateType: RenovateUpdateType
  manager: RenovateManagerType
  files: {filename: string; status: string; additions: number; deletions: number}[]
}

export interface ConventionalCommit {
  type: string
  scope?: string
  description: string
  body?: string
  footer?: string
  isBreaking: boolean
  renovateInfo?: {
    manager: RenovateManagerType
    dependencies: string[]
    updateType: RenovateUpdateType
  }
}

export interface BranchPatterns {
  renovate: string[]
  dependabot: string[]
  custom: string[]
}
