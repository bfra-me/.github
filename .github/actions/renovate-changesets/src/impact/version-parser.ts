import type {SemverInfo, VersionChange} from './impact-types'

export function parseVersion(version?: string): SemverInfo {
  if (!version) {
    return {
      major: 0,
      minor: 0,
      patch: 0,
      raw: '',
      isValid: false,
    }
  }

  const cleanVersion = version.replace(/^[v^~>=<]+/, '').trim()
  const semverRegex =
    /^(\d+)\.(\d+)\.(\d+)(?:-([a-z\d-]+(?:\.[a-z\d-]+)*))?(?:\+([a-z\d-]+(?:\.[a-z\d-]+)*))?$/i
  const match = cleanVersion.match(semverRegex)

  if (!match?.[1] || !match?.[2] || !match?.[3]) {
    const partialMatch = cleanVersion.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/)
    if (partialMatch?.[1]) {
      return {
        major: Number.parseInt(partialMatch[1], 10),
        minor: Number.parseInt(partialMatch[2] || '0', 10),
        patch: Number.parseInt(partialMatch[3] || '0', 10),
        raw: version,
        isValid: true,
      }
    }

    return {
      major: 0,
      minor: 0,
      patch: 0,
      raw: version,
      isValid: false,
    }
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4],
    build: match[5],
    raw: version,
    isValid: true,
  }
}

export function determineVersionChange(
  currentVersion: SemverInfo,
  newVersion: SemverInfo,
): VersionChange {
  if (!currentVersion.isValid || !newVersion.isValid) {
    return 'unknown'
  }

  if (
    currentVersion.major === newVersion.major &&
    currentVersion.minor === newVersion.minor &&
    currentVersion.patch === newVersion.patch
  ) {
    if (currentVersion.prerelease !== newVersion.prerelease) {
      return 'prerelease'
    }
    return 'none'
  }

  if (currentVersion.major !== newVersion.major) {
    return 'major'
  }

  if (currentVersion.minor !== newVersion.minor) {
    return 'minor'
  }

  if (currentVersion.patch !== newVersion.patch) {
    return 'patch'
  }

  return 'prerelease'
}

export function determineStableReleaseImpact(
  prereleaseVersion: SemverInfo,
  stableVersion: SemverInfo,
): 'major' | 'minor' | 'patch' {
  if (prereleaseVersion.major !== stableVersion.major) {
    return 'major'
  }
  if (prereleaseVersion.minor !== stableVersion.minor) {
    return 'minor'
  }
  return 'patch'
}
