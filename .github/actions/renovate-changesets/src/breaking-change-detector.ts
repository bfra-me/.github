import type {Octokit} from '@octokit/rest'
import type {RenovateDependency, RenovateManagerType} from './renovate-parser'

/**
 * Breaking change indicators and patterns
 */
export interface BreakingChangeIndicator {
  type:
    | 'major_version'
    | 'api_deprecation'
    | 'config_change'
    | 'runtime_change'
    | 'ecosystem_specific'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  evidence: string[]
  confidence: 'low' | 'medium' | 'high'
}

/**
 * Enhanced breaking change analysis result
 */
export interface BreakingChangeAnalysis {
  hasBreakingChanges: boolean
  indicators: BreakingChangeIndicator[]
  overallSeverity: 'low' | 'medium' | 'high' | 'critical'
  confidence: 'low' | 'medium' | 'high'
  reasoning: string[]
  recommendedAction: 'proceed' | 'review_required' | 'manual_testing' | 'block'
}

/**
 * Framework-specific breaking change patterns
 */
interface FrameworkPatterns {
  [framework: string]: {
    breakingKeywords: string[]
    deprecationKeywords: string[]
    configChanges: string[]
    apiChanges: string[]
  }
}

/**
 * TASK-019: Enhanced Breaking Change Detector
 *
 * This class implements sophisticated breaking change detection that goes beyond
 * simple semantic versioning analysis. It analyzes:
 *
 * 1. Release notes and changelogs for breaking change indicators
 * 2. Framework and ecosystem-specific patterns
 * 3. API deprecation warnings and removal notices
 * 4. Configuration file changes
 * 5. Runtime behavior modifications
 */
export class BreakingChangeDetector {
  private frameworkPatterns: FrameworkPatterns

  constructor() {
    this.frameworkPatterns = {
      // React ecosystem
      react: {
        breakingKeywords: [
          'breaking change',
          'breaking changes',
          'removed in react',
          'deprecated react',
          'no longer supported',
          'legacy mode removed',
        ],
        deprecationKeywords: [
          'componentwillmount',
          'componentwillreceiveprops',
          'componentwillupdate',
          'finddomnode',
          'string refs',
        ],
        configChanges: ['react.config', 'webpack.config', 'babel.config'],
        apiChanges: ['createelement', 'render', 'hydrate', 'unmount'],
      },

      // Vue ecosystem
      vue: {
        breakingKeywords: [
          'breaking change',
          'vue 3 migration',
          'composition api',
          'vue 2 removed',
          'options api deprecated',
        ],
        deprecationKeywords: [
          '$listeners',
          '$scopedslots',
          'functional components',
          'filters',
          'inline-template',
        ],
        configChanges: ['vue.config', 'vite.config'],
        apiChanges: ['createapp', 'mount', 'global properties'],
      },

      // Angular ecosystem
      angular: {
        breakingKeywords: [
          'breaking change',
          'angular update',
          'ivy renderer',
          'viewengine removed',
          'deprecated api',
        ],
        deprecationKeywords: ['viewchild', 'contentchild', 'elementref', 'renderer', 'http module'],
        configChanges: ['angular.json', 'tsconfig.json', 'karma.conf'],
        apiChanges: ['component', 'directive', 'service', 'module'],
      },

      // Node.js ecosystem
      node: {
        breakingKeywords: [
          'breaking change',
          'node.js removed',
          'deprecated in node',
          'runtime breaking',
          'esm only',
        ],
        deprecationKeywords: [
          'util.isarray',
          'buffer constructor',
          'domain module',
          'punycode',
          'url.parse',
        ],
        configChanges: ['package.json', '.nvmrc', 'tsconfig.json'],
        apiChanges: ['require', 'import', 'exports', 'module'],
      },

      // TypeScript ecosystem
      typescript: {
        breakingKeywords: [
          'breaking change',
          'typescript removed',
          'strict mode',
          'type checking',
          'compilation error',
        ],
        deprecationKeywords: [
          'namespace',
          'module declaration',
          'ambient modules',
          'export =',
          'import require',
        ],
        configChanges: ['tsconfig.json', 'tslint.json', '.eslintrc'],
        apiChanges: ['interface', 'type', 'enum', 'class'],
      },

      // Express/Fastify
      express: {
        breakingKeywords: [
          'breaking change',
          'middleware removed',
          'deprecated middleware',
          'router changes',
          'request/response api',
        ],
        deprecationKeywords: [
          'bodyparser',
          'express.static',
          'req.param',
          'res.send',
          'app.configure',
        ],
        configChanges: ['server.js', 'app.js', 'middleware'],
        apiChanges: ['router', 'middleware', 'request', 'response'],
      },

      // Docker
      docker: {
        breakingKeywords: [
          'breaking change',
          'image removed',
          'deprecated tag',
          'base image change',
          'entrypoint change',
        ],
        deprecationKeywords: [
          'legacy dockerfile',
          'old base image',
          'deprecated instruction',
          'unsupported flag',
        ],
        configChanges: ['dockerfile', 'docker-compose.yml', '.dockerignore'],
        apiChanges: ['from', 'run', 'cmd', 'entrypoint'],
      },

      // GitHub Actions
      'github-actions': {
        breakingKeywords: [
          'breaking change',
          'action removed',
          'deprecated action',
          'workflow syntax',
          'runner requirement',
        ],
        deprecationKeywords: ['set-output', 'save-state', 'add-path', 'node 12', 'ubuntu-18.04'],
        configChanges: ['action.yml', 'action.yaml', 'workflow'],
        apiChanges: ['inputs', 'outputs', 'runs', 'steps'],
      },
    }
  }

