/**
 * Enhanced Configuration Provider with Custom Template Support
 *
 * This module extends the existing configuration system to support:
 * - Custom changeset templates and formatting
 * - Organization-specific template collections
 * - Template inheritance and composition
 * - Advanced template engine settings
 * - Configuration validation and defaults
 *
 * @since 2025-09-06 (TASK-027)
 */

import type {
  OrganizationTemplates,
  TemplateConfig,
  TemplateEngineConfig,
} from './changeset-template-engine'
import {readFile} from 'node:fs/promises'

import path from 'node:path'
import * as core from '@actions/core'

import * as yaml from 'js-yaml'

/**
 * Extended configuration interface with template support
 */
export interface EnhancedConfig {
  updateTypes: {
    [key: string]: {
      changesetType: 'patch' | 'minor' | 'major'
      filePatterns: string[]
      /** Legacy template support (backward compatibility) */
      template?: string
      /** Enhanced template configuration */
      templateConfig?: TemplateConfig
    }
  }
  defaultChangesetType: 'patch' | 'minor' | 'major'
  excludePatterns?: string[]
  branchPrefix?: string
  skipBranchPrefixCheck?: boolean
  sort?: boolean
  commentPR?: boolean

  /** Enhanced template engine configuration */
  templateEngine?: {
    /** Template engine settings */
    engine?: Partial<TemplateEngineConfig>
    /** Organization-wide templates */
    organizationTemplates?: OrganizationTemplates
    /** Template discovery paths */
    templatePaths?: string[]
    /** Template validation settings */
    validation?: {
      strict?: boolean
      warnOnMissing?: boolean
      requireMetadata?: boolean
    }
  }

  /** Advanced formatting options */
  formatting?: {
    /** Use organization branding */
    useBranding?: boolean
    /** Emoji style preferences */
    emojiStyle?: 'unicode' | 'github' | 'none'
    /** Verbosity level */
    verbosity?: 'minimal' | 'standard' | 'detailed'
    /** Custom formatting rules */
    customRules?: {
      [key: string]: any
    }
  }
}

/**
 * Template discovery result
 */
interface TemplateDiscovery {
  found: {
    path: string
    name: string
    config: TemplateConfig
    isValid: boolean
    errors: string[]
  }[]
  searchPaths: string[]
  totalFound: number
  validTemplates: number
}

/**
 * Configuration validation result
 */
interface ConfigValidation {
  isValid: boolean
  errors: string[]
  warnings: string[]
  suggestions: string[]
}

/**
 * Enhanced configuration provider with template support
 */
export class EnhancedConfigProvider {
  private workingDirectory: string
  private baseConfig: EnhancedConfig

  constructor(workingDirectory: string, baseConfig: EnhancedConfig) {
    this.workingDirectory = workingDirectory
    this.baseConfig = baseConfig
  }

  /**
   * Load enhanced configuration with template support
   */
  async loadEnhancedConfig(): Promise<EnhancedConfig> {
    const configFile = core.getInput('config-file')
    const configInline = core.getInput('config')

    let config = {...this.baseConfig}

    // Load configuration from file or inline
    if (configFile) {
      try {
        const configContent = await readFile(
          path.resolve(this.workingDirectory, configFile),
          'utf8',
        )
        const fileConfig = this.parseConfigContent(configContent, configFile)
        config = this.mergeConfigs(config, fileConfig)
      } catch (error) {
        core.warning(`Failed to load config file ${configFile}: ${error}`)
      }
    } else if (configInline) {
      try {
        const inlineConfig = JSON.parse(configInline) as Partial<EnhancedConfig>
        config = this.mergeConfigs(config, inlineConfig)
      } catch (error) {
        core.warning(`Failed to parse inline config: ${error}`)
      }
    }

    // Load additional inputs
    config = await this.loadInputConfig(config)

    // Discover and load organization templates
    if (config.templateEngine?.templatePaths) {
      config.templateEngine.organizationTemplates = await this.discoverOrganizationTemplates(
        config.templateEngine.templatePaths,
      )
    }

    // Validate final configuration
    const validation = this.validateConfig(config)
    if (!validation.isValid) {
      const errorMessage = `Configuration validation failed: ${validation.errors.join(', ')}`
      core.error(errorMessage)
      throw new Error(errorMessage)
    }

    // Log warnings and suggestions
    for (const warning of validation.warnings) {
      core.warning(warning)
    }
    for (const suggestion of validation.suggestions) {
      core.info(`Suggestion: ${suggestion}`)
    }

    return config
  }

