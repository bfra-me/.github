import type {
  DependencyChange,
  LockFileDependency,
  NPMDependencyType,
  PackageLockJson,
  PnpmLockYaml,
} from './npm-detector-types.js'
import {extractScope, isWorkspacePackage} from './npm-version-comparator.js'

export function extractDependenciesFromPackageLock(
  filename: string,
  lockFile: PackageLockJson,
): DependencyChange[] {
  return Object.entries(lockFile.packages ?? lockFile.dependencies ?? {})
    .map(([packageKey, pkg]) => ({name: normalizePackageKey(packageKey), pkg}))
    .filter(({name}) => name.length > 0)
    .map(({name, pkg}) => ({
      name,
      packageFile: filename,
      dependencyType: determineDependencyTypeFromLockFile(pkg),
      newVersion: pkg.version,
      newResolved: pkg.resolved,
      manager: 'npm',
      updateType: 'patch',
      semverImpact: 'patch',
      isSecurityUpdate: false,
      isWorkspacePackage: isWorkspacePackage(name),
      scope: extractScope(name),
    }))
}

export function extractDependenciesFromPnpmLock(
  filename: string,
  lockFile: PnpmLockYaml,
): DependencyChange[] {
  return Object.entries({
    ...(lockFile.dependencies ?? {}),
    ...(lockFile.devDependencies ?? {}),
    ...(lockFile.optionalDependencies ?? {}),
  }).map(([name, version]) => ({
    name,
    packageFile: filename,
    dependencyType: determinePnpmDependencyType(name, lockFile),
    newVersion: version,
    manager: 'pnpm',
    updateType: 'patch',
    semverImpact: 'patch',
    isSecurityUpdate: false,
    isWorkspacePackage: isWorkspacePackage(name),
    scope: extractScope(name),
  }))
}

export function determineDependencyTypeFromLockFile(
  pkg: LockFileDependency,
  newPkg?: LockFileDependency,
): NPMDependencyType {
  if (pkg.peer ?? newPkg?.peer ?? false) return 'peerDependencies'
  if (pkg.optional ?? newPkg?.optional ?? false) return 'optionalDependencies'
  if (pkg.dev ?? newPkg?.dev ?? false) return 'devDependencies'
  return 'dependencies'
}

export function determinePnpmDependencyType(
  name: string,
  baseLock?: PnpmLockYaml,
  headLock?: PnpmLockYaml,
): NPMDependencyType {
  for (const lock of [baseLock, headLock].filter(Boolean) as PnpmLockYaml[]) {
    if (lock.devDependencies?.[name] != null) return 'devDependencies'
    if (lock.optionalDependencies?.[name] != null) return 'optionalDependencies'
    if (lock.dependencies?.[name] != null) return 'dependencies'
  }

  return 'dependencies'
}

function normalizePackageKey(packageKey: string): string {
  if (packageKey.startsWith('node_modules/')) return packageKey.slice('node_modules/'.length)
  return packageKey
}
