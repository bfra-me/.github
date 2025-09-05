import type {BreakingChangeAnalysis} from './breaking-change-detector'
import type {RenovateDependency, RenovateSecurityType} from './renovate-parser'
import type {SecurityAnalysis} from './security-vulnerability-detector'

/**
 * Semantic version information
 */
export interface SemverInfo {
  major: number
  minor: number
  patch: number
  prerelease?: string
  build?: string
  raw: string
  isValid: boolean
}

/**
 * Impact assessment result for a single dependency
 */
export interface DependencyImpact {
  name: string
  currentVersion?: string
  newVersion?: string
  versionChange: 'major' | 'minor' | 'patch' | 'prerelease' | 'none' | 'unknown'
  semverImpact: 'major' | 'minor' | 'patch'
  isBreaking: boolean
  isSecurityUpdate: boolean
  securitySeverity?: RenovateSecurityType
  isDowngrade: boolean
  isPrerelease: boolean
  confidence: 'high' | 'medium' | 'low'
  reasoning: string[]
  // TASK-019: Enhanced breaking change and security analysis
  breakingChangeAnalysis?: BreakingChangeAnalysis
  securityAnalysis?: SecurityAnalysis
}

/**
 * Enhanced overall impact assessment for multiple dependencies
 */
export interface ImpactAssessment {
  dependencies: DependencyImpact[]
  overallImpact: 'major' | 'minor' | 'patch'
  recommendedChangesetType: 'major' | 'minor' | 'patch'
  isSecurityUpdate: boolean
  hasBreakingChanges: boolean
  hasDowngrades: boolean
  hasPreleases: boolean
  confidence: 'high' | 'medium' | 'low'
  reasoning: string[]
  // TASK-019: Enhanced analysis summary
  totalVulnerabilities: number
  highSeverityVulnerabilities: number
  criticalBreakingChanges: number
  overallRiskScore: number // 0-100
}

/**
 * Options for impact assessment
 */
export interface ImpactAssessmentOptions {
  /**
   * Consider security updates as always requiring at least patch level
   */
  securityMinimumPatch: boolean
  /**
   * Consider major version updates as breaking by default
   */
  majorAsBreaking: boolean
  /**
   * Consider pre-release versions as having lower impact
   */
  prereleaseAsLowerImpact: boolean
  /**
   * Default changeset type for unknown or ambiguous cases
   */
  defaultChangesetType: 'major' | 'minor' | 'patch'
  /**
   * Custom rules for specific package managers
   */
  managerRules?: {
    [manager: string]: {
      majorAsBreaking?: boolean
      prereleaseHandling?: 'strict' | 'lenient'
      defaultImpact?: 'major' | 'minor' | 'patch'
    }
  }
}

/**
 * TASK-018: Sophisticated semver impact assessment algorithm
 *
 * This class implements a comprehensive algorithm for determining the semantic
 * versioning impact of dependency updates. It considers multiple factors:
 *
 * 1. Semantic version changes (major, minor, patch)
 * 2. Breaking changes and security updates
 * 3. Pre-release versions and downgrades
 * 4. Package manager specific rules
 * 5. Cumulative impact of multiple dependencies
 *
 * The algorithm follows the Semantic Versioning 2.0.0 specification:
 * - MAJOR: incompatible API changes
 * - MINOR: backward compatible functionality additions
 * - PATCH: backward compatible bug fixes
 */
export class SemverImpactAssessor {
  private options: ImpactAssessmentOptions

  constructor(options: Partial<ImpactAssessmentOptions> = {}) {
    this.options = {
      securityMinimumPatch: true,
      majorAsBreaking: true,
      prereleaseAsLowerImpact: true,
      defaultChangesetType: 'patch',
      ...options,
    }
  }

  /**
   * Assess the impact of multiple dependency updates
   */
  assessImpact(dependencies: RenovateDependency[]): ImpactAssessment {
    const dependencyImpacts = dependencies.map(dep => this.assessDependencyImpact(dep))

    return this.calculateOverallImpact(dependencyImpacts)
  }

