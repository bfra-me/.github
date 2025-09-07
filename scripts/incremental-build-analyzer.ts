#!/usr/bin/env tsx

/**
 * TypeScript Incremental Build Analyzer
 *
 * Analyzes TypeScript incremental build performance, cache effectiveness,
 * and provides insights for optimizing build times in the monorepo.
 */

import {execSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'
import {getPackages, type Package} from '@manypkg/get-packages'

interface BuildCacheInfo {
  file: string
  size: number
  lastModified: Date
  relatedProject: string
}

interface IncrementalBuildMetrics {
  buildStartTime: number
  buildEndTime: number
  buildDuration: number
  cacheHitRatio: number
  filesChanged: number
  filesRecompiled: number
  projectsRebuilt: string[]
  cacheFiles: BuildCacheInfo[]
}

interface AnalysisReport {
  timestamp: Date
  overallMetrics: IncrementalBuildMetrics
  projectBreakdown: {
    name: string
    buildTime: number
    cacheEffective: boolean
    filesChanged: number
  }[]
  recommendations: string[]
  cacheHealth: {
    totalCacheSize: number
    oldestCache: Date
    newestCache: Date
    staleCacheFiles: string[]
  }
}

class IncrementalBuildAnalyzer {
  private workspaceRoot: string
  private packages: Package[] = []

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot
  }

  async initialize(): Promise<void> {
    const {packages} = await getPackages(this.workspaceRoot)
    this.packages = packages
  }

  /**
   * Analyze current build cache state
   */
  analyzeBuildCache(): BuildCacheInfo[] {
    const cacheFiles: BuildCacheInfo[] = []

    // Analyze root cache files
    const rootCacheDir = path.join(this.workspaceRoot, '.cache')
    if (fs.existsSync(rootCacheDir)) {
      const files = fs.readdirSync(rootCacheDir)
      for (const file of files) {
        if (file.endsWith('.tsbuildinfo')) {
          const filePath = path.join(rootCacheDir, file)
          const stats = fs.statSync(filePath)
          cacheFiles.push({
            file: filePath,
            size: stats.size,
            lastModified: stats.mtime,
            relatedProject: 'root',
          })
        }
      }
    }

    // Analyze package-specific cache files
    for (const pkg of this.packages) {
      const packageCacheDir = path.join(pkg.dir, '.cache')
      if (fs.existsSync(packageCacheDir)) {
        const files = fs.readdirSync(packageCacheDir)
        for (const file of files) {
          if (file.endsWith('.tsbuildinfo')) {
            const filePath = path.join(packageCacheDir, file)
            const stats = fs.statSync(filePath)
            cacheFiles.push({
              file: filePath,
              size: stats.size,
              lastModified: stats.mtime,
              relatedProject: pkg.packageJson.name || path.basename(pkg.dir),
            })
          }
        }
      }
    }

    return cacheFiles
  }

  /**
   * Run a timed incremental build and analyze performance
   */
  async runIncrementalBuildAnalysis(): Promise<IncrementalBuildMetrics> {
    const startTime = Date.now()
    const cacheFilesBefore = this.analyzeBuildCache()

    try {
      // Run the incremental build with verbose output
      const buildOutput = execSync('pnpm build:composite --verbose', {
        cwd: this.workspaceRoot,
        encoding: 'utf8',
        stdio: 'pipe',
      })

      const endTime = Date.now()
      const cacheFilesAfter = this.analyzeBuildCache()

      // Analyze build output for insights
      const projectsRebuilt = this.extractRebuiltProjects(buildOutput)
      const filesRecompiled = this.extractRecompiledFiles(buildOutput)

      return {
        buildStartTime: startTime,
        buildEndTime: endTime,
        buildDuration: endTime - startTime,
        cacheHitRatio: this.calculateCacheHitRatio(cacheFilesBefore, cacheFilesAfter),
        filesChanged: this.countChangedFiles(),
        filesRecompiled,
        projectsRebuilt,
        cacheFiles: cacheFilesAfter,
      }
    } catch (error) {
      throw new Error(`Build failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Extract which projects were rebuilt from build output
   */
  private extractRebuiltProjects(buildOutput: string): string[] {
    const projects: string[] = []
    const lines = buildOutput.split('\n')

    for (const line of lines) {
      // Look for TypeScript build patterns
      if (line.includes('Building project') || line.includes("Project '")) {
        const match = line.match(/(?:Building project|Project ')([^']+)/)
        if (match?.[1]) {
          projects.push(match[1])
        }
      }
    }

    return [...new Set(projects)] // Remove duplicates
  }

  /**
   * Extract number of recompiled files from build output
   */
  private extractRecompiledFiles(buildOutput: string): number {
    const lines = buildOutput.split('\n')
    let totalFiles = 0

    for (const line of lines) {
      // Look for file compilation indicators
      if (line.includes('Found') && line.includes('error')) {
        const match = line.match(/Found (\d+) error/)
        if (match?.[1]) {
          // This indicates files were processed
          totalFiles += Number.parseInt(match[1], 10)
        }
      }
    }

    return totalFiles
  }

  /**
   * Calculate cache hit ratio by comparing cache files before/after
   */
  private calculateCacheHitRatio(before: BuildCacheInfo[], after: BuildCacheInfo[]): number {
    if (before.length === 0) return 0

    let unchangedCaches = 0
    for (const beforeCache of before) {
      const afterCache = after.find(cache => cache.file === beforeCache.file)
      if (afterCache && afterCache.lastModified.getTime() === beforeCache.lastModified.getTime()) {
        unchangedCaches++
      }
    }

    return (unchangedCaches / before.length) * 100
  }

  /**
   * Count changed files using git
   */
  private countChangedFiles(): number {
    try {
      const output = execSync('git status --porcelain', {
        cwd: this.workspaceRoot,
        encoding: 'utf8',
      })
      return output
        .trim()
        .split('\n')
        .filter(line => line.trim()).length
    } catch {
      return 0
    }
  }

  /**
   * Generate comprehensive analysis report
   */
  async generateAnalysisReport(): Promise<AnalysisReport> {
    const metrics = await this.runIncrementalBuildAnalysis()
    const cacheHealth = this.analyzeCacheHealth(metrics.cacheFiles)
    const recommendations = this.generateRecommendations(metrics, cacheHealth)

    return {
      timestamp: new Date(),
      overallMetrics: metrics,
      projectBreakdown: this.generateProjectBreakdown(metrics),
      recommendations,
      cacheHealth,
    }
  }

  /**
   * Analyze cache health and identify issues
   */
  private analyzeCacheHealth(cacheFiles: BuildCacheInfo[]) {
    const totalSize = cacheFiles.reduce((sum, cache) => sum + cache.size, 0)
    const dates = cacheFiles.map(cache => cache.lastModified)
    const oldestCache =
      dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : new Date()
    const newestCache =
      dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : new Date()

    // Identify stale cache files (older than 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const staleCacheFiles = cacheFiles
      .filter(cache => cache.lastModified < sevenDaysAgo)
      .map(cache => cache.file)

    return {
      totalCacheSize: totalSize,
      oldestCache,
      newestCache,
      staleCacheFiles,
    }
  }

  /**
   * Generate project-specific breakdown
   */
  private generateProjectBreakdown(metrics: IncrementalBuildMetrics) {
    return this.packages.map(pkg => ({
      name: pkg.packageJson.name || path.basename(pkg.dir),
      buildTime: metrics.buildDuration / Math.max(1, metrics.projectsRebuilt.length),
      cacheEffective: !metrics.projectsRebuilt.includes(pkg.packageJson.name || ''),
      filesChanged: 0, // This would need more sophisticated git analysis
    }))
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(metrics: IncrementalBuildMetrics, cacheHealth: any): string[] {
    const recommendations: string[] = []

    if (metrics.cacheHitRatio < 50) {
      recommendations.push(
        'Low cache hit ratio detected. Consider checking for frequent config changes or file modifications.',
      )
    }

    if (metrics.buildDuration > 30000) {
      // 30 seconds
      recommendations.push(
        'Build duration is high. Consider splitting large projects or optimizing dependencies.',
      )
    }

    if (cacheHealth.staleCacheFiles.length > 0) {
      recommendations.push(
        `Found ${cacheHealth.staleCacheFiles.length} stale cache files. Consider running build:composite:clean.`,
      )
    }

    if (metrics.projectsRebuilt.length === this.packages.length) {
      recommendations.push(
        'All projects were rebuilt. This suggests a global change or cache invalidation.',
      )
    }

    if (cacheHealth.totalCacheSize > 100 * 1024 * 1024) {
      // 100MB
      recommendations.push('Cache size is large. Consider periodic cache cleanup.')
    }

    return recommendations
  }

  /**
   * Clean stale cache files
   */
  cleanStaleCache(): void {
    const cacheFiles = this.analyzeBuildCache()
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    let cleanedFiles = 0
    for (const cache of cacheFiles) {
      if (cache.lastModified < sevenDaysAgo) {
        try {
          fs.unlinkSync(cache.file)
          cleanedFiles++
          console.log(`Cleaned stale cache: ${cache.file}`)
        } catch (error) {
          console.warn(`Failed to clean cache file ${cache.file}:`, error)
        }
      }
    }

    console.log(`Cleaned ${cleanedFiles} stale cache files`)
  }

  /**
   * Display analysis report in a formatted way
   */
  displayReport(report: AnalysisReport, format: 'text' | 'json' = 'text'): string {
    if (format === 'json') {
      return JSON.stringify(report, null, 2)
    }

    let output = ''
    output += `\n=== TypeScript Incremental Build Analysis Report ===\n`
    output += `Timestamp: ${report.timestamp.toISOString()}\n\n`

    output += `📊 Overall Metrics:\n`
    output += `  Build Duration: ${report.overallMetrics.buildDuration}ms\n`
    output += `  Cache Hit Ratio: ${report.overallMetrics.cacheHitRatio.toFixed(1)}%\n`
    output += `  Files Recompiled: ${report.overallMetrics.filesRecompiled}\n`
    output += `  Projects Rebuilt: ${report.overallMetrics.projectsRebuilt.length}\n\n`

    output += `💾 Cache Health:\n`
    output += `  Total Cache Size: ${(report.cacheHealth.totalCacheSize / 1024).toFixed(1)} KB\n`
    output += `  Cache Files: ${report.overallMetrics.cacheFiles.length}\n`
    output += `  Stale Cache Files: ${report.cacheHealth.staleCacheFiles.length}\n\n`

    if (report.recommendations.length > 0) {
      output += `💡 Recommendations:\n`
      for (const rec of report.recommendations) {
        output += `  • ${rec}\n`
      }
      output += '\n'
    }

    output += `📦 Project Breakdown:\n`
    for (const project of report.projectBreakdown) {
      const cacheStatus = project.cacheEffective ? '✅ Cached' : '🔄 Rebuilt'
      output += `  ${project.name}: ${cacheStatus}\n`
    }

    return output
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2)
  const command = args[0] || 'analyze'
  const format = args.includes('--json') ? 'json' : 'text'

  const analyzer = new IncrementalBuildAnalyzer(process.cwd())
  await analyzer.initialize()

  try {
    switch (command) {
      case 'analyze':
        {
          const report = await analyzer.generateAnalysisReport()
          console.log(analyzer.displayReport(report, format))
        }
        break

      case 'cache-info':
        {
          const cacheFiles = analyzer.analyzeBuildCache()
          if (format === 'json') {
            console.log(JSON.stringify(cacheFiles, null, 2))
          } else {
            console.log('\n=== Build Cache Information ===')
            for (const cache of cacheFiles) {
              console.log(
                `${cache.relatedProject}: ${cache.file} (${(cache.size / 1024).toFixed(1)} KB, ${cache.lastModified.toISOString()})`,
              )
            }
          }
        }
        break

      case 'clean-stale':
        analyzer.cleanStaleCache()
        break

      default:
        console.log(`
Usage: tsx incremental-build-analyzer.ts [command] [options]

Commands:
  analyze        Run full incremental build analysis (default)
  cache-info     Display build cache information
  clean-stale    Clean stale cache files (older than 7 days)

Options:
  --json         Output in JSON format
        `)
        break
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

// Only run main if this is the entry point
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  main().catch(console.error)
}

export {IncrementalBuildAnalyzer, type AnalysisReport, type IncrementalBuildMetrics}