  /**
   * Create template engine configuration from enhanced config
   */
  createTemplateEngineConfig(config: EnhancedConfig): TemplateEngineConfig {
    const engineConfig = config.templateEngine?.engine || {}

    return {
      workingDirectory: this.workingDirectory,
      errorHandling: 'fallback',
      ...engineConfig,
      organizationTemplates: config.templateEngine?.organizationTemplates,
    }
  }

  /**
   * Discover organization templates from specified paths
   */
  async discoverOrganizationTemplates(templatePaths: string[]): Promise<OrganizationTemplates> {
    const discovery = await this.discoverTemplates(templatePaths)

    const organizationTemplates: OrganizationTemplates = {
      base: {},
      managers: {},
      updateTypes: {},
      defaults: {
        format: 'simple',
        useEmojis: true,
        includeBranding: false,
        verbosity: 'standard',
      },
    }

    // Organize discovered templates
    for (const template of discovery.found) {
      if (!template.isValid) {
        core.warning(`Skipping invalid template ${template.name}: ${template.errors.join(', ')}`)
        continue
      }

      const templateConfig = template.config
      const metadata = templateConfig.metadata

      // Categorize templates based on metadata tags or name patterns
      if (metadata?.tags?.includes('base') || template.name.includes('base')) {
        if (!organizationTemplates.base) {
          organizationTemplates.base = {}
        }
        organizationTemplates.base[template.name] = templateConfig
      } else if (metadata?.tags?.includes('manager') || template.name.includes('manager')) {
        // Extract manager name from template name or metadata
        const managerName = this.extractManagerName(template.name, metadata)
        if (managerName) {
          if (!organizationTemplates.managers) {
            organizationTemplates.managers = {}
          }
          organizationTemplates.managers[managerName] = templateConfig
        }
      } else if (
        metadata?.tags?.includes('update-type') ||
        template.name.includes('security') ||
        template.name.includes('breaking')
      ) {
        // Extract update type from template name or metadata
        const updateType = this.extractUpdateType(template.name, metadata)
        if (updateType) {
          if (!organizationTemplates.updateTypes) {
            organizationTemplates.updateTypes = {}
          }
          organizationTemplates.updateTypes[updateType] = templateConfig
        }
      } else if (metadata?.tags?.includes('fallback') || template.name.includes('fallback')) {
        organizationTemplates.fallback = templateConfig
      }
    }

    core.info(
      `Discovered ${discovery.validTemplates} valid templates from ${discovery.searchPaths.length} paths`,
    )

    return organizationTemplates
  }

  /**
   * Discover templates from file system paths
   */
  async discoverTemplates(searchPaths: string[]): Promise<TemplateDiscovery> {
    const discovery: TemplateDiscovery = {
      found: [],
      searchPaths: [],
      totalFound: 0,
      validTemplates: 0,
    }

    for (const searchPath of searchPaths) {
      const fullPath = path.resolve(this.workingDirectory, searchPath)
      discovery.searchPaths.push(fullPath)

      try {
        // Look for template files (simple implementation - could be enhanced with glob patterns)
        const templateFiles = await this.findTemplateFiles(fullPath)

        for (const templateFile of templateFiles) {
          try {
            const templateConfig = await this.loadTemplateConfig(templateFile)
            const validation = this.validateTemplateConfig(templateConfig)

            discovery.found.push({
              path: templateFile,
              name: path.basename(templateFile, path.extname(templateFile)),
              config: templateConfig,
              isValid: validation.isValid,
              errors: validation.errors,
            })

            if (validation.isValid) {
              discovery.validTemplates++
            }
          } catch (error) {
            core.warning(`Failed to load template ${templateFile}: ${error}`)
          }
        }
      } catch (error) {
        core.warning(`Failed to search template path ${fullPath}: ${error}`)
      }
    }

    discovery.totalFound = discovery.found.length
    return discovery
  }

  /**
   * Parse configuration content (JSON or YAML)
   */
  private parseConfigContent(content: string, filename: string): Partial<EnhancedConfig> {
    const extension = path.extname(filename).toLowerCase()

    try {
      if (extension === '.json') {
        return JSON.parse(content) as Partial<EnhancedConfig>
      } else if (extension === '.yaml' || extension === '.yml') {
        return yaml.load(content) as Partial<EnhancedConfig>
      } else {
        // Try JSON first, then YAML
        try {
          return JSON.parse(content) as Partial<EnhancedConfig>
        } catch {
          return yaml.load(content) as Partial<EnhancedConfig>
        }
      }
    } catch (error) {
      throw new Error(`Failed to parse configuration file ${filename}: ${error}`)
    }
  }