  /**
   * Assess the impact of a single dependency update
   */
  assessDependencyImpact(dependency: RenovateDependency): DependencyImpact {
    const currentVersion = this.parseVersion(dependency.currentVersion)
    const newVersion = this.parseVersion(dependency.newVersion)

    // Determine version change type
    const versionChange = this.determineVersionChange(currentVersion, newVersion)

    // Calculate semver impact based on version change
    let semverImpact = this.calculateSemverImpact(currentVersion, newVersion, versionChange)

    // Check for breaking changes and security considerations
    const isBreaking = this.isBreakingChange(dependency, currentVersion, newVersion, versionChange)

    const isDowngrade = this.isDowngrade(currentVersion, newVersion)
    const isPrerelease = this.hasPrerelease(currentVersion, newVersion)

    // Apply security update logic
    if (dependency.isSecurityUpdate && this.options.securityMinimumPatch) {
      // Security updates should be at least patch level
      // Critical security issues might warrant minor version
      if (semverImpact === 'patch' && dependency.securitySeverity === 'critical') {
        semverImpact = 'minor'
      } else {
        // Ensure at least patch level for security updates
        semverImpact = semverImpact || 'patch'
      }
    }

    // Apply manager-specific rules
    const managerRule = this.options.managerRules?.[dependency.manager]
    if (managerRule) {
      semverImpact = this.applyManagerRules(semverImpact, dependency, managerRule)
    }

    // Determine confidence level
    const confidence = this.determineConfidence(
      currentVersion,
      newVersion,
      dependency,
      versionChange,
    )

    // Build reasoning
    const reasoning = this.buildReasoning(
      dependency,
      currentVersion,
      newVersion,
      versionChange,
      semverImpact,
      isBreaking,
      isDowngrade,
      isPrerelease,
    )

    return {
      name: dependency.name,
      currentVersion: dependency.currentVersion,
      newVersion: dependency.newVersion,
      versionChange,
      semverImpact,
      isBreaking,
      isSecurityUpdate: dependency.isSecurityUpdate,
      securitySeverity: dependency.securitySeverity,
      isDowngrade,
      isPrerelease,
      confidence,
      reasoning,
    }
  }

  /**
   * Parse a version string into semantic version components
   */
  private parseVersion(version?: string): SemverInfo {
    if (!version) {
      return {
        major: 0,
        minor: 0,
        patch: 0,
        raw: '',
        isValid: false,
      }
    }

    // Clean version string (remove common prefixes like 'v', '^', '~', '>=', etc.)
    const cleanVersion = version.replace(/^[v^~>=<]+/, '').trim()

    // Use semantic versioning regex - simplified for linting but still spec-compliant
    const semverRegex =
      /^(\d+)\.(\d+)\.(\d+)(?:-([a-z\d-]+(?:\.[a-z\d-]+)*))?(?:\+([a-z\d-]+(?:\.[a-z\d-]+)*))?$/i

    const match = cleanVersion.match(semverRegex)

    if (!match?.[1] || !match?.[2] || !match?.[3]) {
      // Try parsing partial versions like "1.2" or "1"
      const partialMatch = cleanVersion.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/)
      if (partialMatch?.[1]) {
        return {
          major: Number.parseInt(partialMatch[1], 10),
          minor: Number.parseInt(partialMatch[2] || '0', 10),
          patch: Number.parseInt(partialMatch[3] || '0', 10),
          raw: version,
          isValid: true,
        }
      }

      return {
        major: 0,
        minor: 0,
        patch: 0,
        raw: version,
        isValid: false,
      }
    }

