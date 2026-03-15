import type {RenovateManagerType, RenovateUpdateType} from '../renovate-parser.js'

export type PythonDependencyType = 'main' | 'dev' | 'optional' | 'extras' | 'test' | 'docs' | 'lint'

export interface RequirementsEntry {
  name: string
  version?: string
  operator?: string
  extras?: string[]
  markers?: string
  line: number
  raw: string
  isEditable: boolean
  url?: string
  comment?: string
}

export interface PipfilePackageSpecObject {
  version?: string
  extras?: string[]
  editable?: boolean
  [key: string]: unknown
}

export type PipfilePackageSpec = string | PipfilePackageSpecObject

export interface Pipfile {
  source?: {
    name?: string
    url?: string
    verify_ssl?: boolean
  }[]
  packages?: Record<string, PipfilePackageSpec>
  'dev-packages'?: Record<string, PipfilePackageSpec>
  requires?: {
    python_version?: string
    python_full_version?: string
  }
  [key: string]: unknown
}

export interface PipfileLockEntry {
  hashes?: string[]
  index?: string
  version?: string
  markers?: string
  extras?: string[]
}

export interface PipfileLock {
  _meta?: {
    hash?: {sha256?: string}
    pipfile_spec?: number
    requires?: {python_version?: string}
    sources?: {name?: string; url?: string; verify_ssl?: boolean}[]
  }
  default?: Record<string, PipfileLockEntry>
  develop?: Record<string, PipfileLockEntry>
}

export interface PythonDependencyChange {
  name: string
  packageFile: string
  dependencyType: PythonDependencyType
  currentVersion?: string
  newVersion?: string
  currentSpec?: string
  newSpec?: string
  manager: RenovateManagerType
  updateType: RenovateUpdateType
  semverImpact: 'major' | 'minor' | 'patch' | 'prerelease' | 'none'
  isSecurityUpdate: boolean
  isEditable: boolean
  scope?: string
  line?: number
  extras?: string[]
  markers?: string
  isExtra: boolean
  groupName?: string
}

export interface PythonVersion {
  major?: number
  minor?: number
  patch?: number
  micro?: number
  dev?: number
  pre?: {type: 'a' | 'b' | 'rc'; number: number}
  post?: number
  epoch?: number
  local?: string
  original: string
  isPrerelease: boolean
  isDevelopment: boolean
  isLocal: boolean
}
