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
 * - Custom templates and organization-specific formatting (TASK-027)
 *
 * @since 2025-09-05 (TASK-022)
 * @updated 2025-09-06 (TASK-027) - Added enhanced template engine integration
 */

import type {CategorizationResult} from './change-categorization-engine'
import type {
  ChangesetTemplateEngine,
  EnhancedTemplateContext,
  TemplateConfig,
} from './changeset-template-engine'
import type {RenovatePRContext} from './renovate-parser'
import type {ImpactAssessment} from './semver-impact-assessor'
import type {JsEcosystemSummaryContext} from './summaries/js-ecosystem-summaries'
import type {JvmEcosystemSummaryContext} from './summaries/jvm-ecosystem-summaries'
import type {SummaryGeneratorConfig, TemplateContext} from './summary-generator-types'
import {env} from 'node:process'

import {
  generateGitHubActionsSummaryLogic,
  generateGoSummaryLogic,
  generateNpmSummaryLogic,
} from './summaries/js-ecosystem-summaries'
import {
  generateComposerSummaryLogic,
  generateJvmSummaryLogic,
  generateNuGetSummaryLogic,
} from './summaries/jvm-ecosystem-summaries'
import {DEFAULT_SUMMARY_CONFIG} from './summary-generator-types'

export type {SummaryGeneratorConfig, TemplateContext}
export {DEFAULT_SUMMARY_CONFIG}

/**
 * Context-aware changeset summary generator
 */
export class ChangesetSummaryGenerator {
  private config: SummaryGeneratorConfig
  private templateEngine?: ChangesetTemplateEngine

  private createJsEcosystemSummaryContext(): JsEcosystemSummaryContext {
    return {
      config: this.config,
      addBreakingChangeWarning: this.addBreakingChangeWarning.bind(this),
      generateGroupedUpdateSummary: this.generateGroupedUpdateSummary.bind(this),
      generateSecurityUpdateSummary: this.generateSecurityUpdateSummary.bind(this),
      generateSingleDependencySummary: this.generateSingleDependencySummary.bind(this),
      getEmojiForUpdate: this.getEmojiForUpdate.bind(this),
    }
  }

  private createJvmEcosystemSummaryContext(): JvmEcosystemSummaryContext {
    return {
      config: this.config,
      addBreakingChangeWarning: this.addBreakingChangeWarning.bind(this),
      generateSecurityUpdateSummary: this.generateSecurityUpdateSummary.bind(this),
      generateSingleDependencySummary: this.generateSingleDependencySummary.bind(this),
      getEmojiForUpdate: this.getEmojiForUpdate.bind(this),
      getJvmManagerDisplayName: this.getJvmManagerDisplayName.bind(this),
    }
  }

  constructor(
    config: Partial<SummaryGeneratorConfig> = {},
    templateEngine?: ChangesetTemplateEngine,
  ) {
    this.config = {...DEFAULT_SUMMARY_CONFIG, ...config}
    this.templateEngine = templateEngine
  }

  /**
   * Generate a context-aware changeset summary
   * Enhanced with template engine support (TASK-027)
   */
  async generateSummary(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    categorizationResult: CategorizationResult,
    updateType: string,
    dependencies: string[],
    template?: string,
  ): Promise<string> {
    // TASK-027: Enhanced template engine integration
    if (this.templateEngine) {
      return this.generateWithTemplateEngine(
        prContext,
        impactAssessment,
        categorizationResult,
        updateType,
        dependencies,
        template,
      )
    }

    // Legacy template support (backward compatibility)
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

    // Default manager-specific generation
    return this.generateContextAwareSummary(prContext, impactAssessment, updateType, dependencies)
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
    updateType: string,
    dependencies: string[],
  ): string {
    // Determine the appropriate generator based on manager type
    switch (prContext.manager) {
      case 'npm':
      case 'pnpm':
      case 'yarn':
        return this.generateNpmSummary(prContext, impactAssessment, dependencies)

      case 'github-actions':
        return this.generateGitHubActionsSummary(prContext, impactAssessment, dependencies)

      case 'docker':
      case 'dockerfile':
      case 'docker-compose':
        return this.generateDockerSummary(prContext, impactAssessment, dependencies)

      case 'pip':
      case 'pipenv':
        return this.generatePythonSummary(prContext, impactAssessment, dependencies)

      case 'gradle':
      case 'maven':
        return this.generateJvmSummary(prContext, impactAssessment, dependencies)

      case 'go':
        return this.generateGoSummary(prContext, impactAssessment, dependencies)

      case 'nuget':
        return this.generateNuGetSummary(prContext, impactAssessment, dependencies)

      case 'composer':
        return this.generateComposerSummary(prContext, impactAssessment, dependencies)

      case 'cargo':
        return this.generateCargoSummary(prContext, impactAssessment, dependencies)

      case 'helm':
        return this.generateHelmSummary(prContext, impactAssessment, dependencies)

      case 'terraform':
        return this.generateTerraformSummary(prContext, impactAssessment, dependencies)

      case 'ansible':
        return this.generateAnsibleSummary(prContext, impactAssessment, dependencies)

      case 'pre-commit':
        return this.generatePreCommitSummary(prContext, impactAssessment, dependencies)

      case 'gitlabci':
        return this.generateGitLabCISummary(prContext, impactAssessment, dependencies)

      case 'circleci':
        return this.generateCircleCISummary(prContext, impactAssessment, dependencies)

      case 'lockfile':
        return this.generateLockfileSummary(prContext, impactAssessment, dependencies)

      default:
        return this.generateGenericSummary(prContext, impactAssessment, updateType, dependencies)
    }
  }

