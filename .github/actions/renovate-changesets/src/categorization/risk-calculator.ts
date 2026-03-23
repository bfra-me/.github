import type {CategorizedDependency} from './categorization-types'

export function elevateRiskLevel(
  current: 'low' | 'medium' | 'high' | 'critical',
  target: 'medium' | 'high' | 'critical',
): 'low' | 'medium' | 'high' | 'critical' {
  const levels = ['low', 'medium', 'high', 'critical']
  const currentIndex = levels.indexOf(current)
  const targetIndex = levels.indexOf(target)
  return levels[Math.max(currentIndex, targetIndex)] as typeof current
}

export function lowerRiskLevel(
  current: 'low' | 'medium' | 'high' | 'critical',
): 'low' | 'medium' | 'high' | 'critical' {
  const levels = ['low', 'medium', 'high', 'critical']
  const currentIndex = levels.indexOf(current)
  return levels[Math.max(0, currentIndex - 1)] as typeof current
}

export function adjustRiskLevel(
  current: 'low' | 'medium' | 'high' | 'critical',
  factor: number,
): 'low' | 'medium' | 'high' | 'critical' {
  const levels = ['low', 'medium', 'high', 'critical']
  const currentIndex = levels.indexOf(current)

  let adjustedIndex: number
  if (factor > 1) {
    adjustedIndex = currentIndex + Math.round(factor - 1)
  } else if (factor < 1) {
    adjustedIndex = currentIndex - Math.round((1 - factor) * 2)
  } else {
    adjustedIndex = currentIndex
  }

  return levels[Math.max(0, Math.min(3, adjustedIndex))] as typeof current
}

export function lowerConfidence(current: 'high' | 'medium' | 'low'): 'high' | 'medium' | 'low' {
  const levels = ['high', 'medium', 'low']
  const currentIndex = levels.indexOf(current)
  return levels[Math.min(2, currentIndex + 1)] as typeof current
}

export function calculateAverageRiskLevel(dependencies: CategorizedDependency[]): number {
  if (dependencies.length === 0) return 0

  const riskValues = {
    low: 25,
    medium: 50,
    high: 75,
    critical: 100,
  }

  const totalRisk = dependencies.reduce((sum, dep) => sum + riskValues[dep.riskLevel], 0)
  return Math.round(totalRisk / dependencies.length)
}

export function calculateOverallConfidence(
  confidenceLevels: ('high' | 'medium' | 'low')[],
): 'high' | 'medium' | 'low' {
  if (confidenceLevels.length === 0) return 'low'

  const confidenceValues = {high: 3, medium: 2, low: 1}
  const totalConfidence = confidenceLevels.reduce((sum, level) => sum + confidenceValues[level], 0)
  const averageConfidence = totalConfidence / confidenceLevels.length

  if (averageConfidence >= 2.5) return 'high'
  if (averageConfidence >= 1.5) return 'medium'
  return 'low'
}
