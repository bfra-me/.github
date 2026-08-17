import type {MultiPackageAnalysisConfig, WorkspacePackage} from './types'
import {promises as fs} from 'node:fs'
import path from 'node:path'
import * as core from '@actions/core'
import {load} from 'js-yaml'

export async function discoverWorkspacePackages(
  config: MultiPackageAnalysisConfig,
): Promise<WorkspacePackage[]> {
  const packages: WorkspacePackage[] = []

  try {
    const rootPackageJsonPath = path.join(config.workspaceRoot, 'package.json')

    if (await fileExists(rootPackageJsonPath)) {
      const rootPackage = await analyzePackageJson(
        rootPackageJsonPath,
        config.workspaceRoot,
        await isDeclaredWorkspaceRoot(config.workspaceRoot),
      )
      if (rootPackage != null) {
        packages.push(rootPackage)

        if (rootPackage.workspaces != null && config.detectWorkspaces) {
          const workspacePackages = await discoverWorkspaceChildren(rootPackage.workspaces, config)
          packages.push(...workspacePackages)
        }
      }
    }

    await discoverOtherWorkspaceTypes(packages, config)

    const uniquePackages = [
      ...new Map(packages.map(pkg => [path.resolve(pkg.packageJsonPath), pkg])).values(),
    ]
    if (uniquePackages.length > config.maxPackagesToAnalyze) {
      core.warning(
        `Discovered ${uniquePackages.length} workspace packages; analyzing the first ${config.maxPackagesToAnalyze}.`,
      )
    }

    return uniquePackages.slice(0, config.maxPackagesToAnalyze)
  } catch (error) {
    console.warn(
      `Workspace discovery failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    return []
  }
}

export async function discoverWorkspaceChildren(
  workspacePatterns: string[],
  config: MultiPackageAnalysisConfig,
): Promise<WorkspacePackage[]> {
  const packages: WorkspacePackage[] = []
  const positivePatterns = workspacePatterns.filter(pattern => !pattern.startsWith('!'))
  const negativePatterns = workspacePatterns.filter(pattern => pattern.startsWith('!'))
  const excludedPaths = new Set(
    (
      await Promise.all(
        negativePatterns.map(pattern =>
          expandWorkspacePattern(pattern.slice(1), config.workspaceRoot),
        ),
      )
    ).flat(),
  )

  for (const pattern of positivePatterns) {
    const workspacePaths = await expandWorkspacePattern(pattern, config.workspaceRoot)

    for (const workspacePath of workspacePaths) {
      if (excludedPaths.has(workspacePath)) continue
      const packageJsonPath = path.join(config.workspaceRoot, workspacePath, 'package.json')

      if (await fileExists(packageJsonPath)) {
        const pkg = await analyzePackageJson(packageJsonPath, config.workspaceRoot)
        if (pkg != null) {
          packages.push(pkg)
        }
      }
    }
  }

  return packages
}

export async function discoverOtherWorkspaceTypes(
  packages: WorkspacePackage[],
  config: MultiPackageAnalysisConfig,
): Promise<void> {
  const lernaPath = path.join(config.workspaceRoot, 'lerna.json')
  if (await fileExists(lernaPath)) {
    try {
      const lernaConfig = JSON.parse(await fs.readFile(lernaPath, 'utf8')) as {packages?: string[]}
      if (lernaConfig.packages != null) {
        const lernaPackages = await discoverWorkspaceChildren(lernaConfig.packages, config)
        packages.push(...lernaPackages)
      }
    } catch (error) {
      console.warn(
        `Failed to parse lerna.json: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  const nxPath = path.join(config.workspaceRoot, 'nx.json')
  if (await fileExists(nxPath)) {
    // Nx workspaces are detected via package.json workspaces; no additional discovery needed.
  }

  const pnpmWorkspacePath = path.join(config.workspaceRoot, 'pnpm-workspace.yaml')
  if (await fileExists(pnpmWorkspacePath)) {
    try {
      const pnpmConfig = load(await fs.readFile(pnpmWorkspacePath, 'utf8')) as {packages?: string[]}
      if (pnpmConfig?.packages != null) {
        const pnpmPackages = await discoverWorkspaceChildren(pnpmConfig.packages, config)
        packages.push(...pnpmPackages)
      }
    } catch (error) {
      console.warn(
        `Failed to parse pnpm-workspace.yaml: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

export async function analyzePackageJson(
  packageJsonPath: string,
  workspaceRoot: string,
  workspaceMember = true,
): Promise<WorkspacePackage | null> {
  try {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as {
      name?: string
      version?: string
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
      private?: boolean
      workspaces?: string[] | {packages?: string[]}
    }

    const packagePath = path.dirname(packageJsonPath)
    const relativePath = path.relative(workspaceRoot, packagePath)

    const workspaces = Array.isArray(packageJson.workspaces)
      ? packageJson.workspaces
      : packageJson.workspaces?.packages

    return {
      name: packageJson.name ?? path.basename(packagePath),
      path: relativePath || '.',
      packageJsonPath,
      version: packageJson.version,
      dependencies: packageJson.dependencies ?? {},
      devDependencies: packageJson.devDependencies ?? {},
      peerDependencies: packageJson.peerDependencies ?? {},
      optionalDependencies: packageJson.optionalDependencies ?? {},
      private: Boolean(packageJson.private),
      workspaceMember,
      workspaces,
    }
  } catch (error) {
    console.warn(
      `Failed to analyze package.json at ${packageJsonPath}: ${error instanceof Error ? error.message : String(error)}`,
    )
    return null
  }
}

async function isDeclaredWorkspaceRoot(workspaceRoot: string): Promise<boolean> {
  const packageJsonPath = path.join(workspaceRoot, 'package.json')
  try {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as {
      workspaces?: unknown
    }
    const workspaces = Array.isArray(packageJson.workspaces)
      ? packageJson.workspaces
      : isWorkspaceObject(packageJson.workspaces)
        ? packageJson.workspaces.packages
        : undefined
    if (workspaces?.includes('.')) return true
  } catch {
    // The root package was already parsed by the caller; discovery will report any parse issue there.
  }

  const pnpmWorkspacePath = path.join(workspaceRoot, 'pnpm-workspace.yaml')
  try {
    const pnpmConfig = load(await fs.readFile(pnpmWorkspacePath, 'utf8')) as {packages?: unknown}
    return Array.isArray(pnpmConfig?.packages) && pnpmConfig.packages.includes('.')
  } catch {
    return false
  }
}

export async function expandWorkspacePattern(
  pattern: string,
  workspaceRoot: string,
): Promise<string[]> {
  if (!pattern.includes('*')) {
    return (await directoryExists(path.join(workspaceRoot, pattern))) ? [pattern] : []
  }

  const paths: string[] = []
  for await (const workspacePath of fs.glob(pattern, {
    cwd: workspaceRoot,
    exclude: entry => entry.split(/[\\/]/u).includes('node_modules'),
  })) {
    const relativePath = path.normalize(workspacePath)
    if (
      relativePath.split(path.sep).includes('node_modules') ||
      !(await directoryExists(path.join(workspaceRoot, relativePath))) ||
      !(await fileExists(path.join(workspaceRoot, relativePath, 'package.json')))
    ) {
      continue
    }
    paths.push(relativePath)
  }

  return paths.sort()
}

function isWorkspaceObject(value: unknown): value is {packages?: string[]} {
  return typeof value === 'object' && value !== null && 'packages' in value
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath)
    return stat.isDirectory()
  } catch {
    return false
  }
}
