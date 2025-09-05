/**
 * Context-aware changeset summary generator for the Enhanced Renovate-Changesets Action
 *
 * This module implements sophisticated changeset summary generation that adapts to:
 * - Update type (npm, github-actions, docker, etc.)
 * - Security updates vs regular updates
 * - Grouped updates vs single updates
 * - Breaking changes vs non-breaking
 * - Manager-specific patterns
 * - Impact assessment and categorization results
 *
 * @since 2025-09-05 (TASK-022)
 */

import type {CategorizationResult} from './change-categorization-engine'
import type {RenovatePRContext} from './renovate-parser'
import type {ImpactAssessment} from './semver-impact-assessor'

/**
 * Configuration for context-aware summary generation
 */
export interface SummaryGeneratorConfig {
  /** Include emoji prefixes for different types of updates */
  useEmojis: boolean
  /** Include version details in summaries */
  includeVersionDetails: boolean
  /** Include risk assessment information */
  includeRiskAssessment: boolean
  /** Include breaking change warnings */
  includeBreakingChangeWarnings: boolean
  /** Sort dependencies alphabetically */
  sortDependencies: boolean
  /** Maximum number of dependencies to list individually before summarizing */
  maxDependenciesToList: number
  /** Custom templates for specific scenarios */
  customTemplates?: {
    [key: string]: string
  }
}

/**
 * Default configuration for summary generation
 */
export const DEFAULT_SUMMARY_CONFIG: SummaryGeneratorConfig = {
  useEmojis: true,
  includeVersionDetails: true,
  includeRiskAssessment: false,
  includeBreakingChangeWarnings: true,
  sortDependencies: true,
  maxDependenciesToList: 5,
}

/**
 * Template variables that can be used in custom templates
 */
export interface TemplateContext {
  updateType: string
  manager: string
  dependencies: string[]
  dependencyCount: number
  isSecurityUpdate: boolean
  isGroupedUpdate: boolean
  hasBreakingChanges: boolean
  primaryVersion?: string
  versionRange?: string
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  primaryCategory: string
  emoji: string
}

/**
 * Context-aware changeset summary generator
 */
export class ChangesetSummaryGenerator {
  private config: SummaryGeneratorConfig

  constructor(config: Partial<SummaryGeneratorConfig> = {}) {
    this.config = {...DEFAULT_SUMMARY_CONFIG, ...config}
  }

  /**
   * Generate a context-aware changeset summary
   */
  generateSummary(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    categorizationResult: CategorizationResult,
    updateType: string,
    dependencies: string[],
    template?: string,
  ): string {
    // If a custom template is provided, use template-based generation
    if (template) {
      return this.generateFromTemplate(
        template,
        prContext,
        impactAssessment,
        categorizationResult,
        updateType,
        dependencies,
      )
    }

    // Use context-aware generation based on manager type and update characteristics
    return this.generateContextAwareSummary(
      prContext,
      impactAssessment,
      categorizationResult,
      updateType,
      dependencies,
    )
  }

  /**
   * Generate summary from a custom template
   */
  private generateFromTemplate(
    template: string,
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    categorizationResult: CategorizationResult,
    updateType: string,
    dependencies: string[],
  ): string {
    const context = this.buildTemplateContext(
      prContext,
      impactAssessment,
      categorizationResult,
      updateType,
      dependencies,
    )

    return this.interpolateTemplate(template, context)
  }