  /**
   * Merge configuration objects
   */
  private mergeConfigs(base: EnhancedConfig, override: Partial<EnhancedConfig>): EnhancedConfig {
    return {
      ...base,
      ...override,
      updateTypes: {
        ...base.updateTypes,
        ...override.updateTypes,
      },
      templateEngine: {
        ...base.templateEngine,
        ...override.templateEngine,
        engine: {
          ...base.templateEngine?.engine,
          ...override.templateEngine?.engine,
        },
        organizationTemplates: {
          ...base.templateEngine?.organizationTemplates,
          ...override.templateEngine?.organizationTemplates,
        },
      },
      formatting: {
        ...base.formatting,
        ...override.formatting,
      },
    }
  }

  /**
   * Load configuration from action inputs
   */
  private async loadInputConfig(config: EnhancedConfig): Promise<EnhancedConfig> {
    // Read template engine specific inputs
    const templateEngineEnabled = core.getBooleanInput('enable-template-engine')
    const templatePaths = core.getInput('template-paths')
    const organizationTemplatesPath = core.getInput('organization-templates-path')

    if (templateEngineEnabled || templatePaths || organizationTemplatesPath) {
      config.templateEngine = config.templateEngine || {}
    }

    if (templatePaths) {
      if (!config.templateEngine) {
        config.templateEngine = {}
      }
      config.templateEngine.templatePaths = templatePaths.split(',').map(p => p.trim())
    }

    if (organizationTemplatesPath) {
      try {
        const orgTemplatesContent = await readFile(
          path.resolve(this.workingDirectory, organizationTemplatesPath),
          'utf8',
        )
        const orgTemplates = this.parseConfigContent(orgTemplatesContent, organizationTemplatesPath)
        if (!config.templateEngine) {
          config.templateEngine = {}
        }
        config.templateEngine.organizationTemplates = orgTemplates as OrganizationTemplates
      } catch (error) {
        core.warning(
          `Failed to load organization templates from ${organizationTemplatesPath}: ${error}`,
        )
      }
    }

    // Read formatting inputs
    const useBranding = core.getBooleanInput('use-branding')
    const emojiStyle = core.getInput('emoji-style')
    const verbosity = core.getInput('verbosity')

    if (useBranding || emojiStyle || verbosity) {
      config.formatting = config.formatting || {}

      if (useBranding) {
        config.formatting.useBranding = useBranding
      }

      if (emojiStyle && ['unicode', 'github', 'none'].includes(emojiStyle)) {
        config.formatting.emojiStyle = emojiStyle as 'unicode' | 'github' | 'none'
      }

      if (verbosity && ['minimal', 'standard', 'detailed'].includes(verbosity)) {
        config.formatting.verbosity = verbosity as 'minimal' | 'standard' | 'detailed'
      }
    }

    return config
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: EnhancedConfig): ConfigValidation {
    const errors: string[] = []
    const warnings: string[] = []
    const suggestions: string[] = []

    // Validate basic configuration
    if (!config.updateTypes || Object.keys(config.updateTypes).length === 0) {
      errors.push('At least one update type must be configured')
    }

    // Validate template engine configuration
    if (config.templateEngine) {
      if (config.templateEngine.templatePaths?.length === 0) {
        warnings.push('Template paths specified but empty')
      }

      // Validate organization templates
      const orgTemplates = config.templateEngine.organizationTemplates
      if (orgTemplates) {
        const hasAnyTemplates = Boolean(
          orgTemplates.base ||
            orgTemplates.managers ||
            orgTemplates.updateTypes ||
            orgTemplates.fallback,
        )
        if (!hasAnyTemplates) {
          warnings.push('Organization templates configured but no templates found')
        }
      }
    }

    // Validate formatting configuration
    if (
      config.formatting?.emojiStyle &&
      !['unicode', 'github', 'none'].includes(config.formatting.emojiStyle)
    ) {
      errors.push(`Invalid emoji style: ${config.formatting.emojiStyle}`)
    }

    // Provide suggestions
    if (!config.templateEngine) {
      suggestions.push('Consider enabling template engine for advanced changeset customization')
    }

    if (!config.formatting?.useBranding) {
      suggestions.push(
        'Consider enabling organization branding for consistent changeset formatting',
      )
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
    }
  }

