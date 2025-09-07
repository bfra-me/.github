#!/usr/bin/env tsx

/**
 * Comprehensive build performance monitoring and analysis script
 *
 * This script monitors build performance across all workspace packages,
 * tracks metrics over time, identifies bottlenecks, and provides actionable
 * insights for build optimization in the monorepo.
 */

import {spawn} from 'node:child_process'
import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {performance} from 'node:perf_hooks'
import process from 'node:process'

import {getPackages, type Package} from '@manypkg/get-packages'

interface BuildMetrics {
  packageName: string
  packagePath: string
  buildTime: number
  buildSize?: number
  success: boolean
  error?: string
  timestamp: string
  phase: 'type-check' | 'lint' | 'build' | 'test' | 'full'
  dependencies: string[]
  devDependencies: string[]
  scripts: {
    typeCheck?: string
    lint?: string
    build?: string
    test?: string
  }
}

interface BuildSession {
  sessionId: string
  timestamp: string
  totalDuration: number
  packages: BuildMetrics[]
  parallelCapable: string[]
  buildOrder: string[]
  bottlenecks: BuildBottleneck[]
  summary: BuildSummary
}

interface BuildBottleneck {
  type: 'slow-package' | 'dependency-chain' | 'large-output' | 'frequent-failure'
  description: string
  packageName: string
  impact: 'high' | 'medium' | 'low'
  suggestion: string
  metrics: {
    buildTime?: number
    chainLength?: number
    outputSize?: number
    failureRate?: number
  }
}

interface BuildSummary {
  totalPackages: number
  successfulBuilds: number
  failedBuilds: number
  averageBuildTime: number
  totalBuildTime: number
  fastestBuild: {package: string; time: number}
  slowestBuild: {package: string; time: number}
  performanceScore: number
  trends: BuildTrend[]
}

interface BuildTrend {
  metric: 'build-time' | 'success-rate' | 'package-count'
  direction: 'improving' | 'degrading' | 'stable'
  change: number
  description: string
}

interface BuildOptimizationSuggestion {
  category: 'parallelization' | 'caching' | 'dependency-optimization' | 'script-optimization'
  priority: 'high' | 'medium' | 'low'
  description: string
  implementation: string
  estimatedImprovement: string
  packages: string[]
}

interface HistoricalBuildData {
  sessions: BuildSession[]
  trends: BuildTrend[]
  averageMetrics: {
    buildTime: number
    successRate: number
    packageCount: number
  }
}

interface BuildPerformanceReport {
  timestamp: string
  session: BuildSession
  historical: HistoricalBuildData
  optimizations: BuildOptimizationSuggestion[]
  recommendations: string[]
}

class BuildPerformanceMonitor {
  private packages: Package[] = []
  private buildMetrics: BuildMetrics[] = []
  private dataDir: string
  private sessionId: string

  constructor(private workspaceRoot: string) {
    this.dataDir = join(workspaceRoot, '.build-performance')
    this.sessionId = `build-${Date.now()}`
  }