  /**
   * Generate context-aware summary based on manager type and characteristics
   */
  private generateContextAwareSummary(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    categorizationResult: CategorizationResult,
    updateType: string,
    dependencies: string[],
  ): string {
    // Determine the appropriate generator based on manager type
    switch (prContext.manager) {
      case 'npm':
      case 'pnpm':
      case 'yarn':
        return this.generateNpmSummary(
          prContext,
          impactAssessment,
          categorizationResult,
          dependencies,
        )

      case 'github-actions':
        return this.generateGitHubActionsSummary(
          prContext,
          impactAssessment,
          categorizationResult,
          dependencies,
        )

      case 'docker':
      case 'dockerfile':
      case 'docker-compose':
        return this.generateDockerSummary(
          prContext,
          impactAssessment,
          categorizationResult,
          dependencies,
        )

      case 'pip':
      case 'pipenv':
        return this.generatePythonSummary(
          prContext,
          impactAssessment,
          categorizationResult,
          dependencies,
        )

      case 'gradle':
      case 'maven':
        return this.generateJvmSummary(
          prContext,
          impactAssessment,
          categorizationResult,
          dependencies,
        )

      case 'go':
        return this.generateGoSummary(
          prContext,
          impactAssessment,
          categorizationResult,
          dependencies,
        )

      case 'lockfile':
        return this.generateLockfileSummary(
          prContext,
          impactAssessment,
          categorizationResult,
          dependencies,
        )

      default:
        return this.generateGenericSummary(
          prContext,
          impactAssessment,
          categorizationResult,
          updateType,
          dependencies,
        )
    }
  }

  /**
   * Generate NPM-specific changeset summary
   */
  private generateNpmSummary(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    categorizationResult: CategorizationResult,
    dependencies: string[],
  ): string {
    const emoji = this.getEmojiForUpdate(prContext, impactAssessment)
    const sortedDeps = this.config.sortDependencies ? [...dependencies].sort() : dependencies

    if (prContext.isSecurityUpdate) {
      return this.generateSecurityUpdateSummary(
        'npm',
        sortedDeps,
        prContext,
        impactAssessment,
        emoji,
      )
    }

    if (prContext.isGroupedUpdate) {
      return this.generateGroupedUpdateSummary(
        'npm',
        sortedDeps,
        prContext,
        impactAssessment,
        emoji,
      )
    }

    if (sortedDeps.length === 0) {
      return `${emoji}Update npm dependencies`
    }

    if (sortedDeps.length === 1) {
      const dependency = sortedDeps[0]
      if (dependency) {
        return this.generateSingleDependencySummary(
          'npm',
          dependency,
          prContext,
          impactAssessment,
          emoji,
        )
      }
    }

    if (sortedDeps.length <= this.config.maxDependenciesToList) {
      const depList = sortedDeps.map(dep => `\`${dep}\``).join(', ')
      const summary = `${emoji}Update npm dependencies: ${depList}`

      if (impactAssessment.hasBreakingChanges && this.config.includeBreakingChangeWarnings) {
        return `${summary}\n\n⚠️ **Breaking Changes**: This update includes breaking changes that may require code modifications.`
      }

      return summary
    }

    // Many dependencies - summarize
    const summary = `${emoji}Update ${sortedDeps.length} npm dependencies`
    return this.addBreakingChangeWarning(summary, impactAssessment)
  }

  /**
   * Generate GitHub Actions-specific changeset summary
   */
  private generateGitHubActionsSummary(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    categorizationResult: CategorizationResult,
    dependencies: string[],
  ): string {
    const emoji = this.getEmojiForUpdate(prContext, impactAssessment)
    const sortedDeps = this.config.sortDependencies ? [...dependencies].sort() : dependencies

    if (prContext.isSecurityUpdate) {
      return this.generateSecurityUpdateSummary(
        'GitHub Actions',
        sortedDeps,
        prContext,
        impactAssessment,
        emoji,
      )
    }

    if (sortedDeps.length === 1) {
      const dep = sortedDeps[0]
      const versionInfo = prContext.dependencies.find(d => d.name === dep)
      let versionText = ''

      if (
        this.config.includeVersionDetails &&
        versionInfo?.currentVersion &&
        versionInfo?.newVersion
      ) {
        versionText = ` from \`${versionInfo.currentVersion}\` to \`${versionInfo.newVersion}\``
      }

      return `${emoji}Update GitHub Actions workflow dependency \`${dep}\`${versionText}`
    }

    if (sortedDeps.length <= this.config.maxDependenciesToList) {
      const depList = sortedDeps.map(dep => `\`${dep}\``).join(', ')
      return `${emoji}Update GitHub Actions workflow dependencies: ${depList}`
    }

    return `${emoji}Update ${sortedDeps.length} GitHub Actions workflow dependencies`
  }

