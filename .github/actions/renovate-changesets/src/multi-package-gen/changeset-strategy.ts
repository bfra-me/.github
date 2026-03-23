import type {MultiPackageAnalysisResult} from '../multi-package-analyzer'
import type {MultiPackageChangesetConfig} from './types'

export function determineChangesetStrategy(
  analysis: MultiPackageAnalysisResult,
  config: MultiPackageChangesetConfig,
  reasoning: string[],
): 'single' | 'multiple' | 'grouped' {
  reasoning.push('Analyzing changeset strategy...')

  if (!config.createSeparateChangesets) {
    reasoning.push('Configuration forces single changeset')
    return 'single'
  }

  const recommendedStrategy = analysis.impactAnalysis.changesetStrategy
  reasoning.push(`Analysis recommends: ${recommendedStrategy}`)

  if (config.respectPackageRelationships && analysis.packageRelationships.length > 0) {
    const hasInternalDeps = analysis.packageRelationships.some(
      r => r.type === 'internal-dependency',
    )
    if (hasInternalDeps && config.groupRelatedPackages) {
      reasoning.push('Found internal dependencies, using grouped strategy')
      return 'grouped'
    }
  }

  return recommendedStrategy
}