  async monitor(
    phase: 'type-check' | 'lint' | 'build' | 'test' | 'full' = 'full',
  ): Promise<BuildPerformanceReport> {
    console.log('🔧 Starting build performance monitoring...')

    // Ensure data directory exists
    await this.ensureDataDirectory()

    // Get all packages in the workspace
    const {packages} = await getPackages(this.workspaceRoot)
    this.packages = packages

    console.log(`Found ${packages.length} packages to monitor`)

    const sessionStart = performance.now()

    // Monitor builds based on phase
    switch (phase) {
      case 'type-check':
        await this.monitorPhase('type-check', 'type-check')
        break
      case 'lint':
        await this.monitorPhase('lint', 'lint')
        break
      case 'build':
        await this.monitorPhase('build', 'build')
        break
      case 'test':
        await this.monitorPhase('test', 'test')
        break
      case 'full':
        await this.monitorPhase('type-check', 'type-check')
        await this.monitorPhase('lint', 'lint')
        await this.monitorPhase('build', 'build')
        await this.monitorPhase('test', 'test')
        break
    }

    const sessionEnd = performance.now()
    const totalDuration = sessionEnd - sessionStart

    // Analyze build dependencies and order
    const {parallelCapable, buildOrder} = this.analyzeBuildDependencies()

    // Identify bottlenecks
    const bottlenecks = this.identifyBottlenecks()

    // Generate summary
    const summary = this.generateBuildSummary(totalDuration)

    const session: BuildSession = {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      totalDuration,
      packages: this.buildMetrics,
      parallelCapable,
      buildOrder,
      bottlenecks,
      summary,
    }

    // Load historical data
    const historical = await this.loadHistoricalData()

    // Generate optimization suggestions
    const optimizations = this.generateOptimizationSuggestions(session, historical)

    // Generate recommendations
    const recommendations = this.generateRecommendations(session, optimizations)

    // Save session data
    await this.saveSessionData(session)

    return {
      timestamp: new Date().toISOString(),
      session,
      historical,
      optimizations,
      recommendations,
    }
  }

  private async monitorPhase(phase: BuildMetrics['phase'], script: string): Promise<void> {
    console.log(`\n📊 Monitoring ${phase} phase...`)

    for (const pkg of this.packages) {
      const packageJson = JSON.parse(readFileSync(join(pkg.dir, 'package.json'), 'utf8'))
      const scripts = packageJson.scripts || {}

      // Skip if package doesn't have the required script
      if (!scripts[script]) {
        console.log(`  ⏭️  Skipping ${pkg.packageJson.name} (no ${script} script)`)
        continue
      }

      console.log(`  🔨 Building ${pkg.packageJson.name}...`)

      const startTime = performance.now()
      const buildResult = await this.runBuildCommand(pkg, script)
      const endTime = performance.now()

      const buildTime = endTime - startTime
      const buildSize = await this.calculateBuildSize(pkg)

      const metrics: BuildMetrics = {
        packageName: pkg.packageJson.name,
        packagePath: pkg.dir,
        buildTime,
        buildSize,
        success: buildResult.success,
        error: buildResult.error,
        timestamp: new Date().toISOString(),
        phase,
        dependencies: Object.keys(packageJson.dependencies || {}),
        devDependencies: Object.keys(packageJson.devDependencies || {}),
        scripts: {
          typeCheck: scripts['type-check'],
          lint: scripts.lint,
          build: scripts.build,
          test: scripts.test,
        },
      }

      this.buildMetrics.push(metrics)

      if (buildResult.success) {
        console.log(`    ✅ Built in ${(buildTime / 1000).toFixed(2)}s`)
      } else {
        console.log(`    ❌ Failed: ${buildResult.error}`)
      }
    }
  }

  private async runBuildCommand(
    pkg: Package,
    script: string,
  ): Promise<{success: boolean; error?: string}> {
    return new Promise(resolve => {
      const process = spawn('pnpm', ['run', script], {
        cwd: pkg.dir,
        stdio: 'pipe',
      })

      let errorOutput = ''

      process.stderr?.on('data', data => {
        errorOutput += data.toString()
      })

      process.on('close', code => {
        if (code === 0) {
          resolve({success: true})
        } else {
          resolve({
            success: false,
            error: errorOutput.trim() || `Process exited with code ${code}`,
          })
        }
      })

      process.on('error', error => {
        resolve({
          success: false,
          error: error.message,
        })
      })
    })
  }

  private async calculateBuildSize(pkg: Package): Promise<number> {
    const distPath = join(pkg.dir, 'dist')
    if (!existsSync(distPath)) {
      return 0
    }

    try {
      const {execSync} = await import('node:child_process')
      // Use -s flag for total size, compatible across platforms
      // Convert KB to bytes by multiplying by 1024
      const output = execSync(`du -sk "${distPath}"`, {encoding: 'utf8'})
      return Number.parseInt(output.split('\t')[0], 10) * 1024
    } catch {
      return 0
    }
  }

