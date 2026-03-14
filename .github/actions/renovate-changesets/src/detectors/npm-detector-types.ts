import type {RenovateManagerType, RenovateUpdateType} from '../renovate-parser.js'

export type NPMDependencyType =
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies'

export interface PackageJson {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  engines?: Record<string, string>
  workspaces?: string[] | {packages: string[]}
  [key: string]: unknown
}

export interface LockFileDependency {
  version: string
  resolved?: string
  integrity?: string
  dependencies?: Record<string, LockFileDependency>
  dev?: boolean
  optional?: boolean
  peer?: boolean
}

export interface PackageLockJson {
  name: string
  version: string
  lockfileVersion: number
  packages: Record<string, LockFileDependency>
  dependencies?: Record<string, LockFileDependency>
}

export interface PnpmLockYaml {
  lockfileVersion: string | number
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  packages: Record<string, unknown>
  specifiers?: Record<string, string>
}

export interface YarnLockEntry {
  version: string
  resolved?: string
  integrity?: string
  dependencies?: Record<string, string>
}

export interface DependencyChange {
  name: string
  packageFile: string
  dependencyType: NPMDependencyType
  currentVersion?: string
  newVersion?: string
  currentResolved?: string
  newResolved?: string
  manager: RenovateManagerType
  updateType: RenovateUpdateType
  semverImpact: SemverImpact
  isSecurityUpdate: boolean
  isWorkspacePackage: boolean
  scope?: string
}

export type SemverImpact = 'major' | 'minor' | 'patch' | 'prerelease' | 'none'

export interface SemverVersion {
  major: number
  minor: number
  patch: number
  prerelease?: string
  build?: string
  original: string
}
