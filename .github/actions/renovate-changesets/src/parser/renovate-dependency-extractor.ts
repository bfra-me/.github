import type {RenovateDependency, RenovateManagerType} from './renovate-parser-types.js'
import {detectManagerFromDependencyName} from './renovate-manager-detector.js'
import {
  detectUpdateTypeFromVersions,
  extractGroupName,
  extractScope,
  extractSecuritySeverity,
  isGroupedUpdate,
  isSecurityUpdate,
} from './renovate-update-classifier.js'

const VERSION_PATTERN = String.raw`v?(\d+(?:\.\d+){0,2}(?:-[\w.]+)?)`
const TEXT_PATTERNS = [
  new RegExp(
    String.raw`update\s+action\s+(@?\w[\w./%-]*)(?:\s+(?:package|module|dependency))?\s+(?:to\s+)?${VERSION_PATTERN}`,
    'gi',
  ),
  new RegExp(
    String.raw`update\s+(?:dependency\s+)?(@?\w[\w./%-]*)(?:\s+(?:action|package|module|dependency))?\s+(?:to\s+)?${VERSION_PATTERN}`,
    'gi',
  ),
  new RegExp(
    String.raw`bump\s+(@?\w[\w./%-]*)\s+from\s+${VERSION_PATTERN}\s+to\s+${VERSION_PATTERN}`,
    'gi',
  ),
  new RegExp(
    String.raw`upgrade\s+(@?\w[\w./%-]*)\s*\(${VERSION_PATTERN}\s*→\s*${VERSION_PATTERN}\)`,
    'gi',
  ),
  new RegExp(String.raw`(@?\w[\w./%-]*)\s*\(${VERSION_PATTERN}\s*→\s*${VERSION_PATTERN}\)`, 'gi'),
]

export function extractDependenciesFromPR(
  prTitle: string,
  prBody: string,
  commitMessage: string,
  manager: RenovateManagerType,
): RenovateDependency[] {
  const dependencies = [
    ...parseDependenciesFromText(prTitle, manager),
    ...parseDependenciesFromText(prBody, manager),
    ...(commitMessage.length > 0 ? parseDependenciesFromText(commitMessage, manager) : []),
  ]

  return dependencies.reduce<RenovateDependency[]>((acc, dep) => {
    const existing = acc.find(
      candidate =>
        candidate.name === dep.name &&
        (candidate.manager === dep.manager ||
          candidate.manager === 'unknown' ||
          dep.manager === 'unknown'),
    )

    if (existing == null) {
      acc.push(dep)
      return acc
    }

    if (shouldPreferVersion(existing.currentVersion, dep.currentVersion)) {
      existing.currentVersion = dep.currentVersion
    }

    if (shouldPreferVersion(existing.newVersion, dep.newVersion)) {
      existing.newVersion = dep.newVersion
    }

    existing.packageFile = existing.packageFile || dep.packageFile
    existing.scope = existing.scope || dep.scope
    if (dep.isSecurityUpdate) existing.isSecurityUpdate = true
    if (dep.isGrouped) existing.isGrouped = true
    if (dep.groupName != null) existing.groupName = dep.groupName
    if (dep.securitySeverity != null && existing.securitySeverity == null) {
      existing.securitySeverity = dep.securitySeverity
    }

    return acc
  }, [])
}

export function parseDependenciesFromText(
  text: string,
  defaultManager: RenovateManagerType,
): RenovateDependency[] {
  const dependencies: RenovateDependency[] = []

  for (const pattern of TEXT_PATTERNS) {
    let match = pattern.exec(text)
    while (match != null) {
      const [, name, version1, version2] = match
      if (name != null) {
        dependencies.push(createDependency(name, version1, version2, text, defaultManager))
      }
      match = pattern.exec(text)
    }
  }

  dependencies.push(...extractMarkdownLinkDependencies(text, defaultManager))
  return dependencies
}

function createDependency(
  name: string,
  version1: string | undefined,
  version2: string | undefined,
  text: string,
  defaultManager: RenovateManagerType,
): RenovateDependency {
  const isSecurity = isSecurityUpdate(text)
  const dependency: RenovateDependency = {
    name,
    currentVersion: version2 == null ? undefined : version1,
    newVersion: version2 ?? version1,
    manager: detectManagerFromDependencyName(name) || defaultManager,
    updateType: detectUpdateTypeFromVersions(version1, version2),
    isSecurityUpdate: isSecurity,
    isGrouped: isGroupedUpdate(text),
    groupName: extractGroupName(text),
    scope: extractScope(name),
  }

  if (isSecurity) {
    dependency.securitySeverity = extractSecuritySeverity(text)
  }

  return dependency
}

function extractMarkdownLinkDependencies(
  text: string,
  defaultManager: RenovateManagerType,
): RenovateDependency[] {
  const dependencies: RenovateDependency[] = []
  const linkSource = /\[(@?\w[\w./%-]*)\]\([^)]*\)/.source
  const versionPairSource =
    /`?v?(\d+(?:\.\d+){0,2}(?:-[\w.]+)?)`?\s*(?:→|->)\s*`?v?(\d+(?:\.\d+){0,2}(?:-[\w.]+)?)`?/
      .source

  for (const line of text.split('\n')) {
    const lineVersionPairs = [...line.matchAll(new RegExp(versionPairSource, 'g'))]
    if (lineVersionPairs.length === 0) continue

    const lineLinks = [...line.matchAll(new RegExp(linkSource, 'g'))]
    if (lineLinks.length === 0) continue

    const linkName = lineLinks[0]?.[1]
    const fromVersion = lineVersionPairs[0]?.[1]
    const toVersion = lineVersionPairs[0]?.[2]

    if (linkName != null && fromVersion != null && toVersion != null) {
      dependencies.push(createDependency(linkName, fromVersion, toVersion, text, defaultManager))
    }
  }

  return dependencies
}

function shouldPreferVersion(existing?: string, candidate?: string): boolean {
  if (existing == null && candidate != null) return true
  return !hasSemverLike(existing) && hasSemverLike(candidate)
}

function hasSemverLike(version?: string): boolean {
  return version != null && version.includes('.')
}
