import type {RenovateManagerType, RenovateUpdateType} from '../renovate-parser.js'

export interface ActionReference {
  name: string
  ref: string
  uses: string
  line?: number
  stepName?: string
  inlineVersion?: string
}

export interface WorkflowFile {
  name?: string
  on?: unknown
  jobs?: Record<string, WorkflowJob>
  [key: string]: unknown
}

export interface WorkflowJob {
  name?: string
  steps?: WorkflowStep[]
  uses?: string
  [key: string]: unknown
}

export interface WorkflowStep {
  name?: string
  uses?: string
  run?: string
  with?: Record<string, unknown>
  [key: string]: unknown
}

export interface GitHubActionsDependencyChange {
  name: string
  workflowFile: string
  currentRef?: string
  newRef?: string
  manager: RenovateManagerType
  updateType: RenovateUpdateType
  semverImpact: 'major' | 'minor' | 'patch' | 'prerelease' | 'none'
  isSecurityUpdate: boolean
  scope?: string
  stepName?: string
  line?: number
  isReusableWorkflow: boolean
  inlineVersionComment?: string
  baseInlineVersionComment?: string
}

export interface ActionVersion {
  major?: number
  minor?: number
  patch?: number
  prerelease?: string
  build?: string
  original: string
  isCommitSha: boolean
  isBranch: boolean
  isTag: boolean
}
