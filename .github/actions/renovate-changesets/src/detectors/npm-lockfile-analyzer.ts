import type {
  DependencyChange,
  LockFileDependency,
  PackageLockJson,
  PnpmLockYaml,
} from './npm-detector-types.js'
import {load} from 'js-yaml'
import {
  determineDependencyTypeFromLockFile,
  determinePnpmDependencyType,
} from './npm-lockfile-parser.js'
import {
  calculateSemverImpact,
  determineUpdateType,
  extractScope,
  isWorkspacePackage,
} from './npm-version-comparator.js'

export function comparePackageLock(
  filename: string,
  baseContent: string,
  headContent: string,
): DependencyChange[] {
  try {
    const baseLock = JSON.parse(baseContent) as PackageLockJson
    const headLock = JSON.parse(headContent) as PackageLockJson
    return compareLockFilePackages(
      filename,
      baseLock.packages ?? baseLock.dependencies ?? {},
      headLock.packages ?? headLock.dependencies ?? {},
    )
  } catch (error) {
    console.warn('Failed to compare package-lock.json files:', error)
    return []
  }
}

export function comparePnpmLock(
  filename: string,
  baseContent: string,
  headContent: string,
): DependencyChange[] {
  try {
    const baseLock = load(baseContent) as PnpmLockYaml
    const headLock = load(headContent) as PnpmLockYaml
    return comparePnpmDependencies(
      filename,
      {...(baseLock.dependencies ?? {}), ...(baseLock.devDependencies ?? {})},
      {...(headLock.dependencies ?? {}), ...(headLock.devDependencies ?? {})},
      baseLock,
      headLock,
    )
  } catch (error) {
    console.warn('Failed to compare pnpm-lock.yaml files:', error)
    return []
  }
}

export function compareYarnLock(
  filename: string,
  baseContent: string,
  headContent: string,
): DependencyChange[] {
  try {
    const versionRegex = /^"?([^@\s]+)@[^"]*"?:\s*version\s+"([^"]+)"/gm
    const baseVersions = collectYarnVersions(baseContent, versionRegex)
    const headVersions = collectYarnVersions(headContent, versionRegex)
    return [...headVersions.entries()]
      .filter(
        ([name, version]) => baseVersions.get(name) != null && baseVersions.get(name) !== version,
      )
      .map(([name, version]) => ({
        name,
        packageFile: filename,
        dependencyType: 'dependencies',
        currentVersion: baseVersions.get(name),
        newVersion: version,
        manager: 'yarn',
        updateType: determineUpdateType(baseVersions.get(name), version),
        semverImpact: calculateSemverImpact(baseVersions.get(name), version),
        isSecurityUpdate: false,
        isWorkspacePackage: isWorkspacePackage(name),
        scope: extractScope(name),
      }))
  } catch (error) {
    console.warn('Failed to compare yarn.lock files:', error)
    return []
  }
}

function compareLockFilePackages(
  filename: string,
  basePackages: Record<string, LockFileDependency>,
  headPackages: Record<string, LockFileDependency>,
): DependencyChange[] {
  const changes: DependencyChange[] = []

  for (const packageKey of new Set([...Object.keys(basePackages), ...Object.keys(headPackages)])) {
    const basePkg = basePackages[packageKey]
    const headPkg = headPackages[packageKey]

    if (basePkg == null || headPkg == null || basePkg.version === headPkg.version) continue

    const name = normalizePackageName(packageKey)
    if (name === 'root') continue

    changes.push({
      name,
      packageFile: filename,
      dependencyType: determineDependencyTypeFromLockFile(basePkg, headPkg),
      currentVersion: basePkg.version,
      newVersion: headPkg.version,
      currentResolved: basePkg.resolved,
      newResolved: headPkg.resolved,
      manager: 'npm',
      updateType: determineUpdateType(basePkg.version, headPkg.version),
      semverImpact: calculateSemverImpact(basePkg.version, headPkg.version),
      isSecurityUpdate: false,
      isWorkspacePackage: isWorkspacePackage(name),
      scope: extractScope(name),
    })
  }

  return changes
}

function comparePnpmDependencies(
  filename: string,
  baseDeps: Record<string, string>,
  headDeps: Record<string, string>,
  baseLock: PnpmLockYaml,
  headLock: PnpmLockYaml,
): DependencyChange[] {
  return [...new Set([...Object.keys(baseDeps), ...Object.keys(headDeps)])]
    .filter(name => baseDeps[name] !== headDeps[name])
    .map(name => ({
      name,
      packageFile: filename,
      dependencyType: determinePnpmDependencyType(name, baseLock, headLock),
      currentVersion: baseDeps[name],
      newVersion: headDeps[name],
      manager: 'pnpm',
      updateType: determineUpdateType(baseDeps[name], headDeps[name]),
      semverImpact: calculateSemverImpact(baseDeps[name], headDeps[name]),
      isSecurityUpdate: false,
      isWorkspacePackage: isWorkspacePackage(name),
      scope: extractScope(name),
    }))
}

function collectYarnVersions(content: string, versionRegex: RegExp): Map<string, string> {
  const versions = new Map<string, string>()
  versionRegex.lastIndex = 0
  for (let match = versionRegex.exec(content); match != null; match = versionRegex.exec(content)) {
    if (match[1] != null && match[2] != null) versions.set(match[1], match[2])
  }

  return versions
}

function normalizePackageName(packageKey: string): string {
  if (packageKey.startsWith('node_modules/')) return packageKey.slice('node_modules/'.length)
  return packageKey.length > 0 ? packageKey : 'root'
}
