import type {Octokit} from '@octokit/rest'
import type {RenovateDependency} from './renovate-parser'
import {promises as fs} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {load} from 'js-yaml'

/**
 * Represents a package within a workspace/monorepo
 */
export interface WorkspacePackage {
  name: string
  path: string
  packageJsonPath: string
  version: string
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  peerDependencies: Record<string, string>
  optionalDependencies: Record<string, string>
  private: boolean
  workspaces?: string[]
}

/**
 * Relationship types between packages
 */
export type PackageRelationshipType =
  | 'internal-dependency' // One package depends on another in the workspace
  | 'peer-dependency' // Package has peer dependency relationship
  | 'dev-dependency' // Development dependency relationship
  | 'version-consistency' // Packages that should maintain consistent external dependency versions
  | 'affected-by-update' // Package affected by dependency update in another package

/**
 * Relationship between two packages
 */
export interface PackageRelationship {
  source: string // Source package name
  target: string // Target package name
  type: PackageRelationshipType
  dependencyName?: string // Name of the dependency creating the relationship
  version?: string // Version constraint
  confidence: number // 0-1 confidence score
  impact: 'low' | 'medium' | 'high' // Expected impact of changes
}

/**
 * Configuration for multi-package analysis
 */
export interface MultiPackageAnalysisConfig {
  workspaceRoot: string
  detectWorkspaces: boolean
  analyzeInternalDependencies: boolean
  enforceVersionConsistency: boolean
  maxPackagesToAnalyze: number
  versionConsistencyPatterns: string[]
  internalPackagePatterns: string[]
}

/**
 * Result of multi-package analysis
 */
export interface MultiPackageAnalysisResult {
  workspacePackages: WorkspacePackage[]
  packageRelationships: PackageRelationship[]
  affectedPackages: string[]
  impactAnalysis: {
    directlyAffected: string[]
    indirectlyAffected: string[]
    riskLevel: 'low' | 'medium' | 'high'
    changesetStrategy: 'single' | 'multiple' | 'grouped'
  }
  recommendations: {
    createSeparateChangesets: boolean
    packageGroups: string[][]
    reasoningChain: string[]
  }
}

/**
 * Multi-package dependency relationship analyzer for Renovate updates
 */
export class MultiPackageAnalyzer {
  private config: MultiPackageAnalysisConfig

  constructor(config: Partial<MultiPackageAnalysisConfig> = {}) {
    this.config = {
      workspaceRoot: config.workspaceRoot || process.cwd(),
      detectWorkspaces: config.detectWorkspaces ?? true,
      analyzeInternalDependencies: config.analyzeInternalDependencies ?? true,
      enforceVersionConsistency: config.enforceVersionConsistency ?? true,
      maxPackagesToAnalyze: config.maxPackagesToAnalyze || 50,
      versionConsistencyPatterns: config.versionConsistencyPatterns || [
        '@types/*',
        'typescript',
        'eslint*',
        'prettier*',
        '@testing-library/*',
        'vitest*',
        'jest*',
      ],
      internalPackagePatterns: config.internalPackagePatterns || [
        '@*/.*', // Scoped packages
        '^[^@][^/]*$', // Non-scoped packages that might be internal
      ],
      ...config,
    }
  }

  /**
   * Analyze multi-package dependencies and relationships for a Renovate PR
   */
  async analyzeMultiPackageUpdate(
    dependencies: RenovateDependency[],
    changedFiles: string[],
    _octokit?: Octokit,
    _owner?: string,
    _repo?: string,
    _prNumber?: number,
  ): Promise<MultiPackageAnalysisResult> {
    try {
      // Step 1: Discover workspace packages
      const workspacePackages = await this.discoverWorkspacePackages()

      // Step 2: Analyze package relationships
      const packageRelationships = await this.analyzePackageRelationships(workspacePackages)

      // Step 3: Determine affected packages based on the update
      const affectedPackages = await this.determineAffectedPackages(
        dependencies,
        changedFiles,
        workspacePackages,
        packageRelationships,
      )

      // Step 4: Perform impact analysis
      const impactAnalysis = await this.performImpactAnalysis(
        dependencies,
        affectedPackages,
        packageRelationships,
        workspacePackages,
      )

      // Step 5: Generate recommendations
      const recommendations = await this.generateRecommendations(
        workspacePackages,
        packageRelationships,
        impactAnalysis,
      )

      return {
        workspacePackages,
        packageRelationships,
        affectedPackages,
        impactAnalysis,
        recommendations,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`Multi-package analysis failed: ${errorMessage}`)
    }
  }