  /**
   * Generate Docker-specific changeset summary
   */
  private generateDockerSummary(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    categorizationResult: CategorizationResult,
    dependencies: string[],
  ): string {
    const emoji = this.getEmojiForUpdate(prContext, impactAssessment)
    const sortedDeps = this.config.sortDependencies ? [...dependencies].sort() : dependencies

    if (prContext.isSecurityUpdate) {
      return this.generateSecurityUpdateSummary(
        'Docker',
        sortedDeps,
        prContext,
        impactAssessment,
        emoji,
      )
    }

    if (sortedDeps.length === 1) {
      const dep = sortedDeps[0]
      const versionInfo = prContext.dependencies.find(d => d.name === dep)
      let versionText = ''

      if (
        this.config.includeVersionDetails &&
        versionInfo?.currentVersion &&
        versionInfo?.newVersion
      ) {
        versionText = ` from \`${versionInfo.currentVersion}\` to \`${versionInfo.newVersion}\``
      }

      return `${emoji}Update Docker image \`${dep}\`${versionText}`
    }

    if (sortedDeps.length <= this.config.maxDependenciesToList) {
      const depList = sortedDeps.map(dep => `\`${dep}\``).join(', ')
      return `${emoji}Update Docker images: ${depList}`
    }

    return `${emoji}Update ${sortedDeps.length} Docker images`
  }

  /**
   * Generate Python-specific changeset summary
   */
  private generatePythonSummary(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    categorizationResult: CategorizationResult,
    dependencies: string[],
  ): string {
    const emoji = this.getEmojiForUpdate(prContext, impactAssessment)
    const sortedDeps = this.config.sortDependencies ? [...dependencies].sort() : dependencies
    const managerName = this.getPythonManagerDisplayName(prContext.manager)

    if (prContext.isSecurityUpdate) {
      return this.generateSecurityUpdateSummary(
        managerName,
        sortedDeps,
        prContext,
        impactAssessment,
        emoji,
      )
    }

    if (sortedDeps.length === 1) {
      return this.generateSingleDependencySummary(
        managerName,
        sortedDeps[0],
        prContext,
        impactAssessment,
        emoji,
      )
    }

    if (sortedDeps.length <= this.config.maxDependenciesToList) {
      const depList = sortedDeps.map(dep => `\`${dep}\``).join(', ')
      const summary = `${emoji}Update ${managerName} dependencies: ${depList}`

      return this.addBreakingChangeWarning(summary, impactAssessment)
    }

    const summary = `${emoji}Update ${sortedDeps.length} ${managerName} dependencies`
    return this.addBreakingChangeWarning(summary, impactAssessment)
  }

  /**
   * Generate JVM-specific changeset summary
   */
  private generateJvmSummary(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    categorizationResult: CategorizationResult,
    dependencies: string[],
  ): string {
    const emoji = this.getEmojiForUpdate(prContext, impactAssessment)
    const sortedDeps = this.config.sortDependencies ? [...dependencies].sort() : dependencies
    const managerName = this.getJvmManagerDisplayName(prContext.manager)

    if (prContext.isSecurityUpdate) {
      return this.generateSecurityUpdateSummary(
        managerName,
        sortedDeps,
        prContext,
        impactAssessment,
        emoji,
      )
    }

    if (sortedDeps.length === 1) {
      return this.generateSingleDependencySummary(
        managerName,
        sortedDeps[0],
        prContext,
        impactAssessment,
        emoji,
      )
    }

    if (sortedDeps.length <= this.config.maxDependenciesToList) {
      const depList = sortedDeps.map(dep => `\`${dep}\``).join(', ')
      const summary = `${emoji}Update ${managerName} dependencies: ${depList}`

      return this.addBreakingChangeWarning(summary, impactAssessment)
    }

    const summary = `${emoji}Update ${sortedDeps.length} ${managerName} dependencies`
    return this.addBreakingChangeWarning(summary, impactAssessment)
  }

