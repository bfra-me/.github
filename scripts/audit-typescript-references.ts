#!/usr/bin/env tsx

/**
 * TypeScript Project References Audit Script
 *
 * Analyzes the current TypeScript project references configuration in the monorepo
 * and provides comprehensive audit results and recommendations for optimization.
 */

import {existsSync, readFileSync} from 'node:fs'
import {join, relative} from 'node:path'
import process from 'node:process'

import {getPackages, type Package} from '@manypkg/get-packages'

interface TypeScriptConfig {
  extends?: string | string[]
  compilerOptions?: Record<string, any>
  references?: {path: string}[]
  include?: string[]
  exclude?: string[]
  files?: string[]
}

interface PackageTypeScriptInfo {
  package: Package
  hasTypeScript: boolean
  tsconfigPath?: string
  tsconfig?: TypeScriptConfig
  hasSourceFiles: boolean
  sourceFilePatterns: string[]
  buildOutputPath?: string
  issues: TypeScriptIssue[]
  recommendations: string[]
}

interface TypeScriptIssue {
  type: 'error' | 'warning' | 'info'
  message: string
  file?: string
  suggestion?: string
}

interface ProjectReferencesAudit {
  timestamp: string
  rootTsconfigPath: string
  rootTsconfig: TypeScriptConfig
  packages: PackageTypeScriptInfo[]
  currentReferences: string[]
  expectedReferences: string[]
  missingReferences: string[]
  invalidReferences: string[]
  inheritanceChain: string[]
  crossPackageDependencies: {from: string; to: string; type: string}[]
  recommendations: string[]
  summary: {
    totalPackages: number
    packagesWithTypeScript: number
    packagesWithValidConfig: number
    referencesConfigured: number
    referencesExpected: number
    issuesFound: number
  }
}

