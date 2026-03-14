import type {RenovateUpdateType} from '../renovate-parser.js'
import type {JVMDependencyChange, JVMDependencyType, JVMVersion} from './jvm-detector-types.js'

const VERSION_PROPERTY_PATTERNS = [
  /version$/i,
  /\.version$/i,
  /Version$/,
  /_version$/i,
  /^version\./i,
]

export function mapMavenScopeToJVMType(scope?: string): JVMDependencyType {
  switch (scope) {
    case 'test':
      return 'test'
    case 'provided':
      return 'provided'
    case 'runtime':
      return 'runtime'
    case 'system':
      return 'system'
    default:
      return 'compile'
  }
}

export function mapGradleConfigurationToJVMType(configuration: string): JVMDependencyType {
  switch (configuration) {
    case 'implementation':
    case 'api':
    case 'testImplementation':
    case 'compileOnly':
    case 'runtimeOnly':
    case 'annotationProcessor':
    case 'plugin':
      return configuration
    default:
      return 'compile'
  }
}

export function isVersionProperty(key: string): boolean {
  return VERSION_PROPERTY_PATTERNS.some(pattern => pattern.test(key))
}

export function isPropertyReference(version?: string): boolean {
  return version != null && (version.includes('${') || version.startsWith('$'))
}

export function determineUpdateType(
  currentVersion?: string,
  newVersion?: string,
): RenovateUpdateType {
  if (currentVersion == null || newVersion == null) return 'patch'

  const current = parseJVMVersion(currentVersion)
  const updated = parseJVMVersion(newVersion)

  if (current.major !== updated.major) return 'major'
  if (current.minor !== updated.minor) return 'minor'
  return 'patch'
}

export function calculateSemverImpact(
  currentVersion?: string,
  newVersion?: string,
): 'major' | 'minor' | 'patch' | 'prerelease' | 'none' {
  if (currentVersion == null || newVersion == null || currentVersion === newVersion) return 'none'

  switch (determineUpdateType(currentVersion, newVersion)) {
    case 'major':
      return 'major'
    case 'minor':
      return 'minor'
    default:
      return 'patch'
  }
}

export function deduplicateChanges(changes: JVMDependencyChange[]): JVMDependencyChange[] {
  const seen = new Set<string>()

  return changes.filter(change => {
    const key = `${change.name}:${change.buildFile}:${change.currentVersion}:${change.newVersion}`
    if (seen.has(key)) return false

    seen.add(key)
    return true
  })
}

function parseJVMVersion(version: string): JVMVersion {
  const match = version.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-.](.+))?$/)
  if (match == null) return {}

  const [, major, minor, patch, qualifier] = match

  return {
    major: major == null ? undefined : Number.parseInt(major, 10),
    minor: minor == null ? undefined : Number.parseInt(minor, 10),
    patch: patch == null ? undefined : Number.parseInt(patch, 10),
    qualifier,
  }
}