  private analyzeBuildDependencies(): {parallelCapable: string[]; buildOrder: string[]} {
    // Simple analysis - packages with no workspace dependencies can be built in parallel
    const parallelCapable: string[] = []
    const buildOrder: string[] = []

    for (const pkg of this.packages) {
      const packageJson = JSON.parse(readFileSync(join(pkg.dir, 'package.json'), 'utf8'))
      const dependencies = Object.keys(packageJson.dependencies || {})

      // Check if package has workspace dependencies
      const hasWorkspaceDeps = dependencies.some(dep =>
        this.packages.some(p => p.packageJson.name === dep),
      )

      if (!hasWorkspaceDeps) {
        parallelCapable.push(pkg.packageJson.name)
      }

      buildOrder.push(pkg.packageJson.name)
    }

    return {parallelCapable, buildOrder}
  }

  private identifyBottlenecks(): BuildBottleneck[] {
    const bottlenecks: BuildBottleneck[] = []

    if (this.buildMetrics.length === 0) {
      return bottlenecks
    }

    // Find slow packages (top 20% of build times)
    const sortedByTime = [...this.buildMetrics].sort((a, b) => b.buildTime - a.buildTime)
    const slowThreshold = Math.ceil(sortedByTime.length * 0.2)
    const slowPackages = sortedByTime.slice(0, slowThreshold)

    for (const metrics of slowPackages) {
      if (metrics.buildTime > 10000) {
        // > 10 seconds
        bottlenecks.push({
          type: 'slow-package',
          description: `Package takes ${(metrics.buildTime / 1000).toFixed(2)}s to build`,
          packageName: metrics.packageName,
          impact: metrics.buildTime > 30000 ? 'high' : metrics.buildTime > 20000 ? 'medium' : 'low',
          suggestion:
            'Consider optimizing build configuration, using incremental builds, or reviewing dependencies',
          metrics: {buildTime: metrics.buildTime},
        })
      }
    }

    // Find packages with large output
    for (const metrics of this.buildMetrics) {
      if (metrics.buildSize && metrics.buildSize > 1024 * 1024) {
        // > 1MB
        bottlenecks.push({
          type: 'large-output',
          description: `Package generates ${(metrics.buildSize / 1024 / 1024).toFixed(2)}MB of build output`,
          packageName: metrics.packageName,
          impact: metrics.buildSize > 10 * 1024 * 1024 ? 'high' : 'medium',
          suggestion: 'Consider tree-shaking, code splitting, or reviewing bundler configuration',
          metrics: {outputSize: metrics.buildSize},
        })
      }
    }

    // Find frequently failing packages
    const failedBuilds = this.buildMetrics.filter(m => !m.success)
    for (const metrics of failedBuilds) {
      bottlenecks.push({
        type: 'frequent-failure',
        description: `Package build failed: ${metrics.error}`,
        packageName: metrics.packageName,
        impact: 'high',
        suggestion: 'Fix build errors to improve overall build reliability',
        metrics: {failureRate: 1},
      })
    }

    return bottlenecks
  }

