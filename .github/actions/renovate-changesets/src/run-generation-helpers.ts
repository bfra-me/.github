import type {WorkspacePackage} from './multi-package-analyzer'
import type {RenovateDependency} from './renovate-parser'
import {extractDependenciesFromTitle} from './utils'

export function getRootPackageName(
  workspacePackages: WorkspacePackage[],
  fallbackName: string,
): string {
  const rootPackage = workspacePackages.find(pkg => pkg.path === '.' || pkg.path === '')
  return rootPackage?.name ?? fallbackName
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