  /**
   * Discover all packages in the workspace/monorepo
   */
  private async discoverWorkspacePackages(): Promise<WorkspacePackage[]> {
    const packages: WorkspacePackage[] = []

    try {
      // Check if this is a workspace/monorepo by looking for common indicators
      const rootPackageJsonPath = path.join(this.config.workspaceRoot, 'package.json')

      if (await this.fileExists(rootPackageJsonPath)) {
        const rootPackage = await this.analyzePackageJson(rootPackageJsonPath)
        if (rootPackage) {
          packages.push(rootPackage)

          // If root has workspaces, discover them
          if (rootPackage.workspaces && this.config.detectWorkspaces) {
            const workspacePackages = await this.discoverWorkspaceChildren(rootPackage.workspaces)
            packages.push(...workspacePackages)
          }
        }
      }

      // Also check for other workspace configurations
      await this.discoverOtherWorkspaceTypes(packages)

      return packages.slice(0, this.config.maxPackagesToAnalyze)
    } catch (error) {
      // If workspace discovery fails, return empty array (single package scenario)
      console.warn(
        `Workspace discovery failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      return []
    }
  }

  /**
   * Discover workspace packages from workspaces patterns
   */
  private async discoverWorkspaceChildren(
    workspacePatterns: string[],
  ): Promise<WorkspacePackage[]> {
    const packages: WorkspacePackage[] = []

    for (const pattern of workspacePatterns) {
      const workspacePaths = await this.expandWorkspacePattern(pattern)

      for (const workspacePath of workspacePaths) {
        const packageJsonPath = path.join(this.config.workspaceRoot, workspacePath, 'package.json')

        if (await this.fileExists(packageJsonPath)) {
          const pkg = await this.analyzePackageJson(packageJsonPath)
          if (pkg) {
            packages.push(pkg)
          }
        }
      }
    }

    return packages
  }

  /**
   * Check for other workspace types (lerna, nx, rush, etc.)
   */
  private async discoverOtherWorkspaceTypes(packages: WorkspacePackage[]): Promise<void> {
    // Check for lerna.json
    const lernaPath = path.join(this.config.workspaceRoot, 'lerna.json')
    if (await this.fileExists(lernaPath)) {
      try {
        const lernaConfig = JSON.parse(await fs.readFile(lernaPath, 'utf8'))
        if (lernaConfig.packages) {
          const lernaPackages = await this.discoverWorkspaceChildren(lernaConfig.packages)
          packages.push(...lernaPackages)
        }
      } catch (error) {
        console.warn(
          `Failed to parse lerna.json: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    // Check for nx.json
    const nxPath = path.join(this.config.workspaceRoot, 'nx.json')
    if (await this.fileExists(nxPath)) {
      // NX uses project.json files, we could discover those too
      // For now, we'll rely on the package.json workspaces field
    }

    // Check for pnpm-workspace.yaml
    const pnpmWorkspacePath = path.join(this.config.workspaceRoot, 'pnpm-workspace.yaml')
    if (await this.fileExists(pnpmWorkspacePath)) {
      try {
        const pnpmConfig = load(await fs.readFile(pnpmWorkspacePath, 'utf8')) as any
        if (pnpmConfig?.packages) {
          const pnpmPackages = await this.discoverWorkspaceChildren(pnpmConfig.packages)
          packages.push(...pnpmPackages)
        }
      } catch (error) {
        console.warn(
          `Failed to parse pnpm-workspace.yaml: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }

  /**
   * Analyze a package.json file and extract package information
   */
  private async analyzePackageJson(packageJsonPath: string): Promise<WorkspacePackage | null> {
    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'))

      const packagePath = path.dirname(packageJsonPath)
      const relativePath = path.relative(this.config.workspaceRoot, packagePath)

      return {
        name: packageJson.name || path.basename(packagePath),
        path: relativePath || '.',
        packageJsonPath,
        version: packageJson.version || '0.0.0',
        dependencies: packageJson.dependencies || {},
        devDependencies: packageJson.devDependencies || {},
        peerDependencies: packageJson.peerDependencies || {},
        optionalDependencies: packageJson.optionalDependencies || {},
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

  /**
   * Expand workspace patterns to actual directory paths
   */
  private async expandWorkspacePattern(pattern: string): Promise<string[]> {
    // Simple implementation - in a real scenario, you'd use a proper glob library
    const paths: string[] = []

    // Handle common patterns
    if (pattern.includes('*')) {
      // For now, we'll implement basic patterns
      if (pattern === 'packages/*') {
        const packagesDir = path.join(this.config.workspaceRoot, 'packages')
        if (await this.directoryExists(packagesDir)) {
          const entries = await fs.readdir(packagesDir, {withFileTypes: true})
          for (const entry of entries) {
            if (entry.isDirectory()) {
              paths.push(`packages/${entry.name}`)
            }
          }
        }
      } else if (pattern === 'apps/*') {
        const appsDir = path.join(this.config.workspaceRoot, 'apps')
        if (await this.directoryExists(appsDir)) {
          const entries = await fs.readdir(appsDir, {withFileTypes: true})
          for (const entry of entries) {
            if (entry.isDirectory()) {
              paths.push(`apps/${entry.name}`)
            }
          }
        }
      }
      // Add more pattern handling as needed
    } else if (await this.directoryExists(path.join(this.config.workspaceRoot, pattern))) {
      // Direct path
      paths.push(pattern)
    }

    return paths
  }

  /**
   * Analyze relationships between packages
   */
  private async analyzePackageRelationships(
    packages: WorkspacePackage[],
  ): Promise<PackageRelationship[]> {
    const relationships: PackageRelationship[] = []

    // Create a map of package names for quick lookup
    const packageMap = new Map<string, WorkspacePackage>()
    for (const pkg of packages) {
      packageMap.set(pkg.name, pkg)
    }

    // Analyze each package's dependencies
    for (const pkg of packages) {
      // Check internal dependencies
      if (this.config.analyzeInternalDependencies) {
        this.analyzeInternalDependencies(pkg, packageMap, relationships)
      }

      // Check version consistency requirements
      if (this.config.enforceVersionConsistency) {
        this.analyzeVersionConsistency(pkg, packages, relationships)
      }
    }

    return relationships
  }

  /**
   * Analyze internal dependencies between workspace packages
   */
  private analyzeInternalDependencies(
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
      if (targetPackage) {
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

  /**
   * Analyze version consistency requirements
   */
  private analyzeVersionConsistency(
    pkg: WorkspacePackage,
    allPackages: WorkspacePackage[],
    relationships: PackageRelationship[],
  ): void {
    for (const pattern of this.config.versionConsistencyPatterns) {
      const allDeps = {...pkg.dependencies, ...pkg.devDependencies}

      for (const [depName, version] of Object.entries(allDeps)) {
        if (this.matchesPattern(depName, pattern)) {
          // Find other packages with the same dependency
          for (const otherPkg of allPackages) {
            if (otherPkg.name === pkg.name) continue

            const otherDeps = {...otherPkg.dependencies, ...otherPkg.devDependencies}
            if (otherDeps[depName] && otherDeps[depName] !== version) {
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

  /**
   * Determine which packages are affected by the update
   */
  private async determineAffectedPackages(
    dependencies: RenovateDependency[],
    changedFiles: string[],
    workspacePackages: WorkspacePackage[],
    relationships: PackageRelationship[],
  ): Promise<string[]> {
    const affectedPackages = new Set<string>()

    // Direct analysis from changed files
    for (const file of changedFiles) {
      const pkg = this.findPackageForFile(file, workspacePackages)
      if (pkg) {
        affectedPackages.add(pkg.name)
      }
    }

    // Analysis from dependency names
    for (const dep of dependencies) {
      // Check if any workspace package has this dependency
      for (const pkg of workspacePackages) {
        const allDeps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
          ...pkg.peerDependencies,
          ...pkg.optionalDependencies,
        }

        if (allDeps[dep.name]) {
          affectedPackages.add(pkg.name)
        }
      }
    }

    // Add packages affected by relationships
    const directlyAffected = Array.from(affectedPackages)
    for (const packageName of directlyAffected) {
      const relatedPackages = this.findRelatedPackages(packageName, relationships)
      for (const related of relatedPackages) {
        affectedPackages.add(related)
      }
    }

    return Array.from(affectedPackages)
  }

  /**
   * Perform impact analysis for the multi-package update
   */
  private async performImpactAnalysis(
    dependencies: RenovateDependency[],
    affectedPackages: string[],
    relationships: PackageRelationship[],
    workspacePackages: WorkspacePackage[],
  ): Promise<MultiPackageAnalysisResult['impactAnalysis']> {
    const directlyAffected = affectedPackages.filter(pkgName => {
      const pkg = workspacePackages.find(p => p.name === pkgName)
      if (!pkg) return false

      const allDeps = {...pkg.dependencies, ...pkg.devDependencies}
      return dependencies.some(dep => allDeps[dep.name])
    })

    const indirectlyAffected = affectedPackages.filter(
      pkgName => !directlyAffected.includes(pkgName),
    )

    // Calculate risk level based on impact
    let riskLevel: 'low' | 'medium' | 'high' = 'low'
    if (affectedPackages.length > 5) {
      riskLevel = 'high'
    } else if (affectedPackages.length > 2 || indirectlyAffected.length > 0) {
      riskLevel = 'medium'
    }

    // Determine changeset strategy
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

  /**
   * Generate recommendations for changeset creation
   */
  private async generateRecommendations(
    workspacePackages: WorkspacePackage[],
    relationships: PackageRelationship[],
    impactAnalysis: MultiPackageAnalysisResult['impactAnalysis'],
  ): Promise<MultiPackageAnalysisResult['recommendations']> {
    const reasoningChain: string[] = []

    // Determine if we should create separate changesets
    const createSeparateChangesets =
      workspacePackages.length > 1 && impactAnalysis.changesetStrategy !== 'single'

    reasoningChain.push(`Workspace contains ${workspacePackages.length} packages`)
    reasoningChain.push(`${impactAnalysis.directlyAffected.length} packages directly affected`)
    reasoningChain.push(`${impactAnalysis.indirectlyAffected.length} packages indirectly affected`)
    reasoningChain.push(`Risk level: ${impactAnalysis.riskLevel}`)
    reasoningChain.push(`Recommended strategy: ${impactAnalysis.changesetStrategy}`)

    // Group packages for changeset creation
    const packageGroups: string[][] = []

    if (createSeparateChangesets) {
      if (impactAnalysis.changesetStrategy === 'grouped') {
        // Group related packages together
        const processed = new Set<string>()

        for (const pkgName of impactAnalysis.directlyAffected) {
          if (processed.has(pkgName)) continue

          const group = [pkgName]
          const related = this.findRelatedPackages(pkgName, relationships)

          for (const relatedPkg of related) {
            if (
              impactAnalysis.directlyAffected.includes(relatedPkg) &&
              !processed.has(relatedPkg)
            ) {
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
        // Separate changeset for each affected package
        for (const pkgName of impactAnalysis.directlyAffected) {
          packageGroups.push([pkgName])
        }
        reasoningChain.push(`Creating separate changesets for each affected package`)
      }
    } else {
      // Single changeset for all packages
      packageGroups.push(impactAnalysis.directlyAffected)
      reasoningChain.push(`Creating single changeset for all affected packages`)
    }

    return {
      createSeparateChangesets,
      packageGroups,
      reasoningChain,
    }
  }

  /**
   * Find the package that contains a given file
   */
  private findPackageForFile(
    filePath: string,
    packages: WorkspacePackage[],
  ): WorkspacePackage | null {
    // Sort packages by path length (longest first) to match most specific package
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

  /**
   * Find packages related to the given package through relationships
   */
  private findRelatedPackages(packageName: string, relationships: PackageRelationship[]): string[] {
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

  /**
   * Check if a dependency name matches a pattern
   */
  private matchesPattern(name: string, pattern: string): boolean {
    if (pattern.includes('*')) {
      const regex = new RegExp(`^${pattern.replaceAll('*', '.*')}$`)
      return regex.test(name)
    }
    return name === pattern
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Check if a directory exists
   */
  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath)
      return stat.isDirectory()
    } catch {
      return false
    }
  }
}