  private generateBuildSummary(_totalDuration: number): BuildSummary {
    const totalPackages = this.buildMetrics.length
    const successfulBuilds = this.buildMetrics.filter(m => m.success).length
    const failedBuilds = totalPackages - successfulBuilds

    const buildTimes = this.buildMetrics.map(m => m.buildTime)
    const averageBuildTime =
      buildTimes.length > 0 ? buildTimes.reduce((a, b) => a + b, 0) / buildTimes.length : 0
    const totalBuildTime = buildTimes.reduce((a, b) => a + b, 0)

    const fastestBuild = this.buildMetrics.reduce(
      (fastest, current) => (current.buildTime < fastest.buildTime ? current : fastest),
      this.buildMetrics[0] || {packageName: 'none', buildTime: 0},
    )

    const slowestBuild = this.buildMetrics.reduce(
      (slowest, current) => (current.buildTime > slowest.buildTime ? current : slowest),
      this.buildMetrics[0] || {packageName: 'none', buildTime: 0},
    )

    // Calculate performance score (0-100)
    const successRate = totalPackages > 0 ? (successfulBuilds / totalPackages) * 100 : 100
    const speedScore = averageBuildTime > 0 ? Math.max(0, 100 - averageBuildTime / 1000) : 100
    const performanceScore = successRate * 0.6 + speedScore * 0.4

    return {
      totalPackages,
      successfulBuilds,
      failedBuilds,
      averageBuildTime,
      totalBuildTime,
      fastestBuild: {package: fastestBuild.packageName, time: fastestBuild.buildTime},
      slowestBuild: {package: slowestBuild.packageName, time: slowestBuild.buildTime},
      performanceScore: Math.round(performanceScore),
      trends: [], // Will be populated from historical data
    }
  }

  private generateOptimizationSuggestions(
    session: BuildSession,
    _historical: HistoricalBuildData,
  ): BuildOptimizationSuggestion[] {
    const suggestions: BuildOptimizationSuggestion[] = []

    // Parallelization suggestions
    if (session.parallelCapable.length > 1) {
      suggestions.push({
        category: 'parallelization',
        priority: 'high',
        description: 'Build independent packages in parallel',
        implementation: 'Use pnpm with --parallel flag or implement custom parallel build script',
        estimatedImprovement: `Up to ${Math.round((session.parallelCapable.length / session.summary.totalPackages) * 100)}% faster builds`,
        packages: session.parallelCapable,
      })
    }

    // Caching suggestions
    if (session.summary.averageBuildTime > 5000) {
      suggestions.push({
        category: 'caching',
        priority: 'medium',
        description: 'Implement build caching to avoid rebuilding unchanged packages',
        implementation: 'Use TypeScript incremental builds or external caching solutions',
        estimatedImprovement: '30-70% faster incremental builds',
        packages: session.packages.filter(p => p.buildTime > 5000).map(p => p.packageName),
      })
    }

    // Dependency optimization
    const packagesWithManyDeps = session.packages.filter(
      p => p.dependencies.length + p.devDependencies.length > 20,
    )
    if (packagesWithManyDeps.length > 0) {
      suggestions.push({
        category: 'dependency-optimization',
        priority: 'medium',
        description: 'Review and optimize package dependencies',
        implementation:
          'Remove unused dependencies, use more specific imports, consider dependency consolidation',
        estimatedImprovement: '10-30% faster builds and smaller bundle sizes',
        packages: packagesWithManyDeps.map(p => p.packageName),
      })
    }

    // Script optimization
    const packagesWithSlowBuilds = session.packages.filter(p => p.buildTime > 15000)
    if (packagesWithSlowBuilds.length > 0) {
      suggestions.push({
        category: 'script-optimization',
        priority: 'high',
        description: 'Optimize build scripts and configurations',
        implementation:
          'Review tsconfig.json, bundler settings, and build scripts for performance optimizations',
        estimatedImprovement: '20-50% faster individual package builds',
        packages: packagesWithSlowBuilds.map(p => p.packageName),
      })
    }

    return suggestions
  }

