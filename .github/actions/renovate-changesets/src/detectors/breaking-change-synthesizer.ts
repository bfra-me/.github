import type {BreakingChangeAnalysis, BreakingChangeIndicator} from '../breaking-change-detector.js'
import type {RenovateDependency} from '../renovate-parser.js'

export function synthesizeBreakingAnalysis(
  indicators: BreakingChangeIndicator[],
  dependency: RenovateDependency,
): BreakingChangeAnalysis {
  const hasBreakingChanges = indicators.length > 0
  const severityLevels = ['low', 'medium', 'high', 'critical']
  let maxSeverityLevel = 0

  for (const indicator of indicators) {
    const level = severityLevels.indexOf(indicator.severity)
    if (level > maxSeverityLevel) {
      maxSeverityLevel = level
    }
  }

  const overallSeverity = (severityLevels[maxSeverityLevel] || 'low') as
    | 'low'
    | 'medium'
    | 'high'
    | 'critical'

  const confidenceLevels = ['low', 'medium', 'high']
  const avgConfidenceLevel = indicators.length
    ? Math.round(
        indicators
          .map(indicator => confidenceLevels.indexOf(indicator.confidence))
          .reduce((sum, level) => sum + level, 0) / indicators.length,
      )
    : 2

  const confidence = (confidenceLevels[avgConfidenceLevel] || 'medium') as 'low' | 'medium' | 'high'

  const reasoning: string[] = []

  if (hasBreakingChanges) {
    reasoning.push(`Found ${indicators.length} breaking change indicator(s)`)

    const byType = indicators.reduce(
      (acc, indicator) => {
        if (!acc[indicator.type]) acc[indicator.type] = 0
        acc[indicator.type] = (acc[indicator.type] ?? 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )

    for (const [type, count] of Object.entries(byType)) {
      reasoning.push(`${count} ${type.replace('_', ' ')} indicator(s)`)
    }
  } else {
    reasoning.push('No breaking change indicators detected')
    reasoning.push(`Version update: ${dependency.currentVersion} → ${dependency.newVersion}`)
  }

  let recommendedAction: 'proceed' | 'review_required' | 'manual_testing' | 'block'

  if (hasBreakingChanges) {
    if (overallSeverity === 'low') {
      recommendedAction = 'review_required'
    } else if (overallSeverity === 'medium') {
      recommendedAction = 'manual_testing'
    } else {
      recommendedAction = confidence === 'high' ? 'block' : 'manual_testing'
    }
  } else {
    recommendedAction = 'proceed'
  }

  return {
    hasBreakingChanges,
    indicators,
    overallSeverity,
    confidence,
    reasoning,
    recommendedAction,
  }
}
