import type {WorkspacePackage} from './multi-package-analyzer'
import type {RenovateDependency} from './renovate-parser'
import {extractDependenciesFromTitle} from './utils'

/**
 * Resolve the changeset release target when no workspace member is directly affected
 * (e.g. `github-actions` updates that only touch `.github/workflows/*.yaml`).
 *
 * Resolution order: explicit `targetPackage` override → workspace root (regardless of
 * private status) → first non-private workspace member → `fallbackName`. If a root
 * package exists in `workspacePackages`, it was discovered by the workspace analyzer
 * and is a valid changeset target.
 */
export function getRootPackageName(
  workspacePackages: WorkspacePackage[],
  fallbackName: string,
  targetPackage?: string,
): string {
  if (targetPackage != null && targetPackage !== '') {
    const explicit = workspacePackages.find(pkg => pkg.name === targetPackage)
    return explicit?.name ?? targetPackage
  }

  const rootPackage = workspacePackages.find(pkg => pkg.path === '.' || pkg.path === '')
  if (rootPackage != null) return rootPackage.name

  const firstPublic = workspacePackages.find(pkg => !pkg.private)
  if (firstPublic != null) return firstPublic.name

  return fallbackName
}

export function resolveDependencyNames(
  enhancedDependencies: RenovateDependency[],
  isGroupedUpdate: boolean,
  prTitle: string,
  updateType: string,
): string[] {
  let dependencyNames = enhancedDependencies.map(dep => dep.name)
  if (!isGroupedUpdate) {
    const titleDeps = extractDependenciesFromTitle(prTitle)
    if (titleDeps.length > 0) {
      dependencyNames = titleDeps
    }
  }

  const syntheticPattern =
    /^(?:npm|pnpm|yarn|lockfile|github-actions|docker|dockerfile|docker-compose|pip|pipenv|gradle|maven|go|nuget|composer|cargo|helm|terraform|ansible|pre-commit|gitlabci|circleci|unknown)-dependencies$/i
  dependencyNames = dependencyNames.filter(name => !syntheticPattern.test(name))

  if (dependencyNames.length === 0) {
    const titleDeps = extractDependenciesFromTitle(prTitle)
    dependencyNames =
      titleDeps.length > 0
        ? titleDeps
        : [updateType === 'npm' ? 'dependencies' : updateType || 'dependencies']
  }

  return dependencyNames
}
