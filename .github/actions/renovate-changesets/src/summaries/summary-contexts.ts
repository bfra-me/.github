import type {RenovatePRContext} from '../renovate-parser'
import type {ImpactAssessment} from '../semver-impact-assessor'
import type {SummaryGeneratorConfig} from '../summary-generator-types'
import type {
  CiSummaryContext,
  InfrastructureSummaryContext,
  JsEcosystemSummaryContext,
  JvmEcosystemSummaryContext,
} from './index'
import {
  addBreakingChangeWarning,
  generateGroupedUpdateSummary,
  generateSecurityUpdateSummary,
  generateSingleDependencySummary,
} from './structural-summaries'
import {
  getEmojiForUpdate,
  getJvmManagerDisplayName,
  getPythonManagerDisplayName,
} from './summary-helpers'

export interface SummaryContexts {
  js: JsEcosystemSummaryContext
  jvm: JvmEcosystemSummaryContext
  infrastructure: InfrastructureSummaryContext
  ci: CiSummaryContext
}

export function createSummaryContexts(config: SummaryGeneratorConfig): SummaryContexts {
  const getEmoji = (pr: RenovatePRContext, impact: ImpactAssessment) =>
    getEmojiForUpdate(pr, impact, config.useEmojis)
  const common = {
    config,
    addBreakingChangeWarning: (summary: string, impact: ImpactAssessment) =>
      addBreakingChangeWarning(summary, impact, config),
    generateSecurityUpdateSummary: (
      manager: string,
      deps: string[],
      pr: RenovatePRContext,
      impact: ImpactAssessment,
    ) => generateSecurityUpdateSummary(manager, deps, pr, impact, config),
    generateSingleDependencySummary: (
      manager: string,
      dep: string,
      pr: RenovatePRContext,
      impact: ImpactAssessment,
      emoji: string,
    ) => generateSingleDependencySummary(dep, emoji, 'dependency', manager, pr, impact, config),
    getEmojiForUpdate: getEmoji,
  }

  return {
    js: {
      ...common,
      generateGroupedUpdateSummary: (m, d, i) => generateGroupedUpdateSummary(m, d, i, config),
    },
    jvm: {...common, getJvmManagerDisplayName},
    infrastructure: {...common, getPythonManagerDisplayName},
    ci: {
      config,
      generateSecurityUpdateSummary: common.generateSecurityUpdateSummary,
      getEmojiForUpdate: getEmoji,
    },
  }
}