  private generateRecommendations(
    session: BuildSession,
    _optimizations: BuildOptimizationSuggestion[],
  ): string[] {
    const recommendations: string[] = []

    // Performance recommendations
    if (session.summary.performanceScore < 70) {
      recommendations.push(
        '📈 Build performance is below optimal. Consider implementing the suggested optimizations.',
      )
    }

    if (session.summary.failedBuilds > 0) {
      recommendations.push(
        '🚨 Address build failures first - they have the highest impact on development workflow.',
      )
    }

    if (session.parallelCapable.length > 1) {
      recommendations.push('⚡ Implement parallel builds to significantly reduce total build time.')
    }

    if (session.bottlenecks.some(b => b.impact === 'high')) {
      recommendations.push(
        '🎯 Focus on high-impact bottlenecks for maximum performance improvement.',
      )
    }

    if (session.summary.averageBuildTime > 10000) {
      recommendations.push(
        '🔧 Consider implementing incremental builds and build caching for faster development cycles.',
      )
    }

    // Historical trend recommendations
    if (session.summary.trends.some(t => t.direction === 'degrading')) {
      recommendations.push(
        '📉 Build performance is degrading over time. Regular monitoring and optimization is recommended.',
      )
    }

    return recommendations
  }

  private async ensureDataDirectory(): Promise<void> {
    try {
      await mkdir(this.dataDir, {recursive: true})
    } catch {
      // Directory might already exist
    }
  }

  private async loadHistoricalData(): Promise<HistoricalBuildData> {
    const historyFile = join(this.dataDir, 'history.json')

    if (!existsSync(historyFile)) {
      return {
        sessions: [],
        trends: [],
        averageMetrics: {
          buildTime: 0,
          successRate: 100,
          packageCount: 0,
        },
      }
    }

    try {
      const data = JSON.parse(readFileSync(historyFile, 'utf8'))
      return data
    } catch {
      return {
        sessions: [],
        trends: [],
        averageMetrics: {
          buildTime: 0,
          successRate: 100,
          packageCount: 0,
        },
      }
    }
  }

  private async saveSessionData(session: BuildSession): Promise<void> {
    const historyFile = join(this.dataDir, 'history.json')
    const sessionFile = join(this.dataDir, `${session.sessionId}.json`)

    // Save individual session
    writeFileSync(sessionFile, JSON.stringify(session, null, 2))

    // Update history
    const historical = await this.loadHistoricalData()
    historical.sessions.push(session)

    // Keep only last 50 sessions
    if (historical.sessions.length > 50) {
      historical.sessions = historical.sessions.slice(-50)
    }

    // Update trends and averages
    this.updateHistoricalTrends(historical)

    writeFileSync(historyFile, JSON.stringify(historical, null, 2))
  }

  private updateHistoricalTrends(historical: HistoricalBuildData): void {
    if (historical.sessions.length < 2) {
      return
    }

    const recent = historical.sessions.slice(-10)
    const older = historical.sessions.slice(-20, -10)

    if (older.length === 0) {
      return
    }

    const recentAvgTime =
      recent.reduce((sum, s) => sum + s.summary.averageBuildTime, 0) / recent.length
    const olderAvgTime =
      older.reduce((sum, s) => sum + s.summary.averageBuildTime, 0) / older.length

    const recentSuccessRate =
      recent.reduce(
        (sum, s) => sum + (s.summary.successfulBuilds / s.summary.totalPackages) * 100,
        0,
      ) / recent.length
    const olderSuccessRate =
      older.reduce(
        (sum, s) => sum + (s.summary.successfulBuilds / s.summary.totalPackages) * 100,
        0,
      ) / older.length

    historical.trends = [
      {
        metric: 'build-time',
        direction:
          recentAvgTime < olderAvgTime
            ? 'improving'
            : recentAvgTime > olderAvgTime
              ? 'degrading'
              : 'stable',
        change: ((recentAvgTime - olderAvgTime) / olderAvgTime) * 100,
        description: `Build time ${recentAvgTime < olderAvgTime ? 'improved' : recentAvgTime > olderAvgTime ? 'degraded' : 'remained stable'} by ${Math.abs(((recentAvgTime - olderAvgTime) / olderAvgTime) * 100).toFixed(1)}%`,
      },
      {
        metric: 'success-rate',
        direction:
          recentSuccessRate > olderSuccessRate
            ? 'improving'
            : recentSuccessRate < olderSuccessRate
              ? 'degrading'
              : 'stable',
        change: recentSuccessRate - olderSuccessRate,
        description: `Success rate ${recentSuccessRate > olderSuccessRate ? 'improved' : recentSuccessRate < olderSuccessRate ? 'degraded' : 'remained stable'} by ${Math.abs(recentSuccessRate - olderSuccessRate).toFixed(1)}%`,
      },
    ]

    historical.averageMetrics = {
      buildTime: recentAvgTime,
      successRate: recentSuccessRate,
      packageCount: recent.at(-1)?.summary.totalPackages || 0,
    }
  }

