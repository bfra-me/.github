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
  type ManagerSummaryFn,
} from './summaries'
import {DEFAULT_SUMMARY_CONFIG} from './summary-generator-types'

export type {SummaryGeneratorConfig}
export {DEFAULT_SUMMARY_CONFIG}

export class ChangesetSummaryGenerator {
  private config: SummaryGeneratorConfig
  private templateEngine?: ChangesetTemplateEngine
  private managerSummaries: Record<string, ManagerSummaryFn>

  constructor(
    config: Partial<SummaryGeneratorConfig> = {},
    templateEngine?: ChangesetTemplateEngine,
  ) {
    this.config = {...DEFAULT_SUMMARY_CONFIG, ...config}
    this.templateEngine = templateEngine
    this.managerSummaries = createManagerSummaries(createSummaryContexts(this.config), this.config)
  }

  async generate(
    pr: RenovatePRContext,
    impact: ImpactAssessment,
    cat: CategorizationResult,
    type: string,
    deps: string[],
    template?: string,
  ): Promise<string> {
    if (this.templateEngine)
      return generateWithTemplateEngine(
        this.templateEngine,
        pr,
        impact,
        cat,
        type,
        deps,
        template,
        this.generateContextAwareSummary.bind(this),
        this.buildEnhancedTemplateContext.bind(this),
      )
    return template
      ? this.generateFromTemplate(template, pr, impact, cat, type, deps)
      : this.generateContextAwareSummary(pr, impact, type, deps)
  }

  async generateSummary(
    pr: RenovatePRContext,
    impact: ImpactAssessment,
    cat: CategorizationResult,
    type: string,
    deps: string[],
    template?: string,
  ): Promise<string> {
    return this.generate(pr, impact, cat, type, deps, template)
  }

  private generateFromTemplate(
    template: string,
    pr: RenovatePRContext,
    impact: ImpactAssessment,
    cat: CategorizationResult,
    type: string,
    deps: string[],
  ): string {
    return interpolateTemplate(
      template,
      buildTemplateContext(pr, impact, cat, type, deps, this.config),
    )
  }

  private generateContextAwareSummary(
    pr: RenovatePRContext,
    impact: ImpactAssessment,
    type: string,
    deps: string[],
  ): string {
    return (
      this.managerSummaries[pr.manager]?.(pr, impact, deps) ??
      this.generateGenericSummary(pr, impact, type, deps)
    )
  }

  private buildEnhancedTemplateContext(
    pr: RenovatePRContext,
    impact: ImpactAssessment,
    cat: CategorizationResult,
    type: string,
    deps: string[],
  ) {
    return buildEnhancedTemplateContext(pr, impact, cat, type, deps, (p, i, c, t, d) =>
      buildTemplateContext(p, i, c, t, d, this.config),
    )
  }

  private generateGenericSummary(
    pr: RenovatePRContext,
    impact: ImpactAssessment,
    type: string,
    deps: string[],
  ): string {
    return generateGenericSummary(pr, impact, type, deps, this.config)
  }
}
