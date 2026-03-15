import type {RenovateManagerType, RenovateUpdateType} from '../renovate-parser.js'
import type {
  PythonDependencyChange,
  PythonDependencyType,
  PythonVersion,
} from './python-detector-types.js'
import path from 'node:path'

interface PythonChangeDetails {
  name: string
  packageFile: string
  dependencyType: PythonDependencyType
  currentVersion?: string
  newVersion?: string
  currentSpec?: string
  newSpec?: string
  manager: string
  isEditable?: boolean
  scope?: string
  line?: number
  extras?: string[]
  markers?: string
  isExtra?: boolean
  groupName?: string
}

export function determineDependencyType(filename: string): PythonDependencyType {
  const basename = path.basename(filename).toLowerCase()
  if (basename.includes('dev')) return 'dev'
  if (basename.includes('test')) return 'test'
  if (basename.includes('docs')) return 'docs'
  if (basename.includes('lint')) return 'lint'
  return 'main'
}

export function cleanVersion(version?: string): string | undefined {
  if (version == null || version.trim().length === 0) return undefined
  return version.replace(/^[><=!~]+/, '').trim()
}

export function determineUpdateType(
  currentVersion?: string,
  newVersion?: string,
): RenovateUpdateType {
  if (currentVersion == null || newVersion == null) return 'patch'

  const current = parsePythonVersion(currentVersion)
  const updated = parsePythonVersion(newVersion)
  if (current.major !== updated.major) return 'major'
  if (current.minor !== updated.minor) return 'minor'
  if (current.patch !== updated.patch) return 'patch'
  if (current.isPrerelease !== updated.isPrerelease) return 'patch'
  if (current.isDevelopment !== updated.isDevelopment) return 'patch'
  return 'patch'
}

export function calculateSemverImpact(
  currentVersion?: string,
  newVersion?: string,
): PythonDependencyChange['semverImpact'] {
  if (currentVersion == null || newVersion == null) return 'none'

  switch (determineUpdateType(currentVersion, newVersion)) {
    case 'major':
      return 'major'
    case 'minor':
      return 'minor'
    case 'patch':
      return 'patch'
    default:
      return 'none'
  }
}

export function isSecurityUpdate(): boolean {
  return false
}

export function createPythonChange(details: PythonChangeDetails): PythonDependencyChange {
  const currentVersion = cleanVersion(details.currentVersion)
  const newVersion = cleanVersion(details.newVersion)

  return {
    name: details.name,
    packageFile: details.packageFile,
    dependencyType: details.dependencyType,
    currentVersion,
    newVersion,
    currentSpec: details.currentSpec,
    newSpec: details.newSpec,
    manager: details.manager as RenovateManagerType,
    updateType: determineUpdateType(currentVersion, newVersion),
    semverImpact: calculateSemverImpact(currentVersion, newVersion),
    isSecurityUpdate: isSecurityUpdate(),
    isEditable: details.isEditable ?? false,
    scope: details.scope,
    line: details.line,
    extras: details.extras,
    markers: details.markers,
    isExtra: details.isExtra ?? false,
    groupName: details.groupName,
  }
}

export function deduplicateChanges(changes: PythonDependencyChange[]): PythonDependencyChange[] {
  const seen = new Set<string>()

  return changes.filter(change => {
    const key = `${change.name}:${change.packageFile}:${change.currentVersion}:${change.newVersion}`
    if (seen.has(key)) return false

    seen.add(key)
    return true
  })
}

function parsePythonVersion(version: string): PythonVersion {
  const normalizedVersion = cleanVersion(version) ?? version
  const result: PythonVersion = {
    original: version,
    isPrerelease: false,
    isDevelopment: false,
    isLocal: false,
  }
  const match = normalizedVersion.match(
    /^(?:(\d+):)?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(post|dev)(\d+))?(?:(a|b|rc)(\d+))?(?:\+(.+))?$/,
  )
  if (match == null) return result

  const [, epoch, major, minor, patch, postDev, postDevNum, preType, preNum, local] = match
  if (epoch != null) result.epoch = Number.parseInt(epoch, 10)
  if (major != null) result.major = Number.parseInt(major, 10)
  if (minor != null) result.minor = Number.parseInt(minor, 10)
  if (patch != null) {
    result.patch = Number.parseInt(patch, 10)
    result.micro = result.patch
  }
  if (postDev === 'post' && postDevNum != null) result.post = Number.parseInt(postDevNum, 10)
  if (postDev === 'dev' && postDevNum != null) {
    result.dev = Number.parseInt(postDevNum, 10)
    result.isDevelopment = true
  }
  if (preType != null && preNum != null) {
    result.pre = {type: preType as 'a' | 'b' | 'rc', number: Number.parseInt(preNum, 10)}
    result.isPrerelease = true
  }
  if (local != null) {
    result.local = local
    result.isLocal = true
  }

  return result
}