  /**
   * Analyze dependency update for breaking changes
   */
  async analyzeBreakingChanges(
    dependency: RenovateDependency,
    octokit?: Octokit,
    owner?: string,
    repo?: string,
    prNumber?: number,
  ): Promise<BreakingChangeAnalysis> {
    const indicators: BreakingChangeIndicator[] = []

    // 1. Analyze version bump for breaking changes
    const versionIndicators = this.analyzeVersionBreaking(dependency)
    indicators.push(...versionIndicators)

    // 2. Analyze ecosystem-specific patterns
    const ecosystemIndicators = this.analyzeEcosystemBreaking(dependency)
    indicators.push(...ecosystemIndicators)

    // 3. If GitHub context is available, analyze PR content for additional indicators
    if (octokit && owner && repo && prNumber) {
      try {
        const prIndicators = await this.analyzePRContentBreaking(
          dependency,
          octokit,
          owner,
          repo,
          prNumber,
        )
        indicators.push(...prIndicators)
      } catch (error) {
        // Continue without PR analysis if it fails
        console.warn('Failed to analyze PR content for breaking changes:', error)
      }
    }

    // 4. Analyze release notes patterns (if available)
    const releaseIndicators = this.analyzeReleaseNotesBreaking(dependency)
    indicators.push(...releaseIndicators)

    return this.synthesizeBreakingAnalysis(indicators, dependency)
  }

  /**
   * Analyze version changes for breaking indicators
   */
  private analyzeVersionBreaking(dependency: RenovateDependency): BreakingChangeIndicator[] {
    const indicators: BreakingChangeIndicator[] = []

    // Parse semantic versions
    const currentVersion = this.parseSemanticVersion(dependency.currentVersion)
    const newVersion = this.parseSemanticVersion(dependency.newVersion)

    if (!currentVersion || !newVersion) {
      return indicators
    }

    // Major version bump
    if (newVersion.major > currentVersion.major) {
      indicators.push({
        type: 'major_version',
        severity: 'high',
        description: `Major version update from ${dependency.currentVersion} to ${dependency.newVersion}`,
        evidence: [`Version change: ${dependency.currentVersion} → ${dependency.newVersion}`],
        confidence: 'high',
      })
    }

    // 0.x.x versions - minor bumps can be breaking
    if (currentVersion.major === 0 && newVersion.minor > currentVersion.minor) {
      indicators.push({
        type: 'major_version',
        severity: 'medium',
        description: 'Minor version bump in 0.x.x version (potentially breaking)',
        evidence: [
          `0.x.x version update: ${dependency.currentVersion} → ${dependency.newVersion}`,
          '0.x.x versions may include breaking changes in minor updates',
        ],
        confidence: 'medium',
      })
    }

    // Pre-release to stable major changes
    if (
      currentVersion.prerelease &&
      !newVersion.prerelease &&
      newVersion.major > currentVersion.major
    ) {
      indicators.push({
        type: 'major_version',
        severity: 'high',
        description: 'Graduation from pre-release to stable major version',
        evidence: [
          `Pre-release to stable: ${dependency.currentVersion} → ${dependency.newVersion}`,
          'Major version graduation often includes breaking changes',
        ],
        confidence: 'high',
      })
    }

    return indicators
  }