  /**
   * Generate Go-specific changeset summary
   */
  private generateGoSummary(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    categorizationResult: CategorizationResult,
    dependencies: string[],
  ): string {
    const emoji = this.getEmojiForUpdate(prContext, impactAssessment)
    const sortedDeps = this.config.sortDependencies ? [...dependencies].sort() : dependencies

    if (prContext.isSecurityUpdate) {
      return this.generateSecurityUpdateSummary(
        'Go',
        sortedDeps,
        prContext,
        impactAssessment,
        emoji,
      )
    }

    if (sortedDeps.length === 1) {
      return this.generateSingleDependencySummary(
        'Go',
        sortedDeps[0],
        prContext,
        impactAssessment,
        emoji,
      )
    }

    if (sortedDeps.length <= this.config.maxDependenciesToList) {
      const depList = sortedDeps.map(dep => `\`${dep}\``).join(', ')
      const summary = `${emoji}Update Go modules: ${depList}`

      return this.addBreakingChangeWarning(summary, impactAssessment)
    }

    const summary = `${emoji}Update ${sortedDeps.length} Go modules`
    return this.addBreakingChangeWarning(summary, impactAssessment)
  }

  /**
   * Generate lockfile-specific changeset summary
   */
  private generateLockfileSummary(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    categorizationResult: CategorizationResult,
    dependencies: string[],
  ): string {
    const emoji = this.getEmojiForUpdate(prContext, impactAssessment)

    if (prContext.isSecurityUpdate) {
      return `${emoji}Update lockfile for security patches`
    }

    if (dependencies.length > 0) {
      const sortedDeps = this.config.sortDependencies ? [...dependencies].sort() : dependencies

      if (sortedDeps.length <= this.config.maxDependenciesToList) {
        const depList = sortedDeps.map(dep => `\`${dep}\``).join(', ')
        return `${emoji}Update lockfile for: ${depList}`
      }

      return `${emoji}Update lockfile for ${sortedDeps.length} dependencies`
    }

    return `${emoji}Update lockfile`
  }

  /**
   * Generate generic changeset summary for unknown managers
   */
  private generateGenericSummary(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    categorizationResult: CategorizationResult,
    updateType: string,
    dependencies: string[],
  ): string {
    const emoji = this.getEmojiForUpdate(prContext, impactAssessment)
    const sortedDeps = this.config.sortDependencies ? [...dependencies].sort() : dependencies

    if (prContext.isSecurityUpdate) {
      return this.generateSecurityUpdateSummary(
        updateType,
        sortedDeps,
        prContext,
        impactAssessment,
        emoji,
      )
    }

    if (prContext.isGroupedUpdate) {
      return this.generateGroupedUpdateSummary(
        updateType,
        sortedDeps,
        prContext,
        impactAssessment,
        emoji,
      )
    }

    if (sortedDeps.length === 0) {
      return `${emoji}Update ${updateType} dependencies`
    }

    if (sortedDeps.length === 1) {
      return this.generateSingleDependencySummary(
        updateType,
        sortedDeps[0],
        prContext,
        impactAssessment,
        emoji,
      )
    }

    if (sortedDeps.length <= this.config.maxDependenciesToList) {
      const depList = sortedDeps.map(dep => `\`${dep}\``).join(', ')
      const summary = `${emoji}Update ${updateType} dependencies: ${depList}`

      return this.addBreakingChangeWarning(summary, impactAssessment)
    }

    const summary = `${emoji}Update ${sortedDeps.length} ${updateType} dependencies`
    return this.addBreakingChangeWarning(summary, impactAssessment)
  }

