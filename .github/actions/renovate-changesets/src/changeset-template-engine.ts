/**
 * Enhanced Template Engine for Custom Changeset Templates and Formatting
 *
 * This module implements a sophisticated template engine that supports:
 * - Variable interpolation with default values
 * - Conditional formatting and expressions
 * - Loop constructs for collections
 * - Organization-specific templates and inheritance
 * - Template validation and error handling
 * - Extended template context and variables
 *
 * @since 2025-09-06 (TASK-027)
 */

import {readFile} from 'node:fs/promises'
import path from 'node:path'

/**
 * Enhanced template context with extended variables and metadata
 */
export interface EnhancedTemplateContext {
  // Basic context (backward compatibility)
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

  // Enhanced context variables
  timestamp: string
  date: string
  packageManager: string
  ecosystem: string
  updateScope: 'patch' | 'minor' | 'major'
  securitySeverity?: 'low' | 'moderate' | 'high' | 'critical'

  // Dependency details
  dependencyList: {
    name: string
    currentVersion?: string
    newVersion?: string
    versionRange?: string
    isBreaking: boolean
    isSecurity: boolean
  }[]

  // Categorization and impact details
  impact: {
    overall: string
    score: number
    confidence: number
    hasBreaking: boolean
    hasSecurity: boolean
  }

  // Organization-specific variables
  organization?: {
    name: string
    standards?: Record<string, any>
    branding?: {
      colors?: Record<string, string>
      icons?: Record<string, string>
    }
  }

  // Repository context
  repository?: {
    name: string
    language?: string
    framework?: string
    size?: 'small' | 'medium' | 'large'
  }

  // Helper functions for templates
  helpers: {
    formatDate: (date: Date | string, format?: string) => string
    capitalize: (text: string) => string
    pluralize: (word: string, count: number) => string
    truncate: (text: string, length: number) => string
    joinWithAnd: (items: string[]) => string
    formatVersion: (version: string) => string
    formatSemverBump: (current: string, next: string) => string
  }
}

/**
 * Template configuration for custom templates
 */
export interface TemplateConfig {
  /** Template content or path to template file */
  content?: string
  /** Path to template file (relative to action working directory) */
  filePath?: string
  /** Template format (handlebars, mustache, simple) */
  format: 'handlebars' | 'mustache' | 'simple'
  /** Template inheritance - parent template to extend */
  extends?: string
  /** Default values for template variables */
  defaults?: Record<string, any>
  /** Validation rules for template usage */
  validation?: {
    requiredContext?: string[]
    supportedManagers?: string[]
    minimumVersion?: string
  }
  /** Template metadata */
  metadata?: {
    name: string
    description?: string
    author?: string
    version?: string
    tags?: string[]
  }
}

/**
 * Organization-specific template collection
 */
export interface OrganizationTemplates {
  /** Base templates that can be extended */
  base?: Record<string, TemplateConfig>
  /** Manager-specific templates */
  managers?: Record<string, TemplateConfig>
  /** Update type templates (security, breaking, etc.) */
  updateTypes?: Record<string, TemplateConfig>
  /** Fallback template for unknown scenarios */
  fallback?: TemplateConfig
  /** Organization-specific defaults */
  defaults?: {
    format: 'handlebars' | 'mustache' | 'simple'
    useEmojis: boolean
    includeBranding: boolean
    verbosity: 'minimal' | 'standard' | 'detailed'
  }
}

/**
 * Template engine configuration
 */
export interface TemplateEngineConfig {
  /** Working directory for resolving template files */
  workingDirectory: string
  /** Organization templates */
  organizationTemplates?: OrganizationTemplates
  /** Template cache settings */
  cache?: {
    enabled: boolean
    maxSize: number
    ttl: number // Time to live in milliseconds
  }
  /** Error handling strategy */
  errorHandling: 'strict' | 'fallback' | 'silent'
  /** Template security settings */
  security?: {
    allowFileInclusion: boolean
    allowCodeExecution: boolean
    maxTemplateSize: number
    maxRenderTime: number
  }
}

