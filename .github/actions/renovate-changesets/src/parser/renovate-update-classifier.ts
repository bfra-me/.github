import type {RenovateSecurityType, RenovateUpdateType} from './renovate-parser-types.js'

export function detectUpdateTypeFromCommit(commitMessage: string): RenovateUpdateType {
  const messageLower = commitMessage.toLowerCase()

  if (messageLower.includes('major')) return 'major'
  if (messageLower.includes('minor')) return 'minor'
  if (messageLower.includes('patch')) return 'patch'
  if (messageLower.includes('pin')) return 'pin'
  if (messageLower.includes('digest')) return 'digest'
  if (messageLower.includes('lock') || messageLower.includes('lockfile')) return 'lockfile'
  if (messageLower.includes('rollback') || messageLower.includes('revert')) return 'rollback'
  if (messageLower.includes('replace')) return 'replacement'

  return 'patch'
}

export function detectUpdateTypeFromVersions(
  version1?: string,
  version2?: string,
): RenovateUpdateType {
  if (version1 == null || version2 == null) return 'patch'

  const oldVer = parseVersion(version1)
  const newVer = parseVersion(version2)

  if (oldVer == null || newVer == null) return 'patch'
  if (newVer.major > oldVer.major) return 'major'
  if (newVer.minor > oldVer.minor) return 'minor'
  return 'patch'
}

export function isSecurityUpdate(text: string): boolean {
  const textLower = text.toLowerCase()
  return [
    'security',
    'vulnerability',
    'cve-',
    'exploit',
    'malicious',
    'advisory',
    'critical',
    'high severity',
  ].some(indicator => textLower.includes(indicator))
}

export function isGroupedUpdate(text: string): boolean {
  const textLower = text.toLowerCase()
  return ['group', 'multiple', 'batch', 'bundle', 'all dependencies', 'dependency group'].some(
    indicator => textLower.includes(indicator),
  )
}

export function extractGroupName(text: string): string | undefined {
  return text.match(/group[:\s]+([\w\s-]+)/i)?.[1]?.trim()
}

export function extractSecuritySeverity(text: string): RenovateSecurityType {
  const textLower = text.toLowerCase()
  if (textLower.includes('critical')) return 'critical'
  if (textLower.includes('high')) return 'high'
  if (textLower.includes('moderate') || textLower.includes('medium')) return 'moderate'
  if (textLower.includes('low')) return 'low'
  return null
}

export function extractScope(dependencyName: string): string | undefined {
  if (!dependencyName.startsWith('@')) return undefined
  return dependencyName.split('/')[0]?.slice(1)
}

function parseVersion(version: string): {major: number; minor: number; patch: number} | null {
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null

  const [, majorStr, minorStr, patchStr] = match
  if (majorStr == null || minorStr == null || patchStr == null) return null

  return {
    major: Number.parseInt(majorStr, 10),
    minor: Number.parseInt(minorStr, 10),
    patch: Number.parseInt(patchStr, 10),
  }
}