  /**
   * Generate security update summary
   */
  private generateSecurityUpdateSummary(
    managerType: string,
    dependencies: string[],
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    _emoji: string,
  ): string {
    const securityEmoji = this.config.useEmojis ? '🔒 ' : ''

    if (dependencies.length === 0) {
      return `${securityEmoji}Security update for ${managerType} dependencies`
    }

    if (dependencies.length === 1) {
      const dep = dependencies[0]
      const versionInfo = prContext.dependencies.find(d => d.name === dep)
      let versionText = ''

      if (
        this.config.includeVersionDetails &&
        versionInfo?.currentVersion &&
        versionInfo?.newVersion
      ) {
        versionText = ` from \`${versionInfo.currentVersion}\` to \`${versionInfo.newVersion}\``
      }

      let summary = `${securityEmoji}Security update for ${managerType} dependency \`${dep}\`${versionText}`

      // Add vulnerability information if available
      if (impactAssessment.totalVulnerabilities > 0) {
        const vulnText =
          impactAssessment.totalVulnerabilities === 1 ? 'vulnerability' : 'vulnerabilities'
        summary += `\n\n🛡️ **Security**: Addresses ${impactAssessment.totalVulnerabilities} ${vulnText}`

        if (impactAssessment.highSeverityVulnerabilities > 0) {
          summary += ` (${impactAssessment.highSeverityVulnerabilities} high severity)`
        }
      }

      return summary
    }

    if (dependencies.length <= this.config.maxDependenciesToList) {
      const depList = dependencies.map(dep => `\`${dep}\``).join(', ')
      let summary = `${securityEmoji}Security update for ${managerType} dependencies: ${depList}`

      if (impactAssessment.totalVulnerabilities > 0) {
        const vulnText =
          impactAssessment.totalVulnerabilities === 1 ? 'vulnerability' : 'vulnerabilities'
        summary += `\n\n🛡️ **Security**: Addresses ${impactAssessment.totalVulnerabilities} ${vulnText}`
      }

      return summary
    }

    let summary = `${securityEmoji}Security update for ${dependencies.length} ${managerType} dependencies`

    if (impactAssessment.totalVulnerabilities > 0) {
      const vulnText =
        impactAssessment.totalVulnerabilities === 1 ? 'vulnerability' : 'vulnerabilities'
      summary += `\n\n🛡️ **Security**: Addresses ${impactAssessment.totalVulnerabilities} ${vulnText}`
    }

    return summary
  }

  /**
   * Generate grouped update summary
   */
  private generateGroupedUpdateSummary(
    managerType: string,
    dependencies: string[],
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    _emoji: string,
  ): string {
    const groupEmoji = this.config.useEmojis ? '📦 ' : ''

    if (dependencies.length <= this.config.maxDependenciesToList) {
      const depList = dependencies.map(dep => `\`${dep}\``).join(', ')
      const summary = `${groupEmoji}Group update for ${managerType} dependencies: ${depList}`

      return this.addBreakingChangeWarning(summary, impactAssessment)
    }

    const summary = `${groupEmoji}Group update for ${dependencies.length} ${managerType} dependencies`
    return this.addBreakingChangeWarning(summary, impactAssessment)
  }

  /**
   * Generate single dependency update summary
   */
  private generateSingleDependencySummary(
    managerType: string,
    dependency: string,
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    emoji: string,
  ): string {
    const versionInfo = prContext.dependencies.find(d => d.name === dependency)
    let versionText = ''

    if (
      this.config.includeVersionDetails &&
      versionInfo?.currentVersion &&
      versionInfo?.newVersion
    ) {
      versionText = ` from \`${versionInfo.currentVersion}\` to \`${versionInfo.newVersion}\``
    }

    const summary = `${emoji}Update ${managerType} dependency \`${dependency}\`${versionText}`

    return this.addBreakingChangeWarning(summary, impactAssessment)
  }

  /**
   * Add breaking change warning if applicable
   */
  private addBreakingChangeWarning(summary: string, impactAssessment: ImpactAssessment): string {
    if (impactAssessment.hasBreakingChanges && this.config.includeBreakingChangeWarnings) {
      return `${summary}\n\n⚠️ **Breaking Changes**: This update includes breaking changes that may require code modifications.`
    }
    return summary
  }