  /**
   * Find template files in a directory
   */
  private async findTemplateFiles(searchPath: string): Promise<string[]> {
    // Simple implementation - in a full implementation this would use proper directory traversal
    // For now, assume template files have specific extensions
    const templateExtensions = ['.md', '.hbs', '.mustache', '.txt']
    const templateFiles: string[] = []

    try {
      const {readdir, stat} = await import('node:fs/promises')
      const entries = await readdir(searchPath)

      for (const entry of entries) {
        const fullPath = path.join(searchPath, entry)
        const stats = await stat(fullPath)

        if (stats.isFile() && templateExtensions.some(ext => entry.endsWith(ext))) {
          templateFiles.push(fullPath)
        }
      }
    } catch (error) {
      // Directory doesn't exist or not accessible
      core.debug(`Cannot access template directory ${searchPath}: ${error}`)
    }

    return templateFiles
  }

  /**
   * Load template configuration from file
   */
  private async loadTemplateConfig(templatePath: string): Promise<TemplateConfig> {
    const content = await readFile(templatePath, 'utf8')
    const extension = path.extname(templatePath).toLowerCase()

    // Extract metadata from template file if it exists (YAML frontmatter style)
    const frontmatterMatch = content.match(/^---\n(.*?)\n---\n(.*)$/s)

    let templateConfig: TemplateConfig

    if (frontmatterMatch && frontmatterMatch[1] && frontmatterMatch[2]) {
      // Template has YAML frontmatter metadata
      const metadata = yaml.load(frontmatterMatch[1]) as any
      const templateContent = frontmatterMatch[2]

      templateConfig = {
        content: templateContent,
        format: this.detectTemplateFormat(templateContent, extension),
        metadata: {
          name: metadata.name || path.basename(templatePath, path.extname(templatePath)),
          description: metadata.description,
          author: metadata.author,
          version: metadata.version,
          tags: metadata.tags || [],
        },
        extends: metadata.extends,
        defaults: metadata.defaults,
        validation: metadata.validation,
      }
    } else {
      // Simple template file without metadata
      templateConfig = {
        content,
        format: this.detectTemplateFormat(content, extension),
        metadata: {
          name: path.basename(templatePath, path.extname(templatePath)),
        },
      }
    }

    return templateConfig
  }

  /**
   * Detect template format from content and file extension
   */
  private detectTemplateFormat(content: string, extension: string): TemplateConfig['format'] {
    if (extension === '.hbs' || content.includes('{{#') || content.includes('{{/')) {
      return 'handlebars'
    }

    if (extension === '.mustache' || content.includes('{{#') || content.includes('{{^')) {
      return 'mustache'
    }

    return 'simple'
  }

  /**
   * Validate template configuration
   */
  private validateTemplateConfig(template: TemplateConfig): {isValid: boolean; errors: string[]} {
    const errors: string[] = []

    if (!template.content && !template.filePath) {
      errors.push('Template must have content or file path')
    }

    if (!['handlebars', 'mustache', 'simple'].includes(template.format)) {
      errors.push(`Invalid template format: ${template.format}`)
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  /**
   * Extract manager name from template name or metadata
   */
  private extractManagerName(
    templateName: string,
    metadata?: TemplateConfig['metadata'],
  ): string | null {
    // Check metadata first
    if (metadata?.tags) {
      for (const tag of metadata.tags) {
        if (tag.startsWith('manager:')) {
          return tag.replace('manager:', '')
        }
      }
    }

    // Extract from template name patterns
    const managerPatterns = [
      /npm/,
      /yarn/,
      /pnpm/,
      /docker/,
      /github-actions?/,
      /maven/,
      /gradle/,
      /pip/,
      /poetry/,
      /cargo/,
      /nuget/,
      /composer/,
    ]

    for (const pattern of managerPatterns) {
      if (pattern.test(templateName.toLowerCase())) {
        return pattern.source.replaceAll(/[^a-z-]/g, '')
      }
    }

    return null
  }

  /**
   * Extract update type from template name or metadata
   */
  private extractUpdateType(
    templateName: string,
    metadata?: TemplateConfig['metadata'],
  ): string | null {
    // Check metadata first
    if (metadata?.tags) {
      for (const tag of metadata.tags) {
        if (tag.startsWith('update-type:')) {
          return tag.replace('update-type:', '')
        }
      }
    }

    // Extract from template name patterns
    if (templateName.toLowerCase().includes('security')) {
      return 'security'
    }
    if (templateName.toLowerCase().includes('breaking')) {
      return 'breaking'
    }
    if (templateName.toLowerCase().includes('major')) {
      return 'major'
    }
    if (templateName.toLowerCase().includes('minor')) {
      return 'minor'
    }
    if (templateName.toLowerCase().includes('patch')) {
      return 'patch'
    }

    return null
  }
}
