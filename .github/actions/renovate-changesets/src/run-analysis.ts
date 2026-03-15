import type {Config} from './action-config'
import type {CategorizationResult} from './change-categorization-engine'
import type {RenovateDependency, RenovatePRContext} from './renovate-parser'
import type {SemverBumpDecision} from './semver-bump-decision-engine'
import type {ImpactAssessment} from './semver-impact-assessor'
import * as core from '@actions/core'
import {ChangeCategorizationEngine} from './change-categorization-engine'
import {SemverBumpTypeDecisionEngine} from './semver-bump-decision-engine'
import {SemverImpactAssessor} from './semver-impact-assessor'
import {detectUpdateType, matchesPatterns} from './utils'

export interface RunAnalysis {
  filteredFiles: string[]
  updateType: string
  impactAssessment: ImpactAssessment
  categorizationResult: CategorizationResult
  bumpDecision: SemverBumpDecision
  changesetType: 'patch' | 'minor' | 'major'
}

export function analyzeRunContext(
  changedFiles: string[],
  enhancedDependencies: RenovateDependency[],
  prContext: RenovatePRContext,
  config: Config,
): RunAnalysis {
  const excludePatterns = config.excludePatterns || []
  const filteredFiles =
    excludePatterns.length > 0
      ? changedFiles.filter(file => !matchesPatterns(file, excludePatterns))
      : changedFiles

  const detectedManager =
    prContext.manager === 'unknown' ? detectUpdateType(filteredFiles, config) : prContext.manager
  const updateType = detectedManager || 'dependencies'
  if (detectedManager == null) {
    core.info('No matching update type found, using default')
  }

  const semverAssessor = new SemverImpactAssessor({
    securityMinimumPatch: true,
    majorAsBreaking: true,
    prereleaseAsLowerImpact: true,
    defaultChangesetType: config.defaultChangesetType,
    managerRules: {
      'github-actions': {defaultImpact: 'patch'},
      npm: {majorAsBreaking: true},
      docker: {defaultImpact: 'patch'},
    },
  })
  const impactAssessment = semverAssessor.assessImpact(enhancedDependencies)
  core.info(
    `Semver impact assessment: ${JSON.stringify(
      {
        overallImpact: impactAssessment.overallImpact,
        recommendedChangesetType: impactAssessment.recommendedChangesetType,
        isSecurityUpdate: impactAssessment.isSecurityUpdate,
        hasBreakingChanges: impactAssessment.hasBreakingChanges,
        confidence: impactAssessment.confidence,
        dependencyCount: impactAssessment.dependencies.length,
      },
      null,
      2,
    )}`,
  )
  if (impactAssessment.reasoning.length > 0) {
    core.info(`Assessment reasoning: ${impactAssessment.reasoning.join('; ')}`)
  }

  const categorizationEngine = new ChangeCategorizationEngine({
    securityFirst: true,
    majorAsHighPriority: true,
    prereleaseAsLowerPriority: true,
    managerCategoryRules: {
      'github-actions': {categoryOverrides: {major: 'minor'}, riskAdjustment: 0.8},
      docker: {riskAdjustment: 0.9},
      npm: {categoryOverrides: {}, riskAdjustment: 1.1},
    },
  })
  const categorizationResult = categorizationEngine.categorizeChanges(
    enhancedDependencies,
    impactAssessment,
  )

  core.info(
    `Change categorization: ${JSON.stringify(
      {
        primaryCategory: categorizationResult.primaryCategory,
        allCategories: categorizationResult.allCategories,
        securityUpdates: categorizationResult.summary.securityUpdates,
        breakingChanges: categorizationResult.summary.breakingChanges,
        highPriorityUpdates: categorizationResult.summary.highPriorityUpdates,
        averageRiskLevel: categorizationResult.summary.averageRiskLevel,
        confidence: categorizationResult.confidence,
      },
      null,
      2,
    )}`,
  )
  if (categorizationResult.reasoning.length > 0) {
    core.info(`Categorization reasoning: ${categorizationResult.reasoning.join('; ')}`)
  }

  const decisionEngine = new SemverBumpTypeDecisionEngine({
    defaultBumpType: config.defaultChangesetType,
    securityTakesPrecedence: true,
    breakingChangesAlwaysMajor: true,
    securityMinimumBumps: {low: 'patch', moderate: 'patch', high: 'minor', critical: 'minor'},
    managerSpecificRules: {
      'github-actions': {
        allowDowngrade: true,
        maxBumpType: 'minor',
        defaultBumpType: 'patch',
        majorAsMinor: true,
      },
      docker: {
        allowDowngrade: true,
        maxBumpType: 'minor',
        defaultBumpType: 'patch',
        majorAsMinor: false,
      },
      npm: {
        allowDowngrade: false,
        maxBumpType: 'major',
        defaultBumpType: 'patch',
        majorAsMinor: false,
      },
    },
    riskTolerance: {patchMaxRisk: 20, minorMaxRisk: 50, majorRiskThreshold: 80},
    organizationRules: {
      conservativeMode: true,
      preferMinorForMajor: true,
      groupedUpdateHandling: 'conservative',
      dependencyPatternRules: [
        {pattern: /^@types\//, maxBumpType: 'patch'},
        {pattern: /eslint|prettier|typescript/, maxBumpType: 'patch'},
      ],
    },
  })

  const bumpDecision = decisionEngine.decideBumpType({
    semverImpact: impactAssessment,
    categorization: categorizationResult,
    renovateContext: prContext,
    manager: prContext.manager,
    isGroupedUpdate: prContext.isGroupedUpdate,
    dependencyCount: enhancedDependencies.length,
  })
  core.info(
    `Bump type decision: ${JSON.stringify(
      {
        bumpType: bumpDecision.bumpType,
        confidence: bumpDecision.confidence,
        primaryReason: bumpDecision.primaryReason,
        riskLevel: bumpDecision.riskAssessment.level,
        riskScore: bumpDecision.riskAssessment.score,
        overriddenRules: bumpDecision.overriddenRules.length,
        influencingFactors: bumpDecision.influencingFactors.length,
      },
      null,
      2,
    )}`,
  )
  if (bumpDecision.reasoningChain.length > 0) {
    core.info(`Decision reasoning: ${bumpDecision.reasoningChain.join(' → ')}`)
  }
  if (bumpDecision.overriddenRules.length > 0) {
    core.info(`Overridden rules: ${bumpDecision.overriddenRules.join('; ')}`)
  }

  return {
    filteredFiles,
    updateType,
    impactAssessment,
    categorizationResult,
    bumpDecision,
    changesetType: bumpDecision.bumpType,
  }
}
