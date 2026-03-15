import type {RenovateUpdateType} from '../renovate-parser.js'
import type {DependencyChange, SemverImpact, SemverVersion} from './npm-detector-types.js'

const SEMVER_IMPACTS: SemverImpact[] = ['none', 'patch', 'prerelease', 'minor', 'major']
const SEMVER_REGEX = /^(\d+)\.(\d+)\.(\d+)(?:-([a-z0-9.-]+))?(?:\+([a-z0-9.-]+))?$/i

export function determineUpdateType(
  currentVersion?: string,
  newVersion?: string,
): RenovateUpdateType {
  if (currentVersion == null || newVersion == null || newVersion === currentVersion) return 'patch'
  if (isDigestUpdate(currentVersion, newVersion)) return 'digest'
  if (isPinUpdate(currentVersion, newVersion)) return 'pin'

  switch (calculateSemverImpact(currentVersion, newVersion)) {
    case 'major':
      return 'major'
    case 'minor':
      return 'minor'
    default:
      return 'patch'
  }
}

export function calculateSemverImpact(currentVersion?: string, newVersion?: string): SemverImpact {
  if (currentVersion == null || newVersion == null || currentVersion === newVersion) return 'none'

  const currentSemver = parseSemver(currentVersion)
  const nextSemver = parseSemver(newVersion)

  if (currentSemver == null || nextSemver == null) return 'patch'
  if (nextSemver.prerelease != null && currentSemver.prerelease == null) return 'prerelease'
  if (nextSemver.major !== currentSemver.major) return 'major'
  if (nextSemver.minor !== currentSemver.minor) return 'minor'
  if (nextSemver.patch !== currentSemver.patch) return 'patch'
  if (currentSemver.prerelease !== nextSemver.prerelease) return 'prerelease'

  return 'none'
}

export function isWorkspacePackage(name: string): boolean {
  return name.startsWith('@') && !name.includes('/')
}

export function extractScope(name: string): string | undefined {
  if (!name.startsWith('@')) return undefined
  return name.split('/')[0]?.slice(1)
}

export function deduplicateChanges(changes: DependencyChange[]): DependencyChange[] {
  const seen = new Map<string, DependencyChange>()

  for (const change of changes) {
    const key = `${change.name}:${change.packageFile}`
    const existing = seen.get(key)

    if (existing == null) {
      seen.set(key, change)
      continue
    }

    existing.currentVersion ??= change.currentVersion
    existing.newVersion ??= change.newVersion
    existing.currentResolved ??= change.currentResolved
    existing.newResolved ??= change.newResolved
    existing.isSecurityUpdate ||= change.isSecurityUpdate

    if (
      SEMVER_IMPACTS.indexOf(change.semverImpact) > SEMVER_IMPACTS.indexOf(existing.semverImpact)
    ) {
      existing.semverImpact = change.semverImpact
      existing.updateType = change.updateType
    }
  }

  return [...seen.values()]
}

function parseSemver(version: string): SemverVersion | null {
  const cleanVersion = version.replace(/^[~^>=<v]?/, '').split(' ')[0]
  if (cleanVersion == null || cleanVersion.length === 0) return null

  const match = cleanVersion.match(SEMVER_REGEX)
  const [majorStr, minorStr, patchStr] = match?.slice(1, 4) ?? []

  if (majorStr == null || minorStr == null || patchStr == null) return null

  return {
    major: Number.parseInt(majorStr, 10),
    minor: Number.parseInt(minorStr, 10),
    patch: Number.parseInt(patchStr, 10),
    prerelease: match?.[4],
    build: match?.[5],
    original: version,
  }
}

function isDigestUpdate(currentVersion: string, newVersion: string): boolean {
  return /^[a-f0-9]{7,}$/i.test(currentVersion) && /^[a-f0-9]{7,}$/i.test(newVersion)
}

function isPinUpdate(currentVersion: string, newVersion: string): boolean {
  return /^[~^>=<]/.test(currentVersion) && /^\d+\.\d+\.\d+/.test(newVersion)
}