  async generateReport(
    format: 'console' | 'json' | 'markdown' = 'console',
    phase: BuildMetrics['phase'] = 'full',
  ): Promise<void> {
    const report = await this.monitor(phase)

    switch (format) {
      case 'console':
        this.printConsoleReport(report)
        break
      case 'json':
        console.log(JSON.stringify(report, null, 2))
        break
      case 'markdown':
        this.printMarkdownReport(report)
        break
    }
  }

  private printConsoleReport(report: BuildPerformanceReport): void {
    const {session, optimizations, recommendations} = report

    console.log('\n🎯 BUILD PERFORMANCE REPORT')
    console.log('='.repeat(50))

    console.log(`\n📊 Summary:`)
    console.log(`  Total packages: ${session.summary.totalPackages}`)
    console.log(`  Successful builds: ${session.summary.successfulBuilds}`)
    console.log(`  Failed builds: ${session.summary.failedBuilds}`)
    console.log(`  Average build time: ${(session.summary.averageBuildTime / 1000).toFixed(2)}s`)
    console.log(`  Total build time: ${(session.summary.totalBuildTime / 1000).toFixed(2)}s`)
    console.log(`  Performance score: ${session.summary.performanceScore}/100`)

    if (session.summary.fastestBuild.package !== 'none') {
      console.log(
        `  Fastest build: ${session.summary.fastestBuild.package} (${(session.summary.fastestBuild.time / 1000).toFixed(2)}s)`,
      )
      console.log(
        `  Slowest build: ${session.summary.slowestBuild.package} (${(session.summary.slowestBuild.time / 1000).toFixed(2)}s)`,
      )
    }

    if (session.parallelCapable.length > 0) {
      console.log(`\n⚡ Parallel Build Opportunities:`)
      console.log(`  ${session.parallelCapable.length} packages can be built in parallel:`)
      session.parallelCapable.forEach(pkg => console.log(`    - ${pkg}`))
    }

    if (session.bottlenecks.length > 0) {
      console.log(`\n🚨 Bottlenecks Identified:`)
      session.bottlenecks.forEach(bottleneck => {
        console.log(
          `  ${bottleneck.impact.toUpperCase()} - ${bottleneck.packageName}: ${bottleneck.description}`,
        )
        console.log(`    💡 ${bottleneck.suggestion}`)
      })
    }

    if (optimizations.length > 0) {
      console.log(`\n🎯 Optimization Suggestions:`)
      optimizations.forEach(opt => {
        console.log(`  ${opt.priority.toUpperCase()} - ${opt.description}`)
        console.log(`    📈 ${opt.estimatedImprovement}`)
        console.log(`    🔧 ${opt.implementation}`)
      })
    }

    if (recommendations.length > 0) {
      console.log(`\n💡 Recommendations:`)
      recommendations.forEach(rec => console.log(`  ${rec}`))
    }

    console.log(`\n${'='.repeat(50)}`)
  }

