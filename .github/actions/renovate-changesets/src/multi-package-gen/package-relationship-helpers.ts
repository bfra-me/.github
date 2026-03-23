import type {PackageRelationship, WorkspacePackage} from '../multi-package-analyzer'
import type {RenovateDependency} from '../renovate-parser'

export function findPackageGroup(
  packageName: string,
  relationships: PackageRelationship[],
  affectedPackages: string[],
): string[] {
  const group = new Set([packageName])
  const toProcess = [packageName]

  while (toProcess.length > 0) {
    const currentPackage = toProcess.pop()
    if (currentPackage == null) {
      break
    }

    for (const rel of relationships) {
      if (rel.type === 'internal-dependency' || rel.type === 'peer-dependency') {
        let relatedPackage: string | undefined

        if (rel.source === currentPackage && affectedPackages.includes(rel.target)) {
          relatedPackage = rel.target
        } else if (rel.target === currentPackage && affectedPackages.includes(rel.source)) {
          relatedPackage = rel.source
        }

        if (relatedPackage != null && !group.has(relatedPackage)) {
          group.add(relatedPackage)
          toProcess.push(relatedPackage)
        }
      }
    }
  }

  return Array.from(group)
}

export function findDependenciesForPackage(
  packageName: string,
  dependencies: RenovateDependency[],
  workspacePackages: WorkspacePackage[],
): RenovateDependency[] {
  const pkg = workspacePackages.find(p => p.name === packageName)
  if (pkg == null) {
    return []
  }

  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
    ...pkg.optionalDependencies,
  }

  return dependencies.filter(dep => allDeps[dep.name] != null)
}

export function packageHasDependency(
  packageName: string,
  dependency: RenovateDependency,
  workspacePackages: WorkspacePackage[],
): boolean {
  const pkg = workspacePackages.find(p => p.name === packageName)
  if (pkg == null) {
    return false
  }

  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
    ...pkg.optionalDependencies,
  }

  return allDeps[dependency.name] != null
}
