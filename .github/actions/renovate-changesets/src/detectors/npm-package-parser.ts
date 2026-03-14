import type {RenovateManagerType} from '../renovate-parser.js'
import type {DependencyChange, NPMDependencyType, PackageJson} from './npm-detector-types.js'
import {
  calculateSemverImpact,
  determineUpdateType,
  extractScope,
  isWorkspacePackage,
} from './npm-version-comparator.js'

const NPM_DEPENDENCY_TYPES: NPMDependencyType[] = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
]

export function comparePackageJson(
  filename: string,
  baseContent: string,
  headContent: string,
): DependencyChange[] {
  try {
    const basePackage = JSON.parse(baseContent) as PackageJson
    const headPackage = JSON.parse(headContent) as PackageJson
    return NPM_DEPENDENCY_TYPES.flatMap(dependencyType =>
      compareDependencyObjects(
        filename,
        dependencyType,
        basePackage[dependencyType] ?? {},
        headPackage[dependencyType] ?? {},
      ),
    )
  } catch (error) {
    console.warn('Failed to compare package.json files:', error)
    return []
  }
}

export function extractDependenciesFromPackageJson(
  filename: string,
  packageJson: PackageJson,
): DependencyChange[] {
  const manager = detectManagerFromPackageFile(filename)
  return NPM_DEPENDENCY_TYPES.flatMap(dependencyType =>
    Object.entries(packageJson[dependencyType] ?? {}).map(([name, version]) => ({
      name,
      packageFile: filename,
      dependencyType,
      newVersion: version,
      manager,
      updateType: 'patch',
      semverImpact: 'patch',
      isSecurityUpdate: false,
      isWorkspacePackage: isWorkspacePackage(name),
      scope: extractScope(name),
    })),
  )
}

export function detectManagerFromPackageFile(filename: string): RenovateManagerType {
  if (filename.includes('pnpm-lock.yaml')) return 'pnpm'
  if (filename.includes('yarn.lock')) return 'yarn'
  return 'npm'
}

function compareDependencyObjects(
  filename: string,
  dependencyType: NPMDependencyType,
  baseDeps: Record<string, string>,
  headDeps: Record<string, string>,
): DependencyChange[] {
  const manager = detectManagerFromPackageFile(filename)
  return [...new Set([...Object.keys(baseDeps), ...Object.keys(headDeps)])]
    .filter(name => baseDeps[name] !== headDeps[name])
    .map(name => ({
      name,
      packageFile: filename,
      dependencyType,
      currentVersion: baseDeps[name],
      newVersion: headDeps[name],
      manager,
      updateType: determineUpdateType(baseDeps[name], headDeps[name]),
      semverImpact: calculateSemverImpact(baseDeps[name], headDeps[name]),
      isSecurityUpdate: false,
      isWorkspacePackage: isWorkspacePackage(name),
      scope: extractScope(name),
    }))
}
