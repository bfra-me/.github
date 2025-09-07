#!/usr/bin/env tsx

/**
 * Comprehensive package dependency analysis and workspace validation script
 *
 * This script analyzes the monorepo workspace structure, validates dependencies,
 * and ensures consistent package configurations across all workspace packages.
 */

import {existsSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import process from 'node:process'

import {getPackages, type Package} from '@manypkg/get-packages'

interface ValidationResult {
  package: Package
  issues: ValidationIssue[]
  warnings: ValidationWarning[]
}

interface ValidationIssue {
  type: 'error' | 'warning'
  message: string
  field?: string
  suggestion?: string
}

interface ValidationWarning {
  type: 'warning'
  message: string
  field?: string
}

interface DependencyAnalysis {
  totalPackages: number
  dependencyCount: Record<string, number>
  versionConflicts: {
    dependency: string
    versions: {package: string; version: string}[]
  }[]
  unusedDependencies: {package: string; dependencies: string[]}[]
  missingPeerDependencies: {package: string; missing: string[]}[]
  dependencyGraph: DependencyGraph
}

interface DependencyGraph {
  nodes: DependencyNode[]
  edges: DependencyEdge[]
  cycles: DependencyCycle[]
  orphans: string[]
  levels: DependencyLevel[]
}

interface DependencyNode {
  id: string
  name: string
  version: string
  type: 'workspace' | 'external'
  packagePath?: string
}

interface DependencyEdge {
  from: string
  to: string
  dependencyType: 'dependencies' | 'devDependencies' | 'peerDependencies'
  version: string
}

interface DependencyCycle {
  packages: string[]
  chain: string[]
}

interface DependencyLevel {
  level: number
  packages: string[]
}

interface WorkspaceHealthReport {
  timestamp: string
  packages: ValidationResult[]
  dependencyAnalysis: DependencyAnalysis
  summary: {
    totalIssues: number
    totalWarnings: number
    packagesWithIssues: number
    healthScore: number
  }
}

class WorkspaceValidator {
  private packages: Package[] = []
  private validationResults: ValidationResult[] = []

  constructor(private workspaceRoot: string) {}

  async analyze(): Promise<WorkspaceHealthReport> {
    console.log('🔍 Analyzing workspace packages...')

    // Get all packages in the workspace
    const {packages} = await getPackages(this.workspaceRoot)
    this.packages = packages

    console.log(`Found ${packages.length} packages in workspace`)

    // Validate each package
    for (const pkg of packages) {
      const result = await this.validatePackage(pkg)
      this.validationResults.push(result)
    }

    // Analyze dependencies across packages
    const dependencyAnalysis = this.analyzeDependencies()

    // Generate health report
    const summary = this.generateSummary()

    return {
      timestamp: new Date().toISOString(),
      packages: this.validationResults,
      dependencyAnalysis,
      summary,
    }
  }

  private async validatePackage(pkg: Package): Promise<ValidationResult> {
    const issues: ValidationIssue[] = []
    const warnings: ValidationWarning[] = []

    // Read package.json
    const packageJsonPath = join(pkg.dir, 'package.json')
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

    // Validate required fields
    this.validateRequiredFields(packageJson, issues)

    // Validate script consistency
    this.validateScriptConsistency(pkg, packageJson, warnings)

    // Validate TypeScript configuration
    this.validateTypeScriptConfig(pkg, warnings)

    // Validate build configuration
    this.validateBuildConfig(pkg, warnings)

    // Validate dependency versions
    this.validateDependencyVersions(packageJson, warnings)

    return {package: pkg, issues, warnings}
  }

  private validateRequiredFields(packageJson: any, issues: ValidationIssue[]): void {
    const requiredFields = ['name', 'version']

    for (const field of requiredFields) {
      if (!packageJson[field]) {
        issues.push({
          type: 'error',
          message: `Missing required field: ${field}`,
          field,
          suggestion: `Add "${field}" to package.json`,
        })
      }
    }

    // Validate name follows conventions
    if (packageJson.name && !/^[@a-z0-9-]+$/.test(packageJson.name)) {
      issues.push({
        type: 'warning',
        message: 'Package name should use lowercase letters, numbers, and hyphens only',
        field: 'name',
      })
    }

    // Validate version follows semver
    if (packageJson.version && !/^\d+\.\d+\.\d+/.test(packageJson.version)) {
      issues.push({
        type: 'warning',
        message: 'Version should follow semantic versioning (x.y.z)',
        field: 'version',
      })
    }
  }

  private validateScriptConsistency(
    pkg: Package,
    packageJson: any,
    warnings: ValidationWarning[],
  ): void {
    const expectedScripts = ['build', 'lint', 'type-check']
    const scripts = packageJson.scripts || {}

    // Check if package has TypeScript files
    const hasTypeScript =
      existsSync(join(pkg.dir, 'src')) || existsSync(join(pkg.dir, 'tsconfig.json'))

    if (hasTypeScript) {
      for (const script of expectedScripts) {
        if (!scripts[script]) {
          warnings.push({
            type: 'warning',
            message: `TypeScript package missing "${script}" script`,
            field: 'scripts',
          })
        }
      }
    }

    // Validate test script for packages with test files
    const hasTests =
      existsSync(join(pkg.dir, 'test')) ||
      existsSync(join(pkg.dir, '__tests__')) ||
      Object.keys(scripts).some(s => s.includes('test'))

    if (hasTests && !scripts.test) {
      warnings.push({
        type: 'warning',
        message: 'Package has test files but no test script',
        field: 'scripts',
      })
    }
  }

  private validateTypeScriptConfig(pkg: Package, warnings: ValidationWarning[]): void {
    const tsconfigPath = join(pkg.dir, 'tsconfig.json')

    if (existsSync(tsconfigPath)) {
      try {
        const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'))

        // Check for extends
        if (!tsconfig.extends) {
          warnings.push({
            type: 'warning',
            message: 'TypeScript config should extend from workspace base config',
            field: 'tsconfig.json',
          })
        }

        // Check for strict mode
        if (!tsconfig.compilerOptions?.strict) {
          warnings.push({
            type: 'warning',
            message: 'TypeScript strict mode should be enabled',
            field: 'tsconfig.json',
          })
        }
      } catch {
        warnings.push({
          type: 'warning',
          message: 'Invalid TypeScript configuration',
          field: 'tsconfig.json',
        })
      }
    }
  }

  private validateBuildConfig(pkg: Package, warnings: ValidationWarning[]): void {
    const packageJsonPath = join(pkg.dir, 'package.json')
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

    // Check for build tools configuration
    const hasBuildScript = packageJson.scripts?.build
    const hasTsup = packageJson.devDependencies?.tsup || packageJson.dependencies?.tsup
    const hasTypeScript = existsSync(join(pkg.dir, 'tsconfig.json'))

    if (hasTypeScript && hasBuildScript && !hasTsup) {
      warnings.push({
        type: 'warning',
        message:
          'TypeScript package with build script should consider using tsup for consistent builds',
        field: 'build configuration',
      })
    }

    // Check for proper exports
    if (hasBuildScript && !packageJson.main && !packageJson.exports) {
      warnings.push({
        type: 'warning',
        message: 'Built package should define main or exports field',
        field: 'package.json',
      })
    }
  }

  private validateDependencyVersions(packageJson: any, warnings: ValidationWarning[]): void {
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
      ...packageJson.peerDependencies,
    }

    // Check for exact versions vs ranges
    Object.entries(deps).forEach(([name, version]) => {
      if (typeof version === 'string' && version.startsWith('^') && name.startsWith('@bfra.me/')) {
        warnings.push({
          type: 'warning',
          message: `Internal dependency "${name}" should use exact version`,
          field: 'dependencies',
        })
      }
    })
  }

  private analyzeDependencies(): DependencyAnalysis {
    const dependencyCount: Record<string, number> = {}
    const versionMap: Record<string, {package: string; version: string}[]> = {}

    // Count dependencies across packages
    for (const pkg of this.packages) {
      const packageJsonPath = join(pkg.dir, 'package.json')
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
        ...packageJson.peerDependencies,
      }

      Object.entries(allDeps).forEach(([name, version]) => {
        dependencyCount[name] = (dependencyCount[name] || 0) + 1

        if (!versionMap[name]) {
          versionMap[name] = []
        }
        versionMap[name].push({package: pkg.dir, version: version as string})
      })
    }

    // Find version conflicts
    const versionConflicts = Object.entries(versionMap)
      .filter(([_, versions]) => {
        const uniqueVersions = new Set(versions.map(v => v.version))
        return uniqueVersions.size > 1
      })
      .map(([dependency, versions]) => ({dependency, versions}))

    // Generate dependency graph
    const dependencyGraph = this.generateDependencyGraph()

    return {
      totalPackages: this.packages.length,
      dependencyCount,
      versionConflicts,
      unusedDependencies: [], // Could be enhanced later
      missingPeerDependencies: [], // Could be enhanced later
      dependencyGraph,
    }
  }

  private generateDependencyGraph(): DependencyGraph {
    const nodes: DependencyNode[] = []
    const edges: DependencyEdge[] = []
    const nodeMap = new Map<string, DependencyNode>()
    const workspacePackageNames = new Set<string>()

    // First pass: collect all workspace packages
    for (const pkg of this.packages) {
      const packageJsonPath = join(pkg.dir, 'package.json')
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
      if (packageJson.name) {
        workspacePackageNames.add(packageJson.name)
      }
    }

    // Second pass: create nodes for workspace packages
    for (const pkg of this.packages) {
      const packageJsonPath = join(pkg.dir, 'package.json')
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

      if (packageJson.name) {
        const node: DependencyNode = {
          id: packageJson.name,
          name: packageJson.name,
          version: packageJson.version || '0.0.0',
          type: 'workspace',
          packagePath: pkg.dir,
        }
        nodes.push(node)
        nodeMap.set(packageJson.name, node)
      }
    }

    // Third pass: create nodes for external dependencies and edges
    for (const pkg of this.packages) {
      const packageJsonPath = join(pkg.dir, 'package.json')
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

      if (!packageJson.name) continue

      const fromNodeId = packageJson.name

      // Process different dependency types
      const dependencyTypes = ['dependencies', 'devDependencies', 'peerDependencies'] as const

      for (const depType of dependencyTypes) {
        const deps = packageJson[depType] || {}

        for (const [depName, version] of Object.entries(deps)) {
          // Create external dependency node if it doesn't exist
          if (!nodeMap.has(depName)) {
            const externalNode: DependencyNode = {
              id: depName,
              name: depName,
              version: version as string,
              type: 'external',
            }
            nodes.push(externalNode)
            nodeMap.set(depName, externalNode)
          }

          // Create edge
          edges.push({
            from: fromNodeId,
            to: depName,
            dependencyType: depType,
            version: version as string,
          })
        }
      }
    }

    // Detect cycles (only among workspace packages)
    const cycles = this.detectDependencyCycles(workspacePackageNames, edges)

    // Find orphan packages (workspace packages with no dependencies and no dependents)
    const orphans = this.findOrphanPackages(workspacePackageNames, edges)

    // Calculate dependency levels (topological ordering)
    const levels = this.calculateDependencyLevels(workspacePackageNames, edges)

    return {
      nodes,
      edges,
      cycles,
      orphans,
      levels,
    }
  }

  private detectDependencyCycles(
    workspacePackages: Set<string>,
    edges: DependencyEdge[],
  ): DependencyCycle[] {
    const cycles: DependencyCycle[] = []
    const visited = new Set<string>()
    const recursionStack = new Set<string>()
    const path: string[] = []

    // Build adjacency list for workspace packages only
    const graph = new Map<string, string[]>()
    for (const pkg of workspacePackages) {
      graph.set(pkg, [])
    }

    for (const edge of edges) {
      if (workspacePackages.has(edge.from) && workspacePackages.has(edge.to)) {
        graph.get(edge.from)?.push(edge.to)
      }
    }

    function dfs(node: string): boolean {
      if (recursionStack.has(node)) {
        // Found a cycle - extract the cycle from the path
        const cycleStart = path.indexOf(node)
        const cyclePackages = path.slice(cycleStart)
        const chain = [...cyclePackages, node] // Complete the cycle

        cycles.push({
          packages: Array.from(new Set(cyclePackages)),
          chain,
        })
        return true
      }

      if (visited.has(node)) {
        return false
      }

      visited.add(node)
      recursionStack.add(node)
      path.push(node)

      const neighbors = graph.get(node) || []
      for (const neighbor of neighbors) {
        if (dfs(neighbor)) {
          return true
        }
      }

      recursionStack.delete(node)
      path.pop()
      return false
    }

    for (const pkg of workspacePackages) {
      if (!visited.has(pkg)) {
        dfs(pkg)
      }
    }

    return cycles
  }

  private findOrphanPackages(workspacePackages: Set<string>, edges: DependencyEdge[]): string[] {
    const hasDependencies = new Set<string>()
    const hasDependents = new Set<string>()

    for (const edge of edges) {
      if (workspacePackages.has(edge.from) && workspacePackages.has(edge.to)) {
        hasDependencies.add(edge.from)
        hasDependents.add(edge.to)
      }
    }

    return Array.from(workspacePackages).filter(
      pkg => !hasDependencies.has(pkg) && !hasDependents.has(pkg),
    )
  }

  private calculateDependencyLevels(
    workspacePackages: Set<string>,
    edges: DependencyEdge[],
  ): DependencyLevel[] {
    const graph = new Map<string, string[]>()
    const inDegree = new Map<string, number>()

    // Initialize
    for (const pkg of workspacePackages) {
      graph.set(pkg, [])
      inDegree.set(pkg, 0)
    }

    // Build graph and calculate in-degrees (workspace packages only)
    for (const edge of edges) {
      if (workspacePackages.has(edge.from) && workspacePackages.has(edge.to)) {
        graph.get(edge.from)?.push(edge.to)
        inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1)
      }
    }

    // Topological sort with levels
    const levels: DependencyLevel[] = []
    const queue: string[] = []
    let currentLevel = 0

    // Find packages with no dependencies (level 0)
    for (const [pkg, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(pkg)
      }
    }

    while (queue.length > 0) {
      const currentLevelPackages: string[] = []
      const nextQueue: string[] = []

      // Process all packages at the current level
      while (queue.length > 0) {
        const pkg = queue.shift()
        if (!pkg) break
        currentLevelPackages.push(pkg)

        // Update dependencies
        const neighbors = graph.get(pkg) || []
        for (const neighbor of neighbors) {
          const newDegree = (inDegree.get(neighbor) || 0) - 1
          inDegree.set(neighbor, newDegree)

          if (newDegree === 0) {
            nextQueue.push(neighbor)
          }
        }
      }

      if (currentLevelPackages.length > 0) {
        levels.push({
          level: currentLevel,
          packages: currentLevelPackages,
        })
        currentLevel++
      }

      queue.push(...nextQueue)
    }

    return levels
  }

  private printDependencyGraph(graph: DependencyGraph): void {
    console.log('📊 Dependency Graph Analysis:')
    console.log('================================')

    // Workspace packages summary
    const workspaceNodes = graph.nodes.filter(n => n.type === 'workspace')
    const externalNodes = graph.nodes.filter(n => n.type === 'external')
    console.log(`Workspace Packages: ${workspaceNodes.length}`)
    console.log(`External Dependencies: ${externalNodes.length}`)
    console.log(`Total Dependencies: ${graph.edges.length}`)
    console.log()

    // Dependency cycles
    if (graph.cycles.length > 0) {
      console.log('🔄 Dependency Cycles:')
      graph.cycles.forEach((cycle, index) => {
        console.log(`  Cycle ${index + 1}: ${cycle.chain.join(' → ')}`)
      })
      console.log()
    } else {
      console.log('✅ No dependency cycles detected')
      console.log()
    }

    // Orphan packages
    if (graph.orphans.length > 0) {
      console.log('🏝️  Orphan Packages (no dependencies or dependents):')
      graph.orphans.forEach(pkg => {
        console.log(`  • ${pkg}`)
      })
      console.log()
    }

    // Dependency levels (build order)
    if (graph.levels.length > 0) {
      console.log('📈 Build Order (Dependency Levels):')
      graph.levels.forEach(level => {
        console.log(`  Level ${level.level}: ${level.packages.join(', ')}`)
      })
      console.log()
    }

    // Workspace dependency overview
    if (workspaceNodes.length > 0) {
      console.log('🔗 Workspace Dependencies:')
      const workspaceEdges = graph.edges.filter(
        e => workspaceNodes.some(n => n.id === e.from) && workspaceNodes.some(n => n.id === e.to),
      )

      if (workspaceEdges.length > 0) {
        const dependencyMap = new Map<string, string[]>()
        workspaceEdges.forEach(edge => {
          if (!dependencyMap.has(edge.from)) {
            dependencyMap.set(edge.from, [])
          }
          dependencyMap.get(edge.from)?.push(`${edge.to} (${edge.dependencyType})`)
        })

        for (const [pkg, deps] of dependencyMap.entries()) {
          console.log(`  ${pkg}:`)
          deps.forEach(dep => console.log(`    → ${dep}`))
        }
      } else {
        console.log('  No workspace inter-dependencies found')
      }
      console.log()
    }

    // Most used external dependencies
    const externalDepCount = new Map<string, number>()
    graph.edges
      .filter(e => externalNodes.some(n => n.id === e.to))
      .forEach(edge => {
        externalDepCount.set(edge.to, (externalDepCount.get(edge.to) || 0) + 1)
      })

    if (externalDepCount.size > 0) {
      console.log('📦 Most Used External Dependencies:')
      const sortedDeps = Array.from(externalDepCount.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)

      sortedDeps.forEach(([dep, count]) => {
        console.log(`  ${dep}: used by ${count} package${count > 1 ? 's' : ''}`)
      })
      console.log()
    }
  }

  private generateSummary() {
    const totalIssues = this.validationResults.reduce(
      (sum, result) => sum + result.issues.filter(i => i.type === 'error').length,
      0,
    )

    const totalWarnings = this.validationResults.reduce(
      (sum, result) =>
        sum + result.issues.filter(i => i.type === 'warning').length + result.warnings.length,
      0,
    )

    const packagesWithIssues = this.validationResults.filter(
      result => result.issues.length > 0 || result.warnings.length > 0,
    ).length

    // Calculate health score (0-100)
    const maxPossibleIssues = this.packages.length * 10 // Arbitrary baseline
    const healthScore = Math.max(
      0,
      Math.min(100, 100 - ((totalIssues * 10 + totalWarnings * 2) / maxPossibleIssues) * 100),
    )

    return {
      totalIssues,
      totalWarnings,
      packagesWithIssues,
      healthScore: Math.round(healthScore),
    }
  }

  printReport(report: WorkspaceHealthReport): void {
    console.log('\n📊 Workspace Health Report')
    console.log('===========================')
    console.log(`Generated: ${new Date(report.timestamp).toLocaleString()}`)
    console.log(`Packages: ${report.dependencyAnalysis.totalPackages}`)
    console.log(`Health Score: ${report.summary.healthScore}%`)
    console.log()

    // Summary
    if (report.summary.totalIssues > 0) {
      console.log(`❌ Issues: ${report.summary.totalIssues}`)
    }
    if (report.summary.totalWarnings > 0) {
      console.log(`⚠️  Warnings: ${report.summary.totalWarnings}`)
    }
    if (report.summary.totalIssues === 0 && report.summary.totalWarnings === 0) {
      console.log('✅ No issues found!')
    }
    console.log()

    // Dependency conflicts
    if (report.dependencyAnalysis.versionConflicts.length > 0) {
      console.log('🔄 Version Conflicts:')
      report.dependencyAnalysis.versionConflicts.forEach(conflict => {
        console.log(`  ${conflict.dependency}:`)
        conflict.versions.forEach(v => {
          console.log(`    ${v.package}: ${v.version}`)
        })
      })
      console.log()
    }

    // Dependency graph analysis
    this.printDependencyGraph(report.dependencyAnalysis.dependencyGraph)

    // Package details
    report.packages.forEach(result => {
      if (result.issues.length > 0 || result.warnings.length > 0) {
        console.log(`📦 ${result.package.packageJson.name || result.package.dir}`)

        result.issues.forEach(issue => {
          const icon = issue.type === 'error' ? '❌' : '⚠️'
          console.log(`  ${icon} ${issue.message}`)
          if (issue.suggestion) {
            console.log(`     💡 ${issue.suggestion}`)
          }
        })

        result.warnings.forEach(warning => {
          console.log(`  ⚠️  ${warning.message}`)
        })
        console.log()
      }
    })

    // Recommendations
    if (report.summary.healthScore < 90) {
      console.log('💡 Recommendations:')
      if (report.dependencyAnalysis.versionConflicts.length > 0) {
        console.log('  - Resolve version conflicts by aligning dependency versions')
      }
      if (report.summary.totalWarnings > 0) {
        console.log('  - Address warnings to improve workspace consistency')
      }
      console.log('  - Run `pnpm manypkg check` for additional workspace validation')
      console.log()
    }
  }

  /**
   * Visualize the dependency graph as a tree structure
   */
  visualizeDependencyTree(graph: DependencyGraph): void {
    console.log('🌳 Dependency Tree Visualization:')
    console.log('=================================')

    const workspaceNodes = graph.nodes.filter(n => n.type === 'workspace')

    // Build dependency relationships for workspace packages only
    const dependencies = new Map<string, string[]>()
    const dependents = new Map<string, string[]>()

    graph.edges.forEach(edge => {
      if (
        workspaceNodes.some(n => n.id === edge.from) &&
        workspaceNodes.some(n => n.id === edge.to)
      ) {
        if (!dependencies.has(edge.from)) {
          dependencies.set(edge.from, [])
        }
        dependencies.get(edge.from)?.push(edge.to)

        if (!dependents.has(edge.to)) {
          dependents.set(edge.to, [])
        }
        dependents.get(edge.to)?.push(edge.from)
      }
    })

    // Find root packages (packages with no workspace dependencies)
    const rootPackages = workspaceNodes
      .map(n => n.id)
      .filter(id => !dependencies.has(id) || dependencies.get(id)?.length === 0)

    // Find leaf packages (packages that no workspace package depends on)
    const leafPackages = workspaceNodes
      .map(n => n.id)
      .filter(id => !dependents.has(id) || dependents.get(id)?.length === 0)

    if (rootPackages.length > 0) {
      console.log('📁 Root Packages (no workspace dependencies):')
      rootPackages.forEach(pkg => console.log(`  └── ${pkg}`))
      console.log()
    }

    if (leafPackages.length > 0) {
      console.log('🍃 Leaf Packages (no workspace dependents):')
      leafPackages.forEach(pkg => console.log(`  └── ${pkg}`))
      console.log()
    }

    // Show dependency chains
    if (dependencies.size > 0) {
      console.log('🔗 Dependency Chains:')
      const visited = new Set<string>()

      const printChain = (pkg: string, depth = 0, prefix = '  '): void => {
        if (visited.has(pkg)) {
          console.log(`${prefix}${'  '.repeat(depth)}└── ${pkg} (already shown)`)
          return
        }

        console.log(`${prefix}${'  '.repeat(depth)}└── ${pkg}`)
        visited.add(pkg)

        const deps = dependencies.get(pkg) || []
        deps.forEach((dep, index) => {
          const isLast = index === deps.length - 1
          const newPrefix = isLast ? '    ' : '│   '
          printChain(dep, depth + 1, prefix + newPrefix)
        })
      }

      rootPackages.forEach(pkg => {
        visited.clear()
        printChain(pkg)
        console.log()
      })
    }
  }

  /**
   * Export dependency graph data for external tools
   */
  exportDependencyGraph(
    graph: DependencyGraph,
    format: 'json' | 'dot' | 'mermaid' = 'json',
  ): string {
    switch (format) {
      case 'json':
        return JSON.stringify(graph, null, 2)

      case 'dot':
        return this.exportToDot(graph)

      case 'mermaid':
        return this.exportToMermaid(graph)

      default:
        throw new Error(`Unsupported export format: ${format}`)
    }
  }

  private exportToDot(graph: DependencyGraph): string {
    const workspaceNodes = graph.nodes.filter(n => n.type === 'workspace')
    const workspaceEdges = graph.edges.filter(
      e => workspaceNodes.some(n => n.id === e.from) && workspaceNodes.some(n => n.id === e.to),
    )

    let dot = 'digraph dependencies {\n'
    dot += '  rankdir=TB;\n'
    dot += '  node [shape=box, style=filled];\n\n'

    // Add nodes
    workspaceNodes.forEach(node => {
      const color = graph.orphans.includes(node.id) ? 'lightgray' : 'lightblue'
      dot += `  "${node.id}" [fillcolor=${color}];\n`
    })

    dot += '\n'

    // Add edges
    workspaceEdges.forEach(edge => {
      const style = edge.dependencyType === 'devDependencies' ? 'dashed' : 'solid'
      dot += `  "${edge.from}" -> "${edge.to}" [style=${style}];\n`
    })

    dot += '}\n'
    return dot
  }

  private exportToMermaid(graph: DependencyGraph): string {
    const workspaceNodes = graph.nodes.filter(n => n.type === 'workspace')
    const workspaceEdges = graph.edges.filter(
      e => workspaceNodes.some(n => n.id === e.from) && workspaceNodes.some(n => n.id === e.to),
    )

    let mermaid = 'graph TD\n'

    // Add nodes with styling
    workspaceNodes.forEach(node => {
      const safeName = node.id.replaceAll(/[^a-z0-9]/gi, '_')
      const displayName = node.id.replace('@bfra.me/', '')
      mermaid += `  ${safeName}["${displayName}"]\n`

      if (graph.orphans.includes(node.id)) {
        mermaid += `  ${safeName} -.-> ${safeName}\n`
      }
    })

    mermaid += '\n'

    // Add edges
    workspaceEdges.forEach(edge => {
      const fromSafe = edge.from.replaceAll(/[^a-z0-9]/gi, '_')
      const toSafe = edge.to.replaceAll(/[^a-z0-9]/gi, '_')
      const arrow = edge.dependencyType === 'devDependencies' ? '-.-> ' : '-->'
      mermaid += `  ${fromSafe} ${arrow} ${toSafe}\n`
    })

    return mermaid
  }
}