  private printMarkdownReport(report: BuildPerformanceReport): void {
    const {session, optimizations, recommendations} = report

    console.log('# Build Performance Report')
    console.log()
    console.log(`Generated: ${report.timestamp}`)
    console.log(`Session ID: ${session.sessionId}`)
    console.log()

    console.log('## Summary')
    console.log()
    console.log('| Metric | Value |')
    console.log('|--------|-------|')
    console.log(`| Total packages | ${session.summary.totalPackages} |`)
    console.log(`| Successful builds | ${session.summary.successfulBuilds} |`)
    console.log(`| Failed builds | ${session.summary.failedBuilds} |`)
    console.log(`| Average build time | ${(session.summary.averageBuildTime / 1000).toFixed(2)}s |`)
    console.log(`| Total build time | ${(session.summary.totalBuildTime / 1000).toFixed(2)}s |`)
    console.log(`| Performance score | ${session.summary.performanceScore}/100 |`)

    if (session.summary.fastestBuild.package !== 'none') {
      console.log(
        `| Fastest build | ${session.summary.fastestBuild.package} (${(session.summary.fastestBuild.time / 1000).toFixed(2)}s) |`,
      )
      console.log(
        `| Slowest build | ${session.summary.slowestBuild.package} (${(session.summary.slowestBuild.time / 1000).toFixed(2)}s) |`,
      )
    }

    console.log()

    if (session.parallelCapable.length > 0) {
      console.log('## Parallel Build Opportunities')
      console.log()
      console.log(`${session.parallelCapable.length} packages can be built in parallel:`)
      console.log()
      session.parallelCapable.forEach(pkg => console.log(`- ${pkg}`))
      console.log()
    }

    if (session.bottlenecks.length > 0) {
      console.log('## Bottlenecks')
      console.log()
      session.bottlenecks.forEach(bottleneck => {
        console.log(`### ${bottleneck.packageName} (${bottleneck.impact} impact)`)
        console.log()
        console.log(`**Issue:** ${bottleneck.description}`)
        console.log()
        console.log(`**Suggestion:** ${bottleneck.suggestion}`)
        console.log()
      })
    }

    if (optimizations.length > 0) {
      console.log('## Optimization Suggestions')
      console.log()
      optimizations.forEach(opt => {
        console.log(`### ${opt.description} (${opt.priority} priority)`)
        console.log()
        console.log(`**Expected improvement:** ${opt.estimatedImprovement}`)
        console.log()
        console.log(`**Implementation:** ${opt.implementation}`)
        console.log()
        if (opt.packages.length > 0) {
          console.log(`**Affected packages:** ${opt.packages.join(', ')}`)
          console.log()
        }
      })
    }

    if (recommendations.length > 0) {
      console.log('## Recommendations')
      console.log()
      recommendations.forEach(rec => console.log(`- ${rec}`))
      console.log()
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const workspaceRoot = process.cwd()

  const monitor = new BuildPerformanceMonitor(workspaceRoot)

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Build Performance Monitor

Usage:
  pnpm build:monitor [options]

Options:
  --phase <phase>     Monitor specific phase: type-check, lint, build, test, full (default: full)
  --format <format>   Output format: console, json, markdown (default: console)
  --help, -h         Show this help message

Examples:
  pnpm build:monitor                    # Monitor full build pipeline
  pnpm build:monitor --phase=build     # Monitor only build phase
  pnpm build:monitor --format=json     # Output as JSON
  pnpm build:monitor --format=markdown # Output as Markdown
`)
    return
  }

  const phaseArg = args.find(arg => arg.startsWith('--phase='))?.split('=')[1] as
    | BuildMetrics['phase']
    | undefined
  const formatArg = args.find(arg => arg.startsWith('--format='))?.split('=')[1] as
    | 'console'
    | 'json'
    | 'markdown'
    | undefined

  const phase = phaseArg || 'full'
  const format = formatArg || 'console'

  try {
    await monitor.generateReport(format, phase)
  } catch (error) {
    console.error('❌ Build performance monitoring failed:', error)
    process.exit(1)
  }
}

// Run the script if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Unhandled error:', error)
    process.exit(1)
  })
}

export {BuildPerformanceMonitor}
export type {BuildMetrics, BuildOptimizationSuggestion, BuildPerformanceReport, BuildSession}