class TypeScriptReferencesAuditor {
  private workspaceRoot: string
  private packages: Package[] = []

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot
  }

  async audit(): Promise<ProjectReferencesAudit> {
    const {packages} = await getPackages(this.workspaceRoot)
    this.packages = packages

    const rootTsconfigPath = join(this.workspaceRoot, 'tsconfig.json')
    let rootTsconfig: TypeScriptConfig = {}

    if (existsSync(rootTsconfigPath)) {
      try {
        rootTsconfig = JSON.parse(readFileSync(rootTsconfigPath, 'utf8'))
      } catch {
        console.error('Failed to parse root tsconfig.json')
      }
    }

    // Analyze each package
    const packageInfos = await Promise.all(this.packages.map(pkg => this.analyzePackage(pkg)))

    // Extract current and expected references
    const currentReferences = rootTsconfig.references?.map(ref => ref.path) || []
    const expectedReferences = packageInfos
      .filter(info => info.hasTypeScript && info.tsconfigPath)
      .map(info => relative(this.workspaceRoot, info.package.dir))

    const missingReferences = expectedReferences.filter(
      ref =>
        !currentReferences.some(current => this.normalizePath(current) === this.normalizePath(ref)),
    )

    const invalidReferences = currentReferences.filter(ref => {
      const fullPath = join(this.workspaceRoot, ref)
      return !existsSync(join(fullPath, 'tsconfig.json'))
    })

    // Analyze inheritance chain
    const inheritanceChain = this.analyzeInheritanceChain(rootTsconfig)

    // Find cross-package dependencies
    const crossPackageDependencies = this.findCrossPackageDependencies(packageInfos)

    // Generate recommendations
    const recommendations = this.generateRecommendations({
      rootTsconfig,
      packageInfos,
      missingReferences,
      invalidReferences,
      inheritanceChain,
    })

    const issuesFound = packageInfos.reduce((sum, info) => sum + info.issues.length, 0)

    return {
      timestamp: new Date().toISOString(),
      rootTsconfigPath,
      rootTsconfig,
      packages: packageInfos,
      currentReferences,
      expectedReferences,
      missingReferences,
      invalidReferences,
      inheritanceChain,
      crossPackageDependencies,
      recommendations,
      summary: {
        totalPackages: this.packages.length,
        packagesWithTypeScript: packageInfos.filter(info => info.hasTypeScript).length,
        packagesWithValidConfig: packageInfos.filter(
          info =>
            info.hasTypeScript &&
            info.tsconfig &&
            info.issues.filter(i => i.type === 'error').length === 0,
        ).length,
        referencesConfigured: currentReferences.length,
        referencesExpected: expectedReferences.length,
        issuesFound,
      },
    }
  }

  private async analyzePackage(pkg: Package): Promise<PackageTypeScriptInfo> {
    const issues: TypeScriptIssue[] = []
    const recommendations: string[] = []

    // Check for TypeScript presence
    const tsconfigPath = join(pkg.dir, 'tsconfig.json')
    const hasConfigFile = existsSync(tsconfigPath)
    const hasSourceFiles = this.hasTypeScriptSourceFiles(pkg.dir)
    const hasTypeScriptDep = !!(
      pkg.packageJson.dependencies?.typescript || pkg.packageJson.devDependencies?.typescript
    )

    const hasTypeScript = hasConfigFile || hasSourceFiles || hasTypeScriptDep

    let tsconfig: TypeScriptConfig | undefined
    if (hasConfigFile) {
      try {
        tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'))
      } catch {
        issues.push({
          type: 'error',
          message: 'Failed to parse tsconfig.json',
          file: 'tsconfig.json',
          suggestion: 'Fix JSON syntax errors in tsconfig.json',
        })
      }
    }

    // Analyze TypeScript configuration issues
    if (hasTypeScript) {
      if (!hasConfigFile) {
        issues.push({
          type: 'warning',
          message: 'Package has TypeScript files but no tsconfig.json',
          suggestion: 'Create a tsconfig.json file extending from workspace base config',
        })
      } else if (tsconfig) {
        this.validateTypeScriptConfig(tsconfig, pkg, issues, recommendations)
      }
    }

    // Detect source file patterns
    const sourceFilePatterns = this.detectSourceFilePatterns(pkg.dir)

    return {
      package: pkg,
      hasTypeScript,
      tsconfigPath: hasConfigFile ? tsconfigPath : undefined,
      tsconfig,
      hasSourceFiles,
      sourceFilePatterns,
      buildOutputPath: this.detectBuildOutputPath(pkg.dir, tsconfig),
      issues,
      recommendations,
    }
  }

  private hasTypeScriptSourceFiles(packageDir: string): boolean {
    const patterns = ['src/**/*.ts', 'src/**/*.tsx', '*.ts', '*.tsx']

    for (const pattern of patterns) {
      if (pattern.includes('**')) {
        // Check if src directory exists for glob patterns
        if (pattern.startsWith('src/') && existsSync(join(packageDir, 'src'))) {
          return true
        }
      } else {
        // Check for direct file patterns
        const files = ['.ts', '.tsx'].map(ext => join(packageDir, `index${ext}`))
        if (files.some(file => existsSync(file))) {
          return true
        }
      }
    }

    return false
  }

  private detectSourceFilePatterns(packageDir: string): string[] {
    const patterns: string[] = []

    if (existsSync(join(packageDir, 'src'))) {
      patterns.push('src/**/*')
    }
    if (existsSync(join(packageDir, 'test'))) {
      patterns.push('test/**/*')
    }
    if (existsSync(join(packageDir, '__tests__'))) {
      patterns.push('__tests__/**/*')
    }

    // Check for root-level TypeScript files
    const rootFiles = ['index.ts', 'index.tsx', 'main.ts', 'app.ts']
    for (const file of rootFiles) {
      if (existsSync(join(packageDir, file))) {
        patterns.push('*.ts')
        break
      }
    }

    return patterns
  }

  private detectBuildOutputPath(
    packageDir: string,
    tsconfig?: TypeScriptConfig,
  ): string | undefined {
    if (tsconfig?.compilerOptions?.outDir) {
      return join(packageDir, tsconfig.compilerOptions.outDir)
    }

    // Common output directories
    const commonPaths = ['dist', 'build', 'lib', 'out']
    for (const path of commonPaths) {
      if (existsSync(join(packageDir, path))) {
        return join(packageDir, path)
      }
    }

    return undefined
  }

  private validateTypeScriptConfig(
    tsconfig: TypeScriptConfig,
    pkg: Package,
    issues: TypeScriptIssue[],
    recommendations: string[],
  ): void {
    // Check extends configuration
    if (tsconfig.extends === undefined) {
      issues.push({
        type: 'warning',
        message: 'TypeScript config should extend from workspace base config',
        file: 'tsconfig.json',
        suggestion: 'Add "extends": "../../../tsconfig.json" to inherit workspace settings',
      })
    } else {
      const extendsPath = Array.isArray(tsconfig.extends) ? tsconfig.extends[0] : tsconfig.extends
      const resolvedPath = join(pkg.dir, extendsPath)
      if (!existsSync(resolvedPath)) {
        issues.push({
          type: 'error',
          message: `Extended config "${extendsPath}" not found`,
          file: 'tsconfig.json',
          suggestion: 'Verify the extends path points to a valid TypeScript configuration',
        })
      }
    }

    // Check compiler options
    const compilerOptions = tsconfig.compilerOptions || {}

    // Strict mode check
    if (!compilerOptions.strict) {
      issues.push({
        type: 'warning',
        message: 'TypeScript strict mode should be enabled',
        file: 'tsconfig.json',
        suggestion: 'Enable strict mode in compilerOptions for better type safety',
      })
    }

    // Module resolution
    if (!compilerOptions.moduleResolution) {
      recommendations.push('Consider explicitly setting moduleResolution in compilerOptions')
    }

    // Output configuration for buildable packages
    const hasBuildScript = !!(pkg.packageJson as any).scripts?.build
    if (hasBuildScript && !compilerOptions.outDir && !compilerOptions.noEmit) {
      recommendations.push('Consider setting outDir in compilerOptions for build output')
    }

    // Include/exclude validation
    if (!tsconfig.include && !tsconfig.files) {
      issues.push({
        type: 'warning',
        message: 'No include patterns or files specified',
        file: 'tsconfig.json',
        suggestion: 'Add include patterns to specify which files to compile',
      })
    }
  }

  private analyzeInheritanceChain(rootTsconfig: TypeScriptConfig): string[] {
    const chain: string[] = ['tsconfig.json (root)']

    let current = rootTsconfig
    let depth = 0
    const maxDepth = 10 // Prevent infinite loops

    while (current.extends && depth < maxDepth) {
      const extendsValue = Array.isArray(current.extends) ? current.extends[0] : current.extends
      chain.push(extendsValue)

      // Try to resolve and read the extended config
      try {
        const extendedPath = extendsValue.startsWith('@')
          ? join(this.workspaceRoot, 'node_modules', extendsValue, 'tsconfig.json')
          : join(this.workspaceRoot, extendsValue)

        if (existsSync(extendedPath)) {
          current = JSON.parse(readFileSync(extendedPath, 'utf8'))
        } else {
          chain.push(`(not found: ${extendedPath})`)
          break
        }
      } catch {
        chain.push(`(parse error: ${extendsValue})`)
        break
      }

      depth++
    }

    return chain
  }

  private findCrossPackageDependencies(
    packageInfos: PackageTypeScriptInfo[],
  ): {from: string; to: string; type: string}[] {
    const dependencies: {from: string; to: string; type: string}[] = []

    for (const packageInfo of packageInfos) {
      const pkg = packageInfo.package
      const deps = {
        ...pkg.packageJson.dependencies,
        ...pkg.packageJson.devDependencies,
        ...pkg.packageJson.peerDependencies,
      }

      // Find dependencies on other workspace packages
      for (const [depName] of Object.entries(deps)) {
        const targetPackage = packageInfos.find(info => info.package.packageJson.name === depName)

        if (targetPackage) {
          const depType = pkg.packageJson.dependencies?.[depName]
            ? 'dependencies'
            : pkg.packageJson.devDependencies?.[depName]
              ? 'devDependencies'
              : 'peerDependencies'

          dependencies.push({
            from: pkg.packageJson.name || pkg.dir,
            to: depName,
            type: depType,
          })
        }
      }
    }

    return dependencies
  }

  private generateRecommendations({
    rootTsconfig,
    packageInfos,
    missingReferences,
    invalidReferences,
    inheritanceChain,
  }: {
    rootTsconfig: TypeScriptConfig
    packageInfos: PackageTypeScriptInfo[]
    missingReferences: string[]
    invalidReferences: string[]
    inheritanceChain: string[]
  }): string[] {
    const recommendations: string[] = []

    // Project references recommendations
    if (missingReferences.length > 0) {
      recommendations.push(
        `Add missing project references to root tsconfig.json: ${missingReferences.join(', ')}`,
      )
    }

    if (invalidReferences.length > 0) {
      recommendations.push(
        `Remove invalid project references from root tsconfig.json: ${invalidReferences.join(', ')}`,
      )
    }

    // Root configuration recommendations
    if (!rootTsconfig.compilerOptions?.composite) {
      recommendations.push(
        'Consider enabling composite mode in root tsconfig.json for better project references support',
      )
    }

    // Package-specific recommendations
    const packagesWithIssues = packageInfos.filter(info => info.issues.length > 0)
    if (packagesWithIssues.length > 0) {
      recommendations.push(
        `Address TypeScript configuration issues in ${packagesWithIssues.length} packages`,
      )
    }

    // Build optimization recommendations
    const buildablePackages = packageInfos.filter(
      info => (info.package.packageJson as any).scripts?.build && info.hasTypeScript,
    )
    if (buildablePackages.length > 0) {
      recommendations.push('Consider implementing incremental compilation for buildable packages')
      recommendations.push(
        'Consider adding composite: true to buildable packages for better caching',
      )
    }

    // Inheritance chain recommendations
    if (inheritanceChain.length > 3) {
      recommendations.push('Consider simplifying the TypeScript configuration inheritance chain')
    }

    return recommendations
  }

  private normalizePath(path: string): string {
    return path.replace(/^\.\//, '').replace(/\/$/, '')
  }

  printAuditReport(audit: ProjectReferencesAudit): void {
    console.log('\n🔍 TypeScript Project References Audit Report')
    console.log('='.repeat(60))
    console.log(`Generated: ${new Date(audit.timestamp).toLocaleString()}`)
    console.log()

    // Summary
    console.log('📊 Summary:')
    console.log(`  Total packages: ${audit.summary.totalPackages}`)
    console.log(`  Packages with TypeScript: ${audit.summary.packagesWithTypeScript}`)
    console.log(`  Packages with valid config: ${audit.summary.packagesWithValidConfig}`)
    console.log(`  References configured: ${audit.summary.referencesConfigured}`)
    console.log(`  References expected: ${audit.summary.referencesExpected}`)
    console.log(`  Issues found: ${audit.summary.issuesFound}`)
    console.log()

    // Root configuration analysis
    console.log('🏗️  Root TypeScript Configuration:')
    console.log(`  Config file: ${audit.rootTsconfigPath}`)
    console.log(`  Extends: ${audit.rootTsconfig.extends || 'none'}`)
    console.log(`  Project references: ${audit.currentReferences.length}`)
    console.log()

    // Inheritance chain
    if (audit.inheritanceChain.length > 1) {
      console.log('🔗 Configuration Inheritance Chain:')
      audit.inheritanceChain.forEach((config, index) => {
        const indent = `${'  '}${'└─ '.repeat(index)}`
        console.log(`${indent}${config}`)
      })
      console.log()
    }

    // Project references analysis
    console.log('📂 Project References Analysis:')
    if (audit.currentReferences.length > 0) {
      console.log('  Current references:')
      audit.currentReferences.forEach(ref => {
        const isValid = !audit.invalidReferences.includes(ref)
        const icon = isValid ? '✅' : '❌'
        console.log(`    ${icon} ${ref}`)
      })
    } else {
      console.log('  No project references configured')
    }

    if (audit.missingReferences.length > 0) {
      console.log('  Missing references:')
      audit.missingReferences.forEach(ref => {
        console.log(`    ➕ ${ref}`)
      })
    }

    if (audit.invalidReferences.length > 0) {
      console.log('  Invalid references:')
      audit.invalidReferences.forEach(ref => {
        console.log(`    ❌ ${ref}`)
      })
    }
    console.log()

    // Cross-package dependencies
    if (audit.crossPackageDependencies.length > 0) {
      console.log('🔗 Cross-Package Dependencies:')
      audit.crossPackageDependencies.forEach(dep => {
        console.log(`  ${dep.from} → ${dep.to} (${dep.type})`)
      })
      console.log()
    }

    // Package details
    console.log('📦 Package Analysis:')
    audit.packages.forEach(packageInfo => {
      const pkg = packageInfo.package
      const name = pkg.packageJson.name || pkg.dir
      const icon = packageInfo.hasTypeScript ? '📘' : '📄'

      console.log(`  ${icon} ${name}`)
      console.log(`    TypeScript: ${packageInfo.hasTypeScript ? 'Yes' : 'No'}`)

      if (packageInfo.hasTypeScript) {
        console.log(`    Config file: ${packageInfo.tsconfigPath ? 'Yes' : 'No'}`)
        console.log(`    Source files: ${packageInfo.hasSourceFiles ? 'Yes' : 'No'}`)

        if (packageInfo.sourceFilePatterns.length > 0) {
          console.log(`    Source patterns: ${packageInfo.sourceFilePatterns.join(', ')}`)
        }

        if (packageInfo.buildOutputPath) {
          console.log(
            `    Build output: ${relative(this.workspaceRoot, packageInfo.buildOutputPath)}`,
          )
        }

        if (packageInfo.issues.length > 0) {
          console.log('    Issues:')
          packageInfo.issues.forEach(issue => {
            const icon = issue.type === 'error' ? '❌' : '⚠️'
            console.log(`      ${icon} ${issue.message}`)
            if (issue.suggestion) {
              console.log(`        💡 ${issue.suggestion}`)
            }
          })
        }

        if (packageInfo.recommendations.length > 0) {
          console.log('    Recommendations:')
          packageInfo.recommendations.forEach(rec => {
            console.log(`      💡 ${rec}`)
          })
        }
      }
      console.log()
    })

    // Overall recommendations
    if (audit.recommendations.length > 0) {
      console.log('💡 Overall Recommendations:')
      audit.recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`)
      })
      console.log()
    }

    // Health score
    const healthScore = Math.round(
      ((audit.summary.packagesWithValidConfig +
        (audit.summary.referencesExpected -
          audit.missingReferences.length -
          audit.invalidReferences.length)) /
        (audit.summary.packagesWithTypeScript + audit.summary.referencesExpected)) *
        100,
    )

    console.log(`🏥 TypeScript Configuration Health Score: ${healthScore}%`)

    if (healthScore < 80) {
      console.log(
        '❗ Consider addressing the issues and recommendations above to improve the health score.',
      )
    } else if (healthScore < 95) {
      console.log('👍 Good configuration! Consider the recommendations for further optimization.')
    } else {
      console.log('🎉 Excellent TypeScript configuration!')
    }

    console.log(`\n${'='.repeat(60)}`)
  }
}

async function main() {
  try {
    const workspaceRoot = process.cwd()
    const auditor = new TypeScriptReferencesAuditor(workspaceRoot)

    console.log('🔍 Starting TypeScript project references audit...')
    const audit = await auditor.audit()

    auditor.printAuditReport(audit)

    // Exit with error code if there are critical issues
    const criticalIssues = audit.packages.reduce(
      (sum, pkg) => sum + pkg.issues.filter(issue => issue.type === 'error').length,
      0,
    )

    if (criticalIssues > 0 || audit.invalidReferences.length > 0) {
      console.log(`\n❌ Audit completed with ${criticalIssues} critical issues`)
      process.exit(1)
    } else {
      console.log('\n✅ Audit completed successfully')
    }
  } catch (error) {
    console.error('❌ TypeScript references audit failed:', error)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export {TypeScriptReferencesAuditor, type ProjectReferencesAudit}