  /**
   * Get appropriate emoji for update type
   */
  private getEmojiForUpdate(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
  ): string {
    if (!this.config.useEmojis) {
      return ''
    }

    if (prContext.isSecurityUpdate) {
      return '🔒 '
    }

    if (prContext.isGroupedUpdate) {
      return '📦 '
    }

    if (impactAssessment.hasBreakingChanges) {
      return '⚠️ '
    }

    switch (prContext.manager) {
      case 'npm':
      case 'pnpm':
      case 'yarn':
        return '📦 '
      case 'github-actions':
        return '⚙️ '
      case 'docker':
      case 'dockerfile':
      case 'docker-compose':
        return '🐳 '
      case 'pip':
      case 'pipenv':
        return '🐍 '
      case 'gradle':
      case 'maven':
        return '☕ '
      case 'go':
        return '🐹 '
      default:
        return '📋 '
    }
  }

  /**
   * Get display name for Python package managers
   */
  private getPythonManagerDisplayName(manager: string): string {
    switch (manager) {
      case 'pip':
        return 'pip'
      case 'pipenv':
        return 'Pipenv'
      case 'poetry':
        return 'Poetry'
      case 'setuptools':
        return 'setuptools'
      case 'pip-compile':
        return 'pip-compile'
      case 'pip_setup':
        return 'pip'
      default:
        return 'Python'
    }
  }

  /**
   * Get display name for JVM package managers
   */
  private getJvmManagerDisplayName(manager: string): string {
    switch (manager) {
      case 'gradle':
        return 'Gradle'
      case 'maven':
        return 'Maven'
      case 'sbt':
        return 'SBT'
      case 'gradle-wrapper':
        return 'Gradle Wrapper'
      default:
        return 'JVM'
    }
  }

  /**
   * Build template context for custom template interpolation
   */
  private buildTemplateContext(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    categorizationResult: CategorizationResult,
    updateType: string,
    dependencies: string[],
  ): TemplateContext {
    const sortedDeps = this.config.sortDependencies ? [...dependencies].sort() : dependencies
    const primaryDep = prContext.dependencies[0]

    return {
      updateType,
      manager: prContext.manager,
      dependencies: sortedDeps,
      dependencyCount: sortedDeps.length,
      isSecurityUpdate: prContext.isSecurityUpdate,
      isGroupedUpdate: prContext.isGroupedUpdate,
      hasBreakingChanges: impactAssessment.hasBreakingChanges,
      primaryVersion: primaryDep?.newVersion,
      versionRange:
        primaryDep?.currentVersion && primaryDep?.newVersion
          ? `${primaryDep.currentVersion} → ${primaryDep.newVersion}`
          : undefined,
      riskLevel: this.determineRiskLevel(impactAssessment),
      primaryCategory: categorizationResult.primaryCategory,
      emoji: this.getEmojiForUpdate(prContext, impactAssessment).trim(),
    }
  }

  /**
   * Interpolate template with context variables
   */
  private interpolateTemplate(template: string, context: TemplateContext): string {
    return template
      .replaceAll('{updateType}', context.updateType)
      .replaceAll('{manager}', context.manager)
      .replaceAll('{dependencies}', context.dependencies.join(', '))
      .replaceAll('{dependencyCount}', context.dependencyCount.toString())
      .replaceAll('{isSecurityUpdate}', context.isSecurityUpdate.toString())
      .replaceAll('{isGroupedUpdate}', context.isGroupedUpdate.toString())
      .replaceAll('{hasBreakingChanges}', context.hasBreakingChanges.toString())
      .replaceAll('{primaryVersion}', context.primaryVersion || '')
      .replaceAll('{version}', context.primaryVersion || 'latest') // Backward compatibility
      .replaceAll('{versionRange}', context.versionRange || '')
      .replaceAll('{riskLevel}', context.riskLevel)
      .replaceAll('{primaryCategory}', context.primaryCategory)
      .replaceAll('{emoji}', context.emoji)
  }

  /**
   * Determine risk level from impact assessment
   */
  private determineRiskLevel(
    impactAssessment: ImpactAssessment,
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (impactAssessment.overallRiskScore >= 80) {
      return 'critical'
    }
    if (impactAssessment.overallRiskScore >= 60) {
      return 'high'
    }
    if (impactAssessment.overallRiskScore >= 30) {
      return 'medium'
    }
    return 'low'
  }
}
