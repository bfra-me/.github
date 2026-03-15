type DockerSemverImpact = 'major' | 'minor' | 'patch' | 'prerelease' | 'none'

interface DockerVersion {
  major?: number
  minor?: number
  patch?: number
  prerelease?: string
  build?: string
  original: string
  isDigest: boolean
  isLatest: boolean
  isNumeric: boolean
}

export function isDigest(tag?: string): boolean {
  return tag?.startsWith('sha256:') ?? false
}

export function calculateSemverImpact(oldTag?: string, newTag?: string): DockerSemverImpact {
  if (oldTag == null || newTag == null) {
    return 'none'
  }

  if (isDigest(oldTag) || isDigest(newTag)) {
    return 'patch'
  }

  const oldVersion = parseDockerVersion(oldTag)
  const newVersion = parseDockerVersion(newTag)
  if (!oldVersion.isNumeric || !newVersion.isNumeric) {
    return heuristicVersionImpact(oldTag, newTag)
  }

  if (oldVersion.major != null && newVersion.major != null && newVersion.major > oldVersion.major) {
    return 'major'
  }

  if (oldVersion.minor != null && newVersion.minor != null && newVersion.minor > oldVersion.minor) {
    return 'minor'
  }

  if (oldVersion.patch != null && newVersion.patch != null && newVersion.patch > oldVersion.patch) {
    return 'patch'
  }

  if (newVersion.prerelease != null && oldVersion.prerelease == null) return 'prerelease'
  if (newVersion.prerelease == null && oldVersion.prerelease != null) return 'patch'
  return 'none'
}

function parseDockerVersion(tag: string): DockerVersion {
  let cleanTag = tag.replace(/^v/, '')
  const suffixMatch = cleanTag.match(/^([^-]+)(?:-.*)?$/)
  if (suffixMatch?.[1] != null) {
    cleanTag = suffixMatch[1]
  }

  const semverMatch = cleanTag.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([^+]+))?(?:\+(.*))?$/)
  if (semverMatch?.[1] != null) {
    return {
      major: Number.parseInt(semverMatch[1], 10),
      minor: semverMatch[2] == null ? undefined : Number.parseInt(semverMatch[2], 10),
      patch: semverMatch[3] == null ? undefined : Number.parseInt(semverMatch[3], 10),
      prerelease: semverMatch[4],
      build: semverMatch[5],
      original: tag,
      isDigest: false,
      isLatest: tag === 'latest',
      isNumeric: true,
    }
  }

  return {original: tag, isDigest: isDigest(tag), isLatest: tag === 'latest', isNumeric: false}
}

function heuristicVersionImpact(oldTag: string, newTag: string): 'major' | 'minor' | 'patch' {
  if (newTag === 'latest') {
    return 'minor'
  }

  for (const pattern of [/(\d+)$/, /-(\d+)$/] as const) {
    const oldMatch = oldTag.match(pattern)
    const newMatch = newTag.match(pattern)
    if (oldMatch == null || newMatch == null) {
      continue
    }

    const oldVersion = Number.parseInt(oldMatch[1] ?? oldMatch[0], 10)
    const newVersion = Number.parseInt(newMatch[1] ?? newMatch[0], 10)
    if (newVersion > oldVersion) {
      return newVersion - oldVersion >= 2 ? 'major' : 'minor'
    }
  }

  return 'patch'
}