  /**
   * Analyze ecosystem-specific breaking change patterns
   */
  private analyzeEcosystemBreaking(dependency: RenovateDependency): BreakingChangeIndicator[] {
    const indicators: BreakingChangeIndicator[] = []

    // Detect framework/ecosystem from dependency name and manager
    const ecosystem = this.detectEcosystem(dependency.name, dependency.manager)
    const patterns = this.frameworkPatterns[ecosystem]

    if (!patterns) {
      return indicators
    }

    // Check for ecosystem-specific breaking patterns in dependency name
    const dependencyNameLower = dependency.name.toLowerCase()

    // Framework core packages that are more likely to have breaking changes
    const corePackages = [
      'react',
      'vue',
      'angular',
      'express',
      'typescript',
      'webpack',
      'babel',
      'eslint',
      'prettier',
    ]

    if (corePackages.some(pkg => dependencyNameLower.includes(pkg))) {
      indicators.push({
        type: 'ecosystem_specific',
        severity: 'medium',
        description: `Core ${ecosystem} package update may include breaking changes`,
        evidence: [
          `Core package: ${dependency.name}`,
          `Ecosystem: ${ecosystem}`,
          'Core packages more likely to introduce breaking changes',
        ],
        confidence: 'medium',
      })
    }

    // TypeScript strict mode packages
    if (
      ecosystem === 'typescript' &&
      (dependencyNameLower.includes('types') || dependencyNameLower.includes('typescript'))
    ) {
      indicators.push({
        type: 'ecosystem_specific',
        severity: 'medium',
        description: 'TypeScript or type definitions update may require code changes',
        evidence: [
          `TypeScript related package: ${dependency.name}`,
          'Type definition changes can require code modifications',
        ],
        confidence: 'medium',
      })
    }

    return indicators
  }