  /**
   * Generate NPM-specific changeset summary
   */
  private generateNpmSummary(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    dependencies: string[],
  ): string {
    return generateNpmSummaryLogic(
      this.createJsEcosystemSummaryContext(),
      prContext,
      impactAssessment,
      dependencies,
    )
  }

  /**
   * Generate GitHub Actions-specific changeset summary
   */
  private generateGitHubActionsSummary(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    dependencies: string[],
  ): string {
    return generateGitHubActionsSummaryLogic(
      this.createJsEcosystemSummaryContext(),
      prContext,
      impactAssessment,
      dependencies,
    )
  }

  /**
   * Generate Docker-specific changeset summary
   */
  private generateDockerSummary(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    dependencies: string[],
  ): string {
    const emoji = this.getEmojiForUpdate(prContext, impactAssessment)
    const sortedDeps = this.config.sortDependencies ? [...dependencies].sort() : dependencies

    if (prContext.isSecurityUpdate) {
      return this.generateSecurityUpdateSummary('Docker', sortedDeps, prContext, impactAssessment)
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
      )
    }

    if (sortedDeps.length === 1) {
      const firstDep = sortedDeps[0]
      if (!firstDep) {
        throw new Error('Invalid dependency in array')
      }
      return this.generateSingleDependencySummary(
        managerName,
        firstDep,
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
    dependencies: string[],
  ): string {
    return generateJvmSummaryLogic(
      this.createJvmEcosystemSummaryContext(),
      prContext,
      impactAssessment,
      dependencies,
    )
  }

  /**
   * Generate Go-specific changeset summary
   */
  private generateGoSummary(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    dependencies: string[],
  ): string {
    return generateGoSummaryLogic(
      this.createJsEcosystemSummaryContext(),
      prContext,
      impactAssessment,
      dependencies,
    )
  }

  /**
   * Generate lockfile-specific changeset summary
   */
  private generateLockfileSummary(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
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
    updateType: string,
    dependencies: string[],
  ): string {
    const emoji = this.getEmojiForUpdate(prContext, impactAssessment)
    const sortedDeps = this.config.sortDependencies ? [...dependencies].sort() : dependencies

    if (prContext.isSecurityUpdate) {
      return this.generateSecurityUpdateSummary(updateType, sortedDeps, prContext, impactAssessment)
    }

    if (prContext.isGroupedUpdate) {
      return this.generateGroupedUpdateSummary(updateType, sortedDeps, impactAssessment)
    }

    if (sortedDeps.length === 0) {
      return `${emoji}Update ${updateType} dependencies`
    }

    if (sortedDeps.length === 1) {
      return this.generateSingleDependencySummary(
        updateType,
        sortedDeps[0] || '',
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
    impactAssessment: ImpactAssessment,
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
   * Generate NuGet (.NET) specific changeset summary
   */
  private generateNuGetSummary(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    dependencies: string[],
  ): string {
    return generateNuGetSummaryLogic(
      this.createJvmEcosystemSummaryContext(),
      prContext,
      impactAssessment,
      dependencies,
    )
  }

  /**
   * Generate Composer (PHP) specific changeset summary
   */
  private generateComposerSummary(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    dependencies: string[],
  ): string {
    return generateComposerSummaryLogic(
      this.createJvmEcosystemSummaryContext(),
      prContext,
      impactAssessment,
      dependencies,
    )
  }

  /**
   * Generate Cargo (Rust) specific changeset summary
   */
  private generateCargoSummary(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    dependencies: string[],
  ): string {
    const emoji = this.getEmojiForUpdate(prContext, impactAssessment)
    const sortedDeps = this.config.sortDependencies ? [...dependencies].sort() : dependencies

    if (prContext.isSecurityUpdate) {
      return this.generateSecurityUpdateSummary('Cargo', sortedDeps, prContext, impactAssessment)
    }

    if (sortedDeps.length === 1) {
      const dependency = sortedDeps[0]
      if (dependency) {
        return this.generateSingleDependencySummary(
          'Cargo',
          dependency,
          prContext,
          impactAssessment,
          emoji,
        )
      }
    }

    if (sortedDeps.length <= this.config.maxDependenciesToList) {
      const depList = sortedDeps.map(dep => `\`${dep}\``).join(', ')
      const summary = `${emoji}Update Rust crates: ${depList}`

      return this.addBreakingChangeWarning(summary, impactAssessment)
    }

    const summary = `${emoji}Update ${sortedDeps.length} Rust crates`
    return this.addBreakingChangeWarning(summary, impactAssessment)
  }

  /**
   * Generate Helm specific changeset summary
   */
  private generateHelmSummary(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    dependencies: string[],
  ): string {
    const emoji = this.getEmojiForUpdate(prContext, impactAssessment)
    const sortedDeps = this.config.sortDependencies ? [...dependencies].sort() : dependencies

    if (prContext.isSecurityUpdate) {
      return this.generateSecurityUpdateSummary('Helm', sortedDeps, prContext, impactAssessment)
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

      return `${emoji}Update Helm chart \`${dep}\`${versionText}`
    }

    if (sortedDeps.length <= this.config.maxDependenciesToList) {
      const depList = sortedDeps.map(dep => `\`${dep}\``).join(', ')
      return `${emoji}Update Helm charts: ${depList}`
    }

    return `${emoji}Update ${sortedDeps.length} Helm charts`
  }

  /**
   * Generate Terraform specific changeset summary
   */
  private generateTerraformSummary(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    dependencies: string[],
  ): string {
    const emoji = this.getEmojiForUpdate(prContext, impactAssessment)
    const sortedDeps = this.config.sortDependencies ? [...dependencies].sort() : dependencies

    if (prContext.isSecurityUpdate) {
      return this.generateSecurityUpdateSummary(
        'Terraform',
        sortedDeps,
        prContext,
        impactAssessment,
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

      return `${emoji}Update Terraform provider \`${dep}\`${versionText}`
    }

    if (sortedDeps.length <= this.config.maxDependenciesToList) {
      const depList = sortedDeps.map(dep => `\`${dep}\``).join(', ')
      return `${emoji}Update Terraform providers: ${depList}`
    }

    return `${emoji}Update ${sortedDeps.length} Terraform providers`
  }

  /**
   * Generate Ansible specific changeset summary
   */
  private generateAnsibleSummary(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    dependencies: string[],
  ): string {
    const emoji = this.getEmojiForUpdate(prContext, impactAssessment)
    const sortedDeps = this.config.sortDependencies ? [...dependencies].sort() : dependencies

    if (prContext.isSecurityUpdate) {
      return this.generateSecurityUpdateSummary('Ansible', sortedDeps, prContext, impactAssessment)
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

      return `${emoji}Update Ansible role \`${dep}\`${versionText}`
    }

    if (sortedDeps.length <= this.config.maxDependenciesToList) {
      const depList = sortedDeps.map(dep => `\`${dep}\``).join(', ')
      return `${emoji}Update Ansible roles: ${depList}`
    }

    return `${emoji}Update ${sortedDeps.length} Ansible roles`
  }

  /**
   * Generate pre-commit hooks specific changeset summary
   */
  private generatePreCommitSummary(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    dependencies: string[],
  ): string {
    const emoji = this.getEmojiForUpdate(prContext, impactAssessment)
    const sortedDeps = this.config.sortDependencies ? [...dependencies].sort() : dependencies

    if (prContext.isSecurityUpdate) {
      return this.generateSecurityUpdateSummary(
        'pre-commit',
        sortedDeps,
        prContext,
        impactAssessment,
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

      return `${emoji}Update pre-commit hook \`${dep}\`${versionText}`
    }

    if (sortedDeps.length <= this.config.maxDependenciesToList) {
      const depList = sortedDeps.map(dep => `\`${dep}\``).join(', ')
      return `${emoji}Update pre-commit hooks: ${depList}`
    }

    return `${emoji}Update ${sortedDeps.length} pre-commit hooks`
  }

  /**
   * Generate GitLab CI specific changeset summary
   */
  private generateGitLabCISummary(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    dependencies: string[],
  ): string {
    const emoji = this.getEmojiForUpdate(prContext, impactAssessment)
    const sortedDeps = this.config.sortDependencies ? [...dependencies].sort() : dependencies

    if (prContext.isSecurityUpdate) {
      return this.generateSecurityUpdateSummary(
        'GitLab CI',
        sortedDeps,
        prContext,
        impactAssessment,
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

      return `${emoji}Update GitLab CI dependency \`${dep}\`${versionText}`
    }

    if (sortedDeps.length <= this.config.maxDependenciesToList) {
      const depList = sortedDeps.map(dep => `\`${dep}\``).join(', ')
      return `${emoji}Update GitLab CI dependencies: ${depList}`
    }

    return `${emoji}Update ${sortedDeps.length} GitLab CI dependencies`
  }

  /**
   * Generate CircleCI specific changeset summary
   */
  private generateCircleCISummary(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    dependencies: string[],
  ): string {
    const emoji = this.getEmojiForUpdate(prContext, impactAssessment)
    const sortedDeps = this.config.sortDependencies ? [...dependencies].sort() : dependencies

    if (prContext.isSecurityUpdate) {
      return this.generateSecurityUpdateSummary('CircleCI', sortedDeps, prContext, impactAssessment)
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

      return `${emoji}Update CircleCI orb \`${dep}\`${versionText}`
    }

    if (sortedDeps.length <= this.config.maxDependenciesToList) {
      const depList = sortedDeps.map(dep => `\`${dep}\``).join(', ')
      return `${emoji}Update CircleCI orbs: ${depList}`
    }

    return `${emoji}Update ${sortedDeps.length} CircleCI orbs`
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
      case 'nuget':
        return '💎 '
      case 'composer':
        return '🐘 '
      case 'cargo':
        return '🦀 '
      case 'helm':
        return '⎈ '
      case 'terraform':
        return '🏗️ '
      case 'ansible':
        return '🤖 '
      case 'pre-commit':
        return '🪝 '
      case 'gitlabci':
        return '🦊 '
      case 'circleci':
        return '🔄 '
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
    const resolvedManager = prContext.manager === 'unknown' ? updateType : prContext.manager

    return {
      updateType,
      manager: resolvedManager,
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

  /**
   * Generate summary using enhanced template engine (TASK-027)
   */
  private async generateWithTemplateEngine(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    categorizationResult: CategorizationResult,
    updateType: string,
    dependencies: string[],
    legacyTemplate?: string,
  ): Promise<string> {
    if (!this.templateEngine) {
      throw new Error('Template engine not available')
    }

    // Build enhanced template context
    const enhancedContext = this.buildEnhancedTemplateContext(
      prContext,
      impactAssessment,
      categorizationResult,
      updateType,
      dependencies,
    )

    try {
      // Try organization templates first
      const orgResult = await this.templateEngine.createFromOrganization(
        prContext.manager,
        updateType,
        enhancedContext,
      )

      if (orgResult && orgResult.trim()) {
        return orgResult
      }

      // Fallback to legacy template if provided
      if (legacyTemplate) {
        const legacyConfig: TemplateConfig = {
          content: legacyTemplate,
          format: 'simple',
        }
        return await this.templateEngine.renderTemplate(legacyConfig, enhancedContext)
      }

      // Final fallback to default generation
      return this.generateContextAwareSummary(prContext, impactAssessment, updateType, dependencies)
    } catch (error) {
      // Template engine failed, fallback to legacy generation
      console.warn(`Template engine failed, falling back to legacy generation: ${error}`)
      return this.generateContextAwareSummary(prContext, impactAssessment, updateType, dependencies)
    }
  }

  /**
   * Build enhanced template context (TASK-027)
   */
  private buildEnhancedTemplateContext(
    prContext: RenovatePRContext,
    impactAssessment: ImpactAssessment,
    categorizationResult: CategorizationResult,
    updateType: string,
    dependencies: string[],
  ): EnhancedTemplateContext {
    const now = new Date()
    const resolvedManager = prContext.manager === 'unknown' ? updateType : prContext.manager

    // Create enhanced dependency list with detailed information
    const dependencyList = prContext.dependencies.map(dep => ({
      name: dep.name,
      currentVersion: dep.currentVersion,
      newVersion: dep.newVersion,
      versionRange:
        dep.currentVersion && dep.newVersion
          ? `${dep.currentVersion} → ${dep.newVersion}`
          : undefined,
      isBreaking: false, // Breaking changes tracked at PR level
      isSecurity: dep.isSecurityUpdate || false,
    }))

    // Determine update scope from impact assessment
    const updateScope = impactAssessment.recommendedChangesetType

    // Extract security severity (convert nullable type to union)
    const securitySeverity =
      prContext.dependencies.find(dep => dep.isSecurityUpdate)?.securitySeverity || undefined

    // Build basic context
    const basicContext = this.buildTemplateContext(
      prContext,
      impactAssessment,
      categorizationResult,
      updateType,
      dependencies,
    )

    // Create helper functions
    const helpers = this.createEnhancedHelpers()

    // Return enhanced context
    return {
      ...basicContext,
      timestamp: now.toISOString(),
      date: now.toISOString().split('T')[0] ?? '',
      packageManager: this.getPackageManagerDisplayName(resolvedManager),
      ecosystem: this.getEcosystemName(resolvedManager),
      updateScope,
      securitySeverity: securitySeverity === null ? undefined : securitySeverity,
      dependencyList,
      impact: {
        overall: impactAssessment.overallImpact,
        score: impactAssessment.overallRiskScore,
        confidence:
          impactAssessment.confidence === 'high'
            ? 0.9
            : impactAssessment.confidence === 'medium'
              ? 0.7
              : 0.5,
        hasBreaking: impactAssessment.hasBreakingChanges,
        hasSecurity: prContext.isSecurityUpdate,
      },
      organization: {
        name: 'bfra.me', // Could be configurable
        standards: {},
        branding: {
          colors: {
            primary: '#0366d6',
            success: '#28a745',
            warning: '#ffc107',
            danger: '#dc3545',
          },
          icons: {},
        },
      },
      repository: {
        name: env.GITHUB_REPOSITORY?.split('/')[1] || 'unknown',
        language: 'typescript', // Could be detected
        framework: 'node', // Could be detected
        size: 'medium', // Could be calculated
      },
      helpers,
    }
  }

  /**
   * Create enhanced helper functions for templates (TASK-027)
   */
  private createEnhancedHelpers(): EnhancedTemplateContext['helpers'] {
    return {
      formatDate: (date: Date | string, _format = 'YYYY-MM-DD') => {
        const d = typeof date === 'string' ? new Date(date) : date
        return d.toISOString().split('T')[0] || ''
      },

      capitalize: (text: string) => {
        return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
      },

      pluralize: (word: string, count: number) => {
        return count === 1 ? word : `${word}s`
      },

      truncate: (text: string, length: number) => {
        return text.length > length ? `${text.slice(0, length)}...` : text
      },

      joinWithAnd: (items: string[]) => {
        if (items.length === 0) return ''
        if (items.length === 1) return items[0] || ''
        if (items.length === 2) return `${items[0]} and ${items[1]}`
        const lastItem = items.at(-1)
        return `${items.slice(0, -1).join(', ')}, and ${lastItem || ''}`
      },

      formatVersion: (version: string) => {
        return version.startsWith('v') ? version : `v${version}`
      },

      formatSemverBump: (current: string, next: string) => {
        return `${current} → ${next}`
      },
    }
  }

  /**
   * Get ecosystem name for template context
   */
  private getEcosystemName(manager: string): string {
    const ecosystemMap: Record<string, string> = {
      npm: 'node',
      pnpm: 'node',
      yarn: 'node',
      'github-actions': 'github',
      docker: 'container',
      pip: 'python',
      poetry: 'python',
      pipenv: 'python',
      maven: 'jvm',
      gradle: 'jvm',
      cargo: 'rust',
      nuget: 'dotnet',
      composer: 'php',
      gomod: 'go',
    }

    return ecosystemMap[manager] || 'unknown'
  }

  /**
   * Get package manager display name for template context
   */
  private getPackageManagerDisplayName(manager: string): string {
    const displayNames: Record<string, string> = {
      npm: 'npm',
      pnpm: 'pnpm',
      yarn: 'Yarn',
      'github-actions': 'GitHub Actions',
      docker: 'Docker',
      pip: 'pip',
      poetry: 'Poetry',
      pipenv: 'Pipenv',
      maven: 'Maven',
      gradle: 'Gradle',
      cargo: 'Cargo',
      nuget: 'NuGet',
      composer: 'Composer',
      gomod: 'Go modules',
    }

    return displayNames[manager] || manager
  }
}
