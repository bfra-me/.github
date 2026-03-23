import type {CategorizationResult} from './change-categorization-engine'
import type {ChangesetTemplateEngine} from './changeset-template-engine'
import type {RenovatePRContext} from './renovate-parser'
import type {ImpactAssessment} from './semver-impact-assessor'
import type {SummaryGeneratorConfig} from './summary-generator-types'

import {
  buildEnhancedTemplateContext,
  buildTemplateContext,
  createManagerSummaries,
  createSummaryContexts,
  generateGenericSummary,
  generateWithTemplateEngine,
  interpolateTemplate,
} from './summaries'
import {DEFAULT_SUMMARY_CONFIG} from './summary-generator-types'

export type {SummaryGeneratorConfig}
export {DEFAULT_SUMMARY_CONFIG}

interface GenerateChangesetSummaryOptions {
  config?: Partial<SummaryGeneratorConfig>
  templateEngine?: ChangesetTemplateEngine
  template?: string
}

function generateFromTemplate(
  template: string,
  pr: RenovatePRContext,
  impact: ImpactAssessment,
  cat: CategorizationResult,
  type: string,
  deps: string[],
  config: SummaryGeneratorConfig,
): string {
  return interpolateTemplate(template, buildTemplateContext(pr, impact, cat, type, deps, config))
}

function generateContextAwareSummary(
  pr: RenovatePRContext,
  impact: ImpactAssessment,
  type: string,
  deps: string[],
  managerSummaries: ReturnType<typeof createManagerSummaries>,
  config: SummaryGeneratorConfig,
): string {
  return (
    managerSummaries[pr.manager]?.(pr, impact, deps) ??
    generateGenericSummary(pr, impact, type, deps, config)
  )
}

function buildEnhancedTemplateContextForOptions(
  pr: RenovatePRContext,
  impact: ImpactAssessment,
  cat: CategorizationResult,
  type: string,
  deps: string[],
  config: SummaryGeneratorConfig,
) {
  return buildEnhancedTemplateContext(pr, impact, cat, type, deps, (p, i, c, t, d) =>
    buildTemplateContext(p, i, c, t, d, config),
  )
}

export async function generateChangesetSummary(
  pr: RenovatePRContext,
  impact: ImpactAssessment,
  cat: CategorizationResult,
  type: string,
  deps: string[],
  options: GenerateChangesetSummaryOptions = {},
): Promise<string> {
  const config = {...DEFAULT_SUMMARY_CONFIG, ...(options.config ?? {})}
  const managerSummaries = createManagerSummaries(createSummaryContexts(config), config)

  if (options.templateEngine != null) {
    return generateWithTemplateEngine(
      options.templateEngine,
      pr,
      impact,
      cat,
      type,
      deps,
      options.template,
      (summaryPr, summaryImpact, summaryType, summaryDeps) =>
        generateContextAwareSummary(
          summaryPr,
          summaryImpact,
          summaryType,
          summaryDeps,
          managerSummaries,
          config,
        ),
      (ctxPr, ctxImpact, ctxCat, ctxType, ctxDeps) =>
        buildEnhancedTemplateContextForOptions(ctxPr, ctxImpact, ctxCat, ctxType, ctxDeps, config),
    )
  }

  if (options.template != null) {
    return generateFromTemplate(options.template, pr, impact, cat, type, deps, config)
  }

  return generateContextAwareSummary(pr, impact, type, deps, managerSummaries, config)
}
