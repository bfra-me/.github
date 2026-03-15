import type {CategorizationResult} from './change-categorization-engine'
import type {MultiPackageAnalysisResult} from './multi-package-analyzer'
import type {MultiPackageChangesetResult} from './multi-package-changeset-generator'
import {
  setCategorizationOutputs,
  setChangesetOutputs,
  setMultiPackageOutputs,
} from './action-outputs'

export function setRunGenerationOutputs(params: {
  multiPackageResult: MultiPackageChangesetResult
  multiPackageAnalysis: MultiPackageAnalysisResult
  updateType: string
  dependencyNames: string[]
  changesetContent: string
  categorizationResult: CategorizationResult
}): void {
  setChangesetOutputs({
    changesetsCreated: params.multiPackageResult.filesCreated.length,
    changesetFiles: params.multiPackageResult.filesCreated,
    updateType: params.updateType || 'dependencies',
    dependencies: params.dependencyNames,
    changesetSummary: params.changesetContent,
  })
  setMultiPackageOutputs({
    strategy: params.multiPackageResult.strategy,
    workspacePackagesCount: params.multiPackageAnalysis.workspacePackages.length,
    packageRelationshipsCount: params.multiPackageAnalysis.packageRelationships.length,
    affectedPackages: params.multiPackageAnalysis.affectedPackages,
    reasoning: params.multiPackageResult.reasoning,
  })
  setCategorizationOutputs({
    primaryCategory: params.categorizationResult.primaryCategory,
    allCategories: params.categorizationResult.allCategories,
    summary: params.categorizationResult.summary,
    securityUpdates: params.categorizationResult.summary.securityUpdates,
    breakingChanges: params.categorizationResult.summary.breakingChanges,
    highPriorityUpdates: params.categorizationResult.summary.highPriorityUpdates,
    averageRiskLevel: params.categorizationResult.summary.averageRiskLevel,
    confidence: params.categorizationResult.confidence,
  })
}
