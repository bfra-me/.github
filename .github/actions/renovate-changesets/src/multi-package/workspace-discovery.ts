import type {MultiPackageAnalysisConfig, WorkspacePackage} from './types'
import {promises as fs} from 'node:fs'
import path from 'node:path'
import {load} from 'js-yaml'

export async function discoverWorkspacePackages(
  config: MultiPackageAnalysisConfig,
): Promise<WorkspacePackage[]> {
  const packages: WorkspacePackage[] = []

  try {
    const rootPackageJsonPath = path.join(config.workspaceRoot, 'package.json')

    if (await fileExists(rootPackageJsonPath)) {
      const rootPackage = await analyzePackageJson(rootPackageJsonPath, config.workspaceRoot)
      if (rootPackage != null) {
        packages.push(rootPackage)

        if (rootPackage.workspaces != null && config.detectWorkspaces) {
          const workspacePackages = await discoverWorkspaceChildren(rootPackage.workspaces, config)
          packages.push(...workspacePackages)
        }
      }
    }

    await discoverOtherWorkspaceTypes(packages, config)

    return packages.slice(0, config.maxPackagesToAnalyze)
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

  for (const pattern of workspacePatterns) {
    const workspacePaths = await expandWorkspacePattern(pattern, config.workspaceRoot)

    for (const workspacePath of workspacePaths) {
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
      workspaces?: string[]
    }

    const packagePath = path.dirname(packageJsonPath)
    const relativePath = path.relative(workspaceRoot, packagePath)

    return {
      name: packageJson.name ?? path.basename(packagePath),
      path: relativePath || '.',
      packageJsonPath,
      version: packageJson.version ?? '0.0.0',
      dependencies: packageJson.dependencies ?? {},
      devDependencies: packageJson.devDependencies ?? {},
      peerDependencies: packageJson.peerDependencies ?? {},
      optionalDependencies: packageJson.optionalDependencies ?? {},
      private: Boolean(packageJson.private),
      workspaces: packageJson.workspaces,
    }
  } catch (error) {
    console.warn(
      `Failed to analyze package.json at ${packageJsonPath}: ${error instanceof Error ? error.message : String(error)}`,
    )
    return null
  }
}

export async function expandWorkspacePattern(
  pattern: string,
  workspaceRoot: string,
): Promise<string[]> {
  const paths: string[] = []

  if (pattern.includes('*')) {
    if (pattern === 'packages/*') {
      const packagesDir = path.join(workspaceRoot, 'packages')
      if (await directoryExists(packagesDir)) {
        const entries = await fs.readdir(packagesDir, {withFileTypes: true})
        for (const entry of entries) {
          if (entry.isDirectory()) {
            paths.push(`packages/${entry.name}`)
          }
        }
      }
    } else if (pattern === 'apps/*') {
      const appsDir = path.join(workspaceRoot, 'apps')
      if (await directoryExists(appsDir)) {
        const entries = await fs.readdir(appsDir, {withFileTypes: true})
        for (const entry of entries) {
          if (entry.isDirectory()) {
            paths.push(`apps/${entry.name}`)
          }
        }
      }
    }
  } else if (await directoryExists(path.join(workspaceRoot, pattern))) {
    paths.push(pattern)
  }

  return paths
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
