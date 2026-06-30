import type {Octokit} from '@octokit/rest'
import type {RenovateDependency} from './renovate-parser.js'
import {
  analyzeEcosystemBreaking,
  analyzePRContentBreaking,
  analyzeReleaseNotesBreaking,
  analyzeVersionBreaking,
} from './detectors/breaking-change-analyzers.js'
import {detectEcosystem, FRAMEWORK_PATTERNS} from './detectors/breaking-change-patterns.js'
import {synthesizeBreakingAnalysis} from './detectors/breaking-change-synthesizer.js'

export interface BreakingChangeIndicator {
  type:
    'major_version' | 'api_deprecation' | 'config_change' | 'runtime_change' | 'ecosystem_specific'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  evidence: string[]
  confidence: 'low' | 'medium' | 'high'
}

export interface BreakingChangeAnalysis {
  hasBreakingChanges: boolean
  indicators: BreakingChangeIndicator[]
  overallSeverity: 'low' | 'medium' | 'high' | 'critical'
  confidence: 'low' | 'medium' | 'high'
  reasoning: string[]
  recommendedAction: 'proceed' | 'review_required' | 'manual_testing' | 'block'
}

export interface BreakingChangeAnalysisOptions {
  octokit?: Octokit
  owner?: string
  repo?: string
  prNumber?: number
}

export async function analyzeBreakingChanges(
  dependency: RenovateDependency,
  options: BreakingChangeAnalysisOptions = {},
): Promise<BreakingChangeAnalysis> {
  const indicators: BreakingChangeIndicator[] = []

  indicators.push(...analyzeVersionBreaking(dependency))
  indicators.push(...analyzeEcosystemBreaking(dependency))

  if (
    options.octokit != null &&
    options.owner != null &&
    options.repo != null &&
    options.prNumber != null
  ) {
    try {
      indicators.push(
        ...(await analyzePRContentBreaking(
          options.octokit,
          options.owner,
          options.repo,
          options.prNumber,
        )),
      )
    } catch (error) {
      console.warn('Failed to analyze PR content for breaking changes:', error)
    }
  }

  indicators.push(...analyzeReleaseNotesBreaking(dependency))

  return synthesizeBreakingAnalysis(indicators, dependency)
}

export {detectEcosystem, FRAMEWORK_PATTERNS}
