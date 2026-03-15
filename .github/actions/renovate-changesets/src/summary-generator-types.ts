/**
 * Type definitions for context-aware changeset summary generation
 *
 * Extracted from changeset-summary-generator.ts to enable type reuse
 * across multiple modules without circular dependencies.
 *
 * @since 2025-09-05 (TASK-022)
 * @updated 2025-09-06 (TASK-027) - Added enhanced template engine integration
 */

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