/**
 * Template parsing result
 */
interface ParsedTemplate {
  type: 'simple' | 'handlebars' | 'mustache'
  content: string
  variables: Set<string>
  hasConditions: boolean
  hasLoops: boolean
  isValid: boolean
  errors: string[]
}

/**
 * Template cache entry
 */
interface TemplateCache {
  [key: string]: {
    parsed: ParsedTemplate
    timestamp: number
    accessCount: number
  }
}

/**
 * Enhanced template engine for custom changeset templates
 */
export class ChangesetTemplateEngine {
  private config: TemplateEngineConfig
  private cache: TemplateCache = {}
  private helpers: EnhancedTemplateContext['helpers']

  constructor(config: TemplateEngineConfig) {
    this.config = {
      ...config,
      cache: {enabled: true, maxSize: 100, ttl: 5 * 60 * 1000, ...config.cache}, // 5 minutes
      security: {
        allowFileInclusion: true,
        allowCodeExecution: false,
        maxTemplateSize: 50 * 1024, // 50KB
        maxRenderTime: 5000, // 5 seconds
        ...config.security,
      },
      errorHandling: config.errorHandling || 'fallback',
    }

    this.helpers = this.createHelpers()
  }

  /**
   * Render template with enhanced context
   */
  async renderTemplate(
    template: string | TemplateConfig,
    context: EnhancedTemplateContext,
  ): Promise<string> {
    try {
      const templateConfig =
        typeof template === 'string' ? {content: template, format: 'simple' as const} : template

      // Load template content if file path provided
      let templateContent = templateConfig.content
      if (!templateContent && templateConfig.filePath) {
        templateContent = await this.loadTemplateFile(templateConfig.filePath)
      }

      if (!templateContent) {
        throw new Error('No template content provided')
      }

      // Parse and validate template
      const parsed = await this.parseTemplate(templateContent, templateConfig.format)

      if (!parsed.isValid) {
        if (this.config.errorHandling === 'strict') {
          throw new Error(`Template validation failed: ${parsed.errors.join(', ')}`)
        }
        // Fallback to simple interpolation
        return this.renderSimpleTemplate(templateContent, context)
      }

      // Apply template inheritance
      if (templateConfig.extends) {
        templateContent = await this.applyInheritance(templateContent, templateConfig.extends)
      }

      // Merge defaults with context
      const enhancedContext = this.mergeWithDefaults(context, templateConfig.defaults)

      // Render based on format
      switch (templateConfig.format) {
        case 'handlebars':
          return this.renderHandlebarsTemplate(templateContent, enhancedContext)
        case 'mustache':
          return this.renderMustacheTemplate(templateContent, enhancedContext)
        case 'simple':
        default:
          return this.renderSimpleTemplate(templateContent, enhancedContext)
      }
    } catch (error) {
      if (this.config.errorHandling === 'strict') {
        throw error
      }

      if (this.config.errorHandling === 'fallback') {
        // Return a basic fallback template
        return this.renderFallbackTemplate(context)
      }

      // Silent mode - return empty string
      return ''
    }
  }

  /**
   * Create template from organization standards
   */
  async createFromOrganization(
    managerType: string,
    updateType: string,
    context: EnhancedTemplateContext,
  ): Promise<string> {
    const orgTemplates = this.config.organizationTemplates
    if (!orgTemplates) {
      return this.renderFallbackTemplate(context)
    }

    // Try manager-specific template first
    let template = orgTemplates.managers?.[managerType]

    // Fallback to update type template
    if (!template) {
      template = orgTemplates.updateTypes?.[updateType]
    }

    // Fallback to base template
    if (!template && orgTemplates.base) {
      const baseKey = Object.keys(orgTemplates.base)[0]
      template = orgTemplates.base[baseKey]
    }

    // Final fallback
    if (!template) {
      template = orgTemplates.fallback
    }

    if (!template) {
      return this.renderFallbackTemplate(context)
    }

    return this.renderTemplate(template, context)
  }