async function main() {
  try {
    const args = process.argv.slice(2)
    const workspaceRoot = process.cwd()
    const validator = new WorkspaceValidator(workspaceRoot)

    // Parse command line arguments
    const showTree = args.includes('--tree') || args.includes('-t')
    const exportFormat = args.find(arg => arg.startsWith('--export='))?.split('=')[1] as
      | 'json'
      | 'dot'
      | 'mermaid'
      | undefined
    const help = args.includes('--help') || args.includes('-h')

    if (help) {
      console.log('Workspace Validation and Dependency Analysis Tool')
      console.log('')
      console.log('Usage: tsx workspace-validate.ts [options]')
      console.log('')
      console.log('Options:')
      console.log('  -g, --graph           Show detailed dependency graph analysis')
      console.log('  -t, --tree            Show dependency tree visualization')
      console.log('  --export=FORMAT       Export dependency graph (json|dot|mermaid)')
      console.log('  -h, --help            Show this help message')
      console.log('')
      console.log('Examples:')
      console.log('  tsx workspace-validate.ts                 # Basic validation')
      console.log('  tsx workspace-validate.ts --graph         # With dependency graph')
      console.log('  tsx workspace-validate.ts --tree          # With tree visualization')
      console.log('  tsx workspace-validate.ts --export=json   # Export graph as JSON')
      console.log('  tsx workspace-validate.ts --export=dot    # Export graph as DOT format')
      console.log('  tsx workspace-validate.ts --export=mermaid # Export graph as Mermaid')
      return
    }

    console.log('🔍 Analyzing workspace packages...')
    const report = await validator.analyze()

    // Always show basic report
    validator.printReport(report)

    // Show additional visualizations if requested
    if (showTree) {
      validator.visualizeDependencyTree(report.dependencyAnalysis.dependencyGraph)
    }

    // Export graph if requested
    if (exportFormat) {
      console.log(`📄 Exporting dependency graph as ${exportFormat.toUpperCase()}:`)
      console.log('='.repeat(50))
      const exported = validator.exportDependencyGraph(
        report.dependencyAnalysis.dependencyGraph,
        exportFormat,
      )
      console.log(exported)
    }

    // Exit with error code if there are issues
    if (report.summary.totalIssues > 0) {
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Workspace validation failed:', error)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export {WorkspaceValidator, type WorkspaceHealthReport}
