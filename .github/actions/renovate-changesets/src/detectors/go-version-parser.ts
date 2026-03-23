import type {RenovateUpdateType} from '../renovate-parser.js'

export function determineUpdateType(
  currentVersion?: string,
  newVersion?: string,
): RenovateUpdateType {
  if (!currentVersion || !newVersion) return 'patch'

  const currentParts = parseGoVersion(currentVersion)
  const newParts = parseGoVersion(newVersion)

  if (currentParts.major !== newParts.major) return 'major'
  if (currentParts.minor !== newParts.minor) return 'minor'
  if (currentParts.patch !== newParts.patch) return 'patch'

  return 'patch'
}

export function parseGoVersion(version: string): {
  major: number
  minor: number
  patch: number
  prerelease?: string
} {
  const cleanVersion = version.startsWith('v') ? version.slice(1) : version
  const match = cleanVersion.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/)

  if (match) {
    const [, major, minor, patch, prerelease] = match
    if (major && minor && patch) {
      return {
        major: Number.parseInt(major, 10),
        minor: Number.parseInt(minor, 10),
        patch: Number.parseInt(patch, 10),
        prerelease,
      }
    }
  }

  return {major: 0, minor: 0, patch: 0}
}

export function calculateSemverImpact(
  currentVersion?: string,
  newVersion?: string,
): 'major' | 'minor' | 'patch' | 'prerelease' | 'none' {
  if (!currentVersion || !newVersion) return 'none'

  const updateType = determineUpdateType(currentVersion, newVersion)

  switch (updateType) {
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