  /**
   * Validate template configuration
   */
  validateTemplate(template: TemplateConfig): {isValid: boolean; errors: string[]} {
    const errors: string[] = []

    // Check required content or file path
    if (!template.content && !template.filePath) {
      errors.push('Template must have either content or filePath')
    }

    // Validate format
    if (!['handlebars', 'mustache', 'simple'].includes(template.format)) {
      errors.push(`Invalid template format: ${template.format}`)
    }

    // Check file path security
    if (template.filePath && !this.config.security?.allowFileInclusion) {
      errors.push('File inclusion is disabled in security settings')
    }

    // Validate metadata
    if (template.metadata?.version && !/^\d+\.\d+\.\d+/.test(template.metadata.version)) {
      errors.push('Invalid version format in metadata')
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  /**
   * Load template file from filesystem
   */
  private async loadTemplateFile(filePath: string): Promise<string> {
    try {
      const fullPath = path.resolve(this.config.workingDirectory, filePath)

      // Security check - ensure path is within working directory
      if (!fullPath.startsWith(path.resolve(this.config.workingDirectory))) {
        throw new Error('Template file path outside working directory')
      }

      const content = await readFile(fullPath, 'utf8')

      // Check file size limit
      if (
        this.config.security?.maxTemplateSize &&
        content.length > this.config.security.maxTemplateSize
      ) {
        throw new Error(`Template file too large: ${content.length} bytes`)
      }

      return content
    } catch (error) {
      throw new Error(`Failed to load template file ${filePath}: ${error}`)
    }
  }

  /**
   * Parse template and detect features
   */
  private async parseTemplate(
    content: string,
    format: TemplateConfig['format'],
  ): Promise<ParsedTemplate> {
    const errors: string[] = []
    const variables = new Set<string>()

    // Extract variables based on format
    switch (format) {
      case 'handlebars': {
        // Extract {{variable}} patterns
        const hbMatches = content.matchAll(/\{\{([^}]+)\}\}/g)
        for (const match of hbMatches) {
          variables.add(match[1].trim())
        }
        break
      }

      case 'mustache': {
        // Extract {{variable}} patterns (similar to handlebars for basic variables)
        const mustacheMatches = content.matchAll(/\{\{([^}]+)\}\}/g)
        for (const match of mustacheMatches) {
          variables.add(match[1].trim())
        }
        break
      }

      case 'simple':
      default: {
        // Extract {variable} patterns
        const simpleMatches = content.matchAll(/\{([^}]+)\}/g)
        for (const match of simpleMatches) {
          variables.add(match[1].trim())
        }
        break
      }
    }

    // Detect advanced features
    const hasConditions =
      format !== 'simple' &&
      (content.includes('{{#if') ||
        content.includes('{{#unless') ||
        content.includes('{{^') ||
        (content.includes('{{#') && content.includes('{{/')))

    const hasLoops =
      format !== 'simple' && (content.includes('{{#each') || content.includes('{{#for'))

