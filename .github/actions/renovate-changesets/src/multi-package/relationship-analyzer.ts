import type {
  MultiPackageAnalysisConfig,
  PackageRelationship,
  PackageRelationshipType,
  WorkspacePackage,
} from './types'

export async function analyzePackageRelationships(
  packages: WorkspacePackage[],
  config: MultiPackageAnalysisConfig,
): Promise<PackageRelationship[]> {
  const relationships: PackageRelationship[] = []

  const packageMap = new Map<string, WorkspacePackage>()
  for (const pkg of packages) {
    packageMap.set(pkg.name, pkg)
  }

  for (const pkg of packages) {
    if (config.analyzeInternalDependencies) {
      analyzeInternalDependencies(pkg, packageMap, relationships)
    }

    if (config.enforceVersionConsistency) {
      analyzeVersionConsistency(pkg, packages, relationships, config)
    }
  }

  return relationships
}

export function analyzeInternalDependencies(
  pkg: WorkspacePackage,
  packageMap: Map<string, WorkspacePackage>,
  relationships: PackageRelationship[],
): void {
  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
    ...pkg.optionalDependencies,
  }

  for (const [depName, version] of Object.entries(allDeps)) {
    const targetPackage = packageMap.get(depName)
    if (targetPackage != null) {
      const type = pkg.dependencies[depName]
        ? 'internal-dependency'
        : pkg.devDependencies[depName]
          ? 'dev-dependency'
          : pkg.peerDependencies[depName]
            ? 'peer-dependency'
            : 'internal-dependency'

      relationships.push({
        source: pkg.name,
        target: depName,
        type: type as PackageRelationshipType,
        dependencyName: depName,
        version,
        confidence: 1,
        impact:
          type === 'peer-dependency' ? 'high' : type === 'internal-dependency' ? 'medium' : 'low',
      })
    }
  }
}

export function analyzeVersionConsistency(
  pkg: WorkspacePackage,
  allPackages: WorkspacePackage[],
  relationships: PackageRelationship[],
  config: MultiPackageAnalysisConfig,
): void {
  for (const pattern of config.versionConsistencyPatterns) {
    const allDeps = {...pkg.dependencies, ...pkg.devDependencies}

    for (const [depName, version] of Object.entries(allDeps)) {
      if (matchesPattern(depName, pattern)) {
        for (const otherPkg of allPackages) {
          if (otherPkg.name === pkg.name) {
            continue
          }

          const otherDeps = {...otherPkg.dependencies, ...otherPkg.devDependencies}
          if (otherDeps[depName] != null && otherDeps[depName] !== version) {
            relationships.push({
              source: pkg.name,
              target: otherPkg.name,
              type: 'version-consistency',
              dependencyName: depName,
              version,
              confidence: 0.8,
              impact: 'medium',
            })
          }
        }
      }
    }
  }
}

export function matchesPattern(name: string, pattern: string): boolean {
  if (pattern.includes('*')) {
    const regex = new RegExp(`^${pattern.replaceAll('*', '.*')}$`)
    return regex.test(name)
  }
  return name === pattern
}
