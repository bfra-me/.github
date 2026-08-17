import type {RenovateDependency} from '../renovate-parser'
import type {MultiPackageAnalysisResult, PackageRelationship, WorkspacePackage} from './types'

export async function determineAffectedPackages(
  dependencies: RenovateDependency[],
  changedFiles: string[],
  workspacePackages: WorkspacePackage[],
): Promise<string[]> {
  const affectedPackages = new Set<string>()

  for (const file of changedFiles) {
    const pkg = findPackageForFile(file, workspacePackages)
    if (pkg != null) {
      affectedPackages.add(pkg.name)
    }
  }

  for (const dep of dependencies) {
    for (const pkg of workspacePackages) {
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies,
        ...pkg.optionalDependencies,
      }

      if (allDeps[dep.name] != null) {
        affectedPackages.add(pkg.name)
      }
    }
  }

  return Array.from(affectedPackages)
}

export async function performImpactAnalysis(
  dependencies: RenovateDependency[],
  affectedPackages: string[],
  relationships: PackageRelationship[],
  workspacePackages: WorkspacePackage[],
  changedFiles: string[],
): Promise<MultiPackageAnalysisResult['impactAnalysis']> {
  const directlyAffected = affectedPackages.filter(pkgName => {
    const pkg = workspacePackages.find(p => p.name === pkgName)
    if (pkg == null) {
      return false
    }

    const directlyChanged = changedFiles.some(
      file => findPackageForFile(file, workspacePackages)?.name === pkgName,
    )
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
      ...pkg.optionalDependencies,
    }
    const directlyUpdated = dependencies.some(dep => allDeps[dep.name] != null)

    return directlyChanged || directlyUpdated
  })

  const indirectlyAffected = affectedPackages.filter(pkgName => !directlyAffected.includes(pkgName))

  let riskLevel: 'low' | 'medium' | 'high' = 'low'
  if (affectedPackages.length > 5) {
    riskLevel = 'high'
  } else if (affectedPackages.length > 2 || indirectlyAffected.length > 0) {
    riskLevel = 'medium'
  }

  let changesetStrategy: 'single' | 'multiple' | 'grouped' = 'single'
  if (workspacePackages.length > 1 && affectedPackages.length > 1) {
    changesetStrategy = relationships.some(r => r.type === 'internal-dependency')
      ? 'grouped'
      : 'multiple'
  }

  return {
    directlyAffected,
    indirectlyAffected,
    riskLevel,
    changesetStrategy,
  }
}

export async function generateRecommendations(
  workspacePackages: WorkspacePackage[],
  impactAnalysis: MultiPackageAnalysisResult['impactAnalysis'],
): Promise<MultiPackageAnalysisResult['recommendations']> {
  const createSeparateChangesets =
    workspacePackages.length > 1 && impactAnalysis.changesetStrategy !== 'single'

  return {createSeparateChangesets}
}

export function findPackageForFile(
  filePath: string,
  packages: WorkspacePackage[],
): WorkspacePackage | null {
  const sortedPackages = [...packages].sort((a, b) => b.path.length - a.path.length)

  for (const pkg of sortedPackages) {
    if (
      filePath.startsWith(`${pkg.path}/`) ||
      filePath === pkg.path ||
      (pkg.path === '.' && !filePath.includes('/'))
    ) {
      return pkg
    }
  }

  return null
}
