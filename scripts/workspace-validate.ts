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

    return {
      totalPackages: this.packages.length,
      dependencyCount,
      versionConflicts,
      unusedDependencies: [], // TODO: Implement unused dependency detection
      missingPeerDependencies: [], // TODO: Implement peer dependency validation
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
}

async function main() {
  try {
    const workspaceRoot = process.cwd()
    const validator = new WorkspaceValidator(workspaceRoot)

    const report = await validator.analyze()
    validator.printReport(report)

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
