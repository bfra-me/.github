import type {RenovateDependency} from '../renovate-parser'
import type {MultiPackageAnalysisResult, PackageRelationship, WorkspacePackage} from './types'

export async function determineAffectedPackages(
  dependencies: RenovateDependency[],
  changedFiles: string[],
  workspacePackages: WorkspacePackage[],
  relationships: PackageRelationship[],
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

  const directlyAffected = Array.from(affectedPackages)
  for (const packageName of directlyAffected) {
    const relatedPackages = findRelatedPackages(packageName, relationships)
    for (const related of relatedPackages) {
      affectedPackages.add(related)
    }
  }

  return Array.from(affectedPackages)
}

export async function performImpactAnalysis(
  dependencies: RenovateDependency[],
  affectedPackages: string[],
  relationships: PackageRelationship[],
  workspacePackages: WorkspacePackage[],
): Promise<MultiPackageAnalysisResult['impactAnalysis']> {
  const directlyAffected = affectedPackages.filter(pkgName => {
    const pkg = workspacePackages.find(p => p.name === pkgName)
    if (pkg == null) {
      return false
    }

    const allDeps = {...pkg.dependencies, ...pkg.devDependencies}
    return dependencies.some(dep => allDeps[dep.name] != null)
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
  relationships: PackageRelationship[],
  impactAnalysis: MultiPackageAnalysisResult['impactAnalysis'],
): Promise<MultiPackageAnalysisResult['recommendations']> {
  const reasoningChain: string[] = []

  const createSeparateChangesets =
    workspacePackages.length > 1 && impactAnalysis.changesetStrategy !== 'single'

  reasoningChain.push(`Workspace contains ${workspacePackages.length} packages`)
  reasoningChain.push(`${impactAnalysis.directlyAffected.length} packages directly affected`)
  reasoningChain.push(`${impactAnalysis.indirectlyAffected.length} packages indirectly affected`)
  reasoningChain.push(`Risk level: ${impactAnalysis.riskLevel}`)
  reasoningChain.push(`Recommended strategy: ${impactAnalysis.changesetStrategy}`)

  const packageGroups: string[][] = []

  if (createSeparateChangesets) {
    if (impactAnalysis.changesetStrategy === 'grouped') {
      const processed = new Set<string>()

      for (const pkgName of impactAnalysis.directlyAffected) {
        if (processed.has(pkgName)) {
          continue
        }

        const group = [pkgName]
        const related = findRelatedPackages(pkgName, relationships)

        for (const relatedPkg of related) {
          if (impactAnalysis.directlyAffected.includes(relatedPkg) && !processed.has(relatedPkg)) {
            group.push(relatedPkg)
          }
        }

        for (const pkg of group) {
          processed.add(pkg)
        }

        packageGroups.push(group)
      }

      reasoningChain.push(`Created ${packageGroups.length} package groups based on relationships`)
    } else {
      for (const pkgName of impactAnalysis.directlyAffected) {
        packageGroups.push([pkgName])
      }
      reasoningChain.push('Creating separate changesets for each affected package')
    }
  } else {
    packageGroups.push(impactAnalysis.directlyAffected)
    reasoningChain.push('Creating single changeset for all affected packages')
  }

  return {
    createSeparateChangesets,
    packageGroups,
    reasoningChain,
  }
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

export function findRelatedPackages(
  packageName: string,
  relationships: PackageRelationship[],
): string[] {
  const related = new Set<string>()

  for (const rel of relationships) {
    if (rel.source === packageName) {
      related.add(rel.target)
    } else if (rel.target === packageName) {
      related.add(rel.source)
    }
  }

  return Array.from(related)
}