  /**
   * Analyze PR content for breaking change indicators
   */
  private async analyzePRContentBreaking(
    dependency: RenovateDependency,
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<BreakingChangeIndicator[]> {
    const indicators: BreakingChangeIndicator[] = []

    try {
      // Get PR details
      const {data: pr} = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      })

      // Analyze PR title and body for breaking change keywords
      const prContent = `${pr.title} ${pr.body || ''}`.toLowerCase()

      const breakingKeywords = [
        'breaking change',
        'breaking changes',
        'breaking:',
        'major change',
        'api change',
        'deprecated',
        'removed',
        'incompatible',
        'migration required',
        'upgrade guide',
      ]

      const foundKeywords = breakingKeywords.filter(keyword => prContent.includes(keyword))

      if (foundKeywords.length > 0) {
        indicators.push({
          type: 'api_deprecation',
          severity: foundKeywords.some(k => k.includes('breaking') || k.includes('removed'))
            ? 'high'
            : 'medium',
          description: 'PR description mentions breaking changes or deprecations',
          evidence: foundKeywords.map(keyword => `Found keyword: "${keyword}"`),
          confidence: 'high',
        })
      }

      // Check for configuration file changes
      const {data: files} = await octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: prNumber,
      })

      const configFiles = files.filter(file =>
        [
          'package.json',
          'tsconfig.json',
          '.eslintrc',
          'webpack.config',
          'babel.config',
          'next.config',
          'vue.config',
          'angular.json',
        ].some(configFile => file.filename.includes(configFile)),
      )

      if (configFiles.length > 0) {
        indicators.push({
          type: 'config_change',
          severity: 'medium',
          description: 'Configuration files modified alongside dependency update',
          evidence: configFiles.map(file => `Modified config: ${file.filename}`),
          confidence: 'medium',
        })
      }
    } catch (error) {
      // Silently handle GitHub API errors
      console.warn('Failed to analyze PR content:', error)
    }

    return indicators
  }

  /**
   * Analyze release notes for breaking change patterns
   */
  private analyzeReleaseNotesBreaking(dependency: RenovateDependency): BreakingChangeIndicator[] {
    const indicators: BreakingChangeIndicator[] = []

    // This would ideally fetch release notes from GitHub releases or npm
    // For now, we'll do pattern-based analysis on available data

    const ecosystem = this.detectEcosystem(dependency.name, dependency.manager)
    const patterns = this.frameworkPatterns[ecosystem]

    if (patterns) {
      // Check if this is a known problematic version pattern
      const newVersion = dependency.newVersion?.toLowerCase() || ''

      // Major versions often have breaking changes
      if (newVersion.includes('.0.0') && !newVersion.startsWith('0.')) {
        indicators.push({
          type: 'major_version',
          severity: 'high',
          description: 'Major version release (.0.0) likely includes breaking changes',
          evidence: [
            `Version pattern: ${dependency.newVersion}`,
            'x.0.0 releases often break APIs',
          ],
          confidence: 'medium',
        })
      }

      // Alpha/beta/rc versions may have breaking changes
      if (
        newVersion.includes('alpha') ||
        newVersion.includes('beta') ||
        newVersion.includes('rc') ||
        newVersion.includes('pre')
      ) {
        indicators.push({
          type: 'major_version',
          severity: 'medium',
          description: 'Pre-release version may include unstable or breaking changes',
          evidence: [
            `Pre-release version: ${dependency.newVersion}`,
            'Pre-release versions may include breaking changes',
          ],
          confidence: 'medium',
        })
      }
    }

    return indicators
  }

  /**
   * Synthesize all indicators into final analysis
   */
  private synthesizeBreakingAnalysis(
    indicators: BreakingChangeIndicator[],
    dependency: RenovateDependency,
  ): BreakingChangeAnalysis {
    const hasBreakingChanges = indicators.length > 0

    // Calculate overall severity
    const severityLevels = ['low', 'medium', 'high', 'critical']
    let maxSeverityLevel = 0

    for (const indicator of indicators) {
      const level = severityLevels.indexOf(indicator.severity)
      if (level > maxSeverityLevel) {
        maxSeverityLevel = level
      }
    }

    const overallSeverity = (severityLevels[maxSeverityLevel] || 'low') as
      | 'low'
      | 'medium'
      | 'high'
      | 'critical'

    // Calculate overall confidence
    const confidenceLevels = ['low', 'medium', 'high']
    const avgConfidenceLevel = indicators.length
      ? Math.round(
          indicators
            .map(i => confidenceLevels.indexOf(i.confidence))
            .reduce((sum, level) => sum + level, 0) / indicators.length,
        )
      : 2 // Default to high confidence if no indicators

    const confidence = (confidenceLevels[avgConfidenceLevel] || 'medium') as
      | 'low'
      | 'medium'
      | 'high'

    // Generate reasoning
    const reasoning: string[] = []

    if (hasBreakingChanges) {
      reasoning.push(`Found ${indicators.length} breaking change indicator(s)`)

      // Group indicators by type
      const byType = indicators.reduce(
        (acc, indicator) => {
          if (!acc[indicator.type]) acc[indicator.type] = 0
          acc[indicator.type]++
          return acc
        },
        {} as Record<string, number>,
      )

      for (const [type, count] of Object.entries(byType)) {
        reasoning.push(`${count} ${type.replace('_', ' ')} indicator(s)`)
      }
    } else {
      reasoning.push('No breaking change indicators detected')
      reasoning.push(`Version update: ${dependency.currentVersion} → ${dependency.newVersion}`)
    }

    // Determine recommended action
    let recommendedAction: 'proceed' | 'review_required' | 'manual_testing' | 'block'

    if (hasBreakingChanges) {
      if (overallSeverity === 'low') {
        recommendedAction = 'review_required'
      } else if (overallSeverity === 'medium') {
        recommendedAction = 'manual_testing'
      } else {
        recommendedAction = confidence === 'high' ? 'block' : 'manual_testing'
      }
    } else {
      recommendedAction = 'proceed'
    }

    return {
      hasBreakingChanges,
      indicators,
      overallSeverity,
      confidence,
      reasoning,
      recommendedAction,
    }
  }

  /**
   * Parse semantic version string
   */
  private parseSemanticVersion(version?: string): {
    major: number
    minor: number
    patch: number
    prerelease?: string
  } | null {
    if (!version) return null

    const cleanVersion = version.replace(/^[v^~>=<]+/, '').trim()
    const match = cleanVersion.match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-z\d-]+(?:\.[a-z\d-]+)*))?/i)

    if (!match?.[1] || !match?.[2] || !match?.[3]) return null

    return {
      major: Number.parseInt(match[1], 10),
      minor: Number.parseInt(match[2], 10),
      patch: Number.parseInt(match[3], 10),
      prerelease: match[4],
    }
  }

  /**
   * Detect ecosystem from dependency name and manager
   */
  private detectEcosystem(dependencyName: string, manager: RenovateManagerType): string {
    const name = dependencyName.toLowerCase()

    // Framework detection
    if (name.includes('react') || name.includes('@react')) return 'react'
    if (name.includes('vue') || name.includes('@vue')) return 'vue'
    if (name.includes('angular') || name.includes('@angular')) return 'angular'
    if (name.includes('express') || name.includes('fastify')) return 'express'
    if (name.includes('typescript') || name.includes('@types')) return 'typescript'

    // Manager-based detection
    if (manager === 'docker' || manager === 'dockerfile') return 'docker'
    if (manager === 'github-actions') return 'github-actions'
    if (manager === 'npm' || manager === 'pnpm' || manager === 'yarn') return 'node'

    return 'generic'
  }
}
