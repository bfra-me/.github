import type {
  MultiPackageAnalysisResult,
  PackageRelationship,
  WorkspacePackage,
} from '../multi-package-analyzer'

export interface MultiPackageChangesetConfig {
  workingDirectory: string
  useOfficialChangesets: boolean
  createSeparateChangesets: boolean
  respectPackageRelationships: boolean
  groupRelatedPackages: boolean
  packageNameTemplate: string
  includeRelationshipInfo: boolean
  maxChangesetsPerPR: number
  enableDeduplication: boolean
  deduplicationConfig?: {
    enableContentDeduplication: boolean
    enableSemanticDeduplication: boolean
    enableChangesetMerging: boolean
    semanticSimilarityThreshold: number
    maxMergeCount: number
    mergeStrategy: 'conservative' | 'aggressive' | 'disabled'
    preserveMetadata: boolean
    analyzeExistingChangesets: boolean
    maxExistingChangesetAge: number
  }
}

export interface ChangesetInfo {
  id: string
  filename: string
  packages: string[]
  summary: string
  releases: {name: string; type: 'patch' | 'minor' | 'major'}[]
  relationships: PackageRelationship[]
  metadata: {
    isGrouped: boolean
    isSecurityUpdate: boolean
    hasBreakingChanges: boolean
    affectedDependencies: string[]
    reasoning: string[]
  }
}

export interface MultiPackageChangesetResult {
  changesets: ChangesetInfo[]
  strategy: 'single' | 'multiple' | 'grouped'
  totalPackagesAffected: number
  filesCreated: string[]
  reasoning: string[]
  warnings: string[]
}

export interface CreatorAnalysis {
  affectedPackages: MultiPackageAnalysisResult['affectedPackages']
  workspacePackages: WorkspacePackage[]
  packageRelationships: MultiPackageAnalysisResult['packageRelationships']
}