    return {
      major: Number.parseInt(match[1], 10),
      minor: Number.parseInt(match[2], 10),
      patch: Number.parseInt(match[3], 10),
      prerelease: match[4],
      build: match[5],
      raw: version,
      isValid: true,
    }
  }

  /**
   * Determine the type of version change between two versions
   */
  private determineVersionChange(
    currentVersion: SemverInfo,
    newVersion: SemverInfo,
  ): 'major' | 'minor' | 'patch' | 'prerelease' | 'none' | 'unknown' {
    if (!currentVersion.isValid || !newVersion.isValid) {
      return 'unknown'
    }

    if (
      currentVersion.major === newVersion.major &&
      currentVersion.minor === newVersion.minor &&
      currentVersion.patch === newVersion.patch
    ) {
      // Same version, check for prerelease changes
      if (currentVersion.prerelease !== newVersion.prerelease) {
        return 'prerelease'
      }
      return 'none'
    }

    if (currentVersion.major !== newVersion.major) {
      return 'major'
    }

    if (currentVersion.minor !== newVersion.minor) {
      return 'minor'
    }

    if (currentVersion.patch !== newVersion.patch) {
      return 'patch'
    }

    return 'prerelease'
  }

  /**
   * Calculate the semver impact based on version changes
   */
  private calculateSemverImpact(
    currentVersion: SemverInfo,
    newVersion: SemverInfo,
    versionChange: string,
  ): 'major' | 'minor' | 'patch' {
    switch (versionChange) {
      case 'major':
        return 'major'
      case 'minor':
        return 'minor'
      case 'patch':
        return 'patch'
      case 'prerelease':
        // Pre-release changes are typically patch level unless they're major/minor prereleases
        if (!currentVersion.isValid || !newVersion.isValid) {
          return this.options.defaultChangesetType
        }
        // If moving from stable to prerelease or vice versa
        if (currentVersion.prerelease && !newVersion.prerelease) {
          // Graduating from prerelease to stable - use the version bump level
          return this.determineStableReleaseImpact(currentVersion, newVersion)
        }
        if (!currentVersion.prerelease && newVersion.prerelease) {
          // Moving to prerelease - typically patch level
          return this.options.prereleaseAsLowerImpact ? 'patch' : 'minor'
        }
        return 'patch'
      case 'none':
        return 'patch' // Even if no version change, there might still be updates worth a patch
      case 'unknown':
      default:
        return this.options.defaultChangesetType
    }
  }

  /**
   * Determine impact when graduating from prerelease to stable
   */
  private determineStableReleaseImpact(
    prereleaseVersion: SemverInfo,
    stableVersion: SemverInfo,
  ): 'major' | 'minor' | 'patch' {
    // Compare the base versions (ignoring prerelease)
    if (prereleaseVersion.major !== stableVersion.major) {
      return 'major'
    }
    if (prereleaseVersion.minor !== stableVersion.minor) {
      return 'minor'
    }
    return 'patch'
  }

  /**
   * Check if the update represents a breaking change
   */
  private isBreakingChange(
    dependency: RenovateDependency,
    currentVersion: SemverInfo,
    newVersion: SemverInfo,
    versionChange: string,
  ): boolean {
    // Major version updates are typically breaking changes
    if (versionChange === 'major' && this.options.majorAsBreaking) {
      // Exception: 0.x.x versions might not follow semver strictly
      if (currentVersion.major === 0 && newVersion.major === 0) {
        // In 0.x.x, minor changes can be breaking
        return currentVersion.minor !== newVersion.minor
      }
      return true
    }

    // 0.x.x versions: minor updates can be breaking
    if (currentVersion.major === 0 && versionChange === 'minor') {
      return true
    }

    // Renovate-specific breaking change indicators
    if (dependency.updateType === 'replacement') {
      return true
    }

    // Security updates with high severity might introduce breaking changes
    if (
      dependency.isSecurityUpdate &&
      dependency.securitySeverity === 'critical' &&
      versionChange === 'major'
    ) {
      return true
    }

    return false
  }

  /**
   * Check if the update represents a downgrade
   */
  private isDowngrade(currentVersion: SemverInfo, newVersion: SemverInfo): boolean {
    if (!currentVersion.isValid || !newVersion.isValid) {
      return false
    }

    return this.compareVersions(newVersion, currentVersion) < 0
  }

  /**
   * Check if any version involved is a prerelease
   */
  private hasPrerelease(currentVersion: SemverInfo, newVersion: SemverInfo): boolean {
    return !!(currentVersion.prerelease || newVersion.prerelease)
  }

  /**
   * Compare two semantic versions (-1, 0, 1)
   */
  private compareVersions(a: SemverInfo, b: SemverInfo): number {
    // Compare major.minor.patch
    if (a.major !== b.major) return a.major - b.major
    if (a.minor !== b.minor) return a.minor - b.minor
    if (a.patch !== b.patch) return a.patch - b.patch

    // Handle prerelease comparison
    if (a.prerelease && !b.prerelease) return -1 // prerelease < normal
    if (!a.prerelease && b.prerelease) return 1 // normal > prerelease
    if (a.prerelease && b.prerelease) {
      return a.prerelease.localeCompare(b.prerelease)
    }

    return 0 // equal
  }

  /**
   * Apply manager-specific rules to the semver impact
   */
  private applyManagerRules(
    impact: 'major' | 'minor' | 'patch',
    _dependency: RenovateDependency,
    rule: NonNullable<ImpactAssessmentOptions['managerRules']>[string],
  ): 'major' | 'minor' | 'patch' {
    // Apply default impact if specified
    if (rule.defaultImpact) {
      // Major changes should never be downgraded for safety reasons
      if (impact === 'major') {
        return 'major'
      }

      // Only downgrade the impact, never upgrade
      const impactLevels = ['patch', 'minor', 'major']
      const currentLevel = impactLevels.indexOf(impact)
      const defaultLevel = impactLevels.indexOf(rule.defaultImpact)

      if (defaultLevel < currentLevel) {
        return rule.defaultImpact
      }
    }

    return impact
  }

  /**
   * Determine confidence level for the impact assessment
   */
  private determineConfidence(
    currentVersion: SemverInfo,
    newVersion: SemverInfo,
    dependency: RenovateDependency,
    versionChange: string,
  ): 'high' | 'medium' | 'low' {
    let confidence: 'high' | 'medium' | 'low' = 'high'

    // Lower confidence for invalid versions
    if (!currentVersion.isValid || !newVersion.isValid) {
      confidence = 'low'
    }

    // Lower confidence for unknown version changes
    if (versionChange === 'unknown') {
      confidence = 'low'
    }

    // Lower confidence for 0.x.x versions (semver not strictly followed)
    if (currentVersion.major === 0 || newVersion.major === 0) {
      confidence = confidence === 'high' ? 'medium' : 'low'
    }

    // Lower confidence for prerelease versions
    if (currentVersion.prerelease || newVersion.prerelease) {
      confidence = confidence === 'high' ? 'medium' : 'low'
    }

    // Higher confidence for security updates (well-documented impact)
    if (dependency.isSecurityUpdate) {
      confidence = confidence === 'low' ? 'medium' : 'high'
    }

    return confidence
  }

  /**
   * Build reasoning for the impact assessment
   */
  private buildReasoning(
    dependency: RenovateDependency,
    currentVersion: SemverInfo,
    newVersion: SemverInfo,
    versionChange: string,
    semverImpact: 'major' | 'minor' | 'patch',
    isBreaking: boolean,
    isDowngrade: boolean,
    isPrerelease: boolean,
  ): string[] {
    const reasoning: string[] = []

    // Version change reasoning
    if (versionChange === 'major') {
      reasoning.push(`Major version update from ${currentVersion.raw} to ${newVersion.raw}`)
    } else if (versionChange === 'minor') {
      reasoning.push(`Minor version update from ${currentVersion.raw} to ${newVersion.raw}`)
    } else if (versionChange === 'patch') {
      reasoning.push(`Patch version update from ${currentVersion.raw} to ${newVersion.raw}`)
    } else if (versionChange === 'prerelease') {
      reasoning.push(`Prerelease version change from ${currentVersion.raw} to ${newVersion.raw}`)
    } else if (versionChange === 'unknown') {
      reasoning.push(
        `Unable to parse version change from ${currentVersion.raw} to ${newVersion.raw}`,
      )
    }

    // Security update reasoning
    if (dependency.isSecurityUpdate) {
      const severity = dependency.securitySeverity || 'unknown'
      reasoning.push(`Security update with ${severity} severity`)
    }

    // Breaking change reasoning
    if (isBreaking) {
      reasoning.push('Potentially breaking change detected')
      if (currentVersion.major === 0) {
        reasoning.push('0.x.x version - minor updates may introduce breaking changes')
      }
    }

    // Downgrade reasoning
    if (isDowngrade) {
      reasoning.push('Version downgrade detected - requires careful review')
    }

    // Prerelease reasoning
    if (isPrerelease) {
      reasoning.push('Involves prerelease versions - may be unstable')
    }

    // Semver impact reasoning
    reasoning.push(`Assessed as ${semverImpact} level change for changeset`)

    return reasoning
  }

  /**
   * Calculate overall impact from multiple dependency impacts
   */
  private calculateOverallImpact(dependencyImpacts: DependencyImpact[]): ImpactAssessment {
    if (dependencyImpacts.length === 0) {
      return {
        dependencies: [],
        overallImpact: this.options.defaultChangesetType,
        recommendedChangesetType: this.options.defaultChangesetType,
        isSecurityUpdate: false,
        hasBreakingChanges: false,
        hasDowngrades: false,
        hasPreleases: false,
        confidence: 'high',
        reasoning: ['No dependencies to assess'],
        // TASK-019: Enhanced analysis summary
        totalVulnerabilities: 0,
        highSeverityVulnerabilities: 0,
        criticalBreakingChanges: 0,
        overallRiskScore: 0,
      }
    }

    // Find the highest impact level
    const impactLevels = ['patch', 'minor', 'major'] as const
    let maxImpactLevel = 0

    for (const dep of dependencyImpacts) {
      const level = impactLevels.indexOf(dep.semverImpact)
      if (level > maxImpactLevel) {
        maxImpactLevel = level
      }
    }

    const overallImpact = impactLevels[maxImpactLevel] || this.options.defaultChangesetType

    // Check for various conditions
    const isSecurityUpdate = dependencyImpacts.some(dep => dep.isSecurityUpdate)
    const hasBreakingChanges = dependencyImpacts.some(dep => dep.isBreaking)
    const hasDowngrades = dependencyImpacts.some(dep => dep.isDowngrade)
    const hasPreleases = dependencyImpacts.some(dep => dep.isPrerelease)

    // Calculate overall confidence
    const confidenceLevels = ['high', 'medium', 'low'] as const
    let minConfidenceLevel = 0
    for (const dep of dependencyImpacts) {
      const level = confidenceLevels.indexOf(dep.confidence)
      if (level > minConfidenceLevel) {
        minConfidenceLevel = level
      }
    }
    const confidence = confidenceLevels[minConfidenceLevel] || 'medium'

    // Build overall reasoning
    const reasoning: string[] = []
    reasoning.push(`Assessed ${dependencyImpacts.length} dependencies`)

    if (isSecurityUpdate) {
      const securityCount = dependencyImpacts.filter(dep => dep.isSecurityUpdate).length
      reasoning.push(`${securityCount} security update(s) detected`)
    }

    if (hasBreakingChanges) {
      const breakingCount = dependencyImpacts.filter(dep => dep.isBreaking).length
      reasoning.push(`${breakingCount} potentially breaking change(s)`)
    }

    reasoning.push(`Overall impact: ${overallImpact}`)

    // TASK-019: Calculate enhanced analysis metrics
    const totalVulnerabilities = dependencyImpacts.reduce(
      (sum, dep) => sum + (dep.securityAnalysis?.vulnerabilities.length || 0),
      0,
    )

    const highSeverityVulnerabilities = dependencyImpacts.reduce(
      (sum, dep) =>
        sum +
        (dep.securityAnalysis?.vulnerabilities.filter(
          v => v.severity === 'high' || v.severity === 'critical',
        ).length || 0),
      0,
    )

    const criticalBreakingChanges = dependencyImpacts.reduce(
      (sum, dep) =>
        sum +
        (dep.breakingChangeAnalysis?.indicators.filter(i => i.severity === 'critical').length || 0),
      0,
    )

    const overallRiskScore = Math.min(
      100,
      dependencyImpacts.reduce(
        (sum, dep) =>
          sum +
          (dep.securityAnalysis?.riskScore || 0) +
          (dep.breakingChangeAnalysis?.indicators.length || 0) * 10,
        0,
      ) / dependencyImpacts.length,
    )

    return {
      dependencies: dependencyImpacts,
      overallImpact,
      recommendedChangesetType: overallImpact,
      isSecurityUpdate,
      hasBreakingChanges,
      hasDowngrades,
      hasPreleases,
      confidence,
      reasoning,
      // TASK-019: Enhanced analysis summary
      totalVulnerabilities,
      highSeverityVulnerabilities,
      criticalBreakingChanges,
      overallRiskScore,
    }
  }
}