    return {
      type: format,
      content,
      variables,
      hasConditions,
      hasLoops,
      isValid: errors.length === 0,
      errors,
    }
  }

  /**
   * Apply template inheritance
   */
  private async applyInheritance(content: string, parentTemplate: string): Promise<string> {
    // Load parent template
    const parentContent = await this.loadTemplateFile(parentTemplate)

    // Simple block replacement for now
    // In a full implementation, this would support more sophisticated inheritance
    if (parentContent.includes('{{> content}}')) {
      return parentContent.replace('{{> content}}', content)
    }

    // Fallback - append to parent
    return `${parentContent}\n\n${content}`
  }

  /**
   * Merge context with template defaults
   */
  private mergeWithDefaults(
    context: EnhancedTemplateContext,
    defaults?: Record<string, any>,
  ): EnhancedTemplateContext {
    if (!defaults) {
      return context
    }

    return {
      ...context,
      ...Object.fromEntries(
        Object.entries(defaults).map(([key, value]) => [
          key,
          context[key as keyof EnhancedTemplateContext] ?? value,
        ]),
      ),
    }
  }

  /**
   * Render simple template with basic variable interpolation
   */
  private renderSimpleTemplate(template: string, context: EnhancedTemplateContext): string {
    let result = template

    // Replace all variables in context
    for (const [key, value] of Object.entries(context)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        result = result.replaceAll(`{${key}}`, String(value))
      }
    }

    // Handle special cases for arrays and objects
    result = result.replaceAll('{dependencies}', context.dependencies.join(', '))
    result = result.replaceAll(
      '{dependencyList}',
      context.dependencyList.map(dep => dep.name).join(', '),
    )

    // Remove any unreplaced variables
    result = result.replaceAll(/\{[^}]+\}/g, '')

    return result.trim()
  }

  /**
   * Render Handlebars template (basic implementation)
   */
  private renderHandlebarsTemplate(template: string, context: EnhancedTemplateContext): string {
    // Note: In a production implementation, this would use a proper Handlebars library
    // For now, implement basic conditionals and loops

    let result = template

    // Basic conditionals: {{#if condition}}...{{/if}}
    // Note: Using replace with regex because this requires callback function for complex replacement
    // eslint-disable-next-line unicorn/prefer-string-replace-all
    result = result.replace(
      /\{\{#if\s+(\w+)\}\}(.*?)\{\{\/if\}\}/gs,
      (_match, condition, content) => {
        const value = context[condition as keyof EnhancedTemplateContext]
        return value ? content : ''
      },
    )

    // Basic loops: {{#each array}}...{{/each}}
    // Note: Using replace with regex because this requires callback function for complex replacement
    // eslint-disable-next-line unicorn/prefer-string-replace-all
    result = result.replace(
      /\{\{#each\s+(\w+)\}\}(.*?)\{\{\/each\}\}/gs,
      (_match, arrayName, content) => {
        const array = context[arrayName as keyof EnhancedTemplateContext]
        if (Array.isArray(array)) {
          return array
            .map(item => {
              let itemContent = content
              if (typeof item === 'object') {
                for (const [key, value] of Object.entries(item)) {
                  itemContent = itemContent.replaceAll(`{{${key}}}`, String(value))
                }
              } else {
                itemContent = itemContent.replaceAll('{{this}}', String(item))
              }
              return itemContent
            })
            .join('')
        }
        return ''
      },
    )

    // Replace variables
    for (const [key, value] of Object.entries(context)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        result = result.replaceAll(`{{${key}}}`, String(value))
      }
    }

    return result.trim()
  }

  /**
   * Render Mustache template (basic implementation)
   */
  private renderMustacheTemplate(template: string, context: EnhancedTemplateContext): string {
    // Similar to Handlebars for basic features
    return this.renderHandlebarsTemplate(template, context)
  }

  /**
   * Render fallback template when all else fails
   */
  private renderFallbackTemplate(context: EnhancedTemplateContext): string {
    const emoji = context.emoji || '📦'
    const manager = context.manager || 'dependencies'
    const deps = context.dependencies.slice(0, 3).join(', ')
    const more =
      context.dependencies.length > 3 ? ` and ${context.dependencies.length - 3} more` : ''

    return `${emoji} Update ${manager} dependencies: ${deps}${more}`
  }

  /**
   * Create helper functions for templates
   */
  private createHelpers(): EnhancedTemplateContext['helpers'] {
    return {
      formatDate: (date: Date | string, _format = 'YYYY-MM-DD') => {
        const d = typeof date === 'string' ? new Date(date) : date
        return d.toISOString().split('T')[0] // Simple YYYY-MM-DD format
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
        if (items.length === 1) return items[0]
        if (items.length === 2) return `${items[0]} and ${items[1]}`
        return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`
      },

      formatVersion: (version: string) => {
        return version.startsWith('v') ? version : `v${version}`
      },

      formatSemverBump: (current: string, next: string) => {
        return `${current} → ${next}`
      },
    }
  }
}
