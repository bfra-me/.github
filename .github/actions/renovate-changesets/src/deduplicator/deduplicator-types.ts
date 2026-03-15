import type {ChangesetInfo} from '../multi-package-changeset-generator'

export interface ChangesetDeduplicationConfig {
  enableContentDeduplication: boolean
  enableSemanticDeduplication: boolean
  enableChangesetMerging: boolean
  semanticSimilarityThreshold: number
  maxMergeCount: number
  mergeStrategy: 'conservative' | 'aggressive' | 'disabled'
  preserveMetadata: boolean
  workingDirectory: string
  analyzeExistingChangesets: boolean
  maxExistingChangesetAge: number
}

export interface MergeOperation {
  merged: ChangesetInfo
  sources: ChangesetInfo[]
}

export interface DeduplicationResult {
  originalChangesets: ChangesetInfo[]
  deduplicatedChangesets: ChangesetInfo[]
  removedDuplicates: ChangesetInfo[]
  mergedChangesets: MergeOperation[]
  existingDuplicates: string[]
  reasoning: string[]
  warnings: string[]
  stats: {
    totalOriginal: number
    totalFinal: number
    duplicatesRemoved: number
    changesetseMerged: number
    existingDuplicates: number
  }
}

export interface ExistingChangesetInfo {
  filename: string
  filePath: string
  content: string
  releases: ChangesetInfo['releases']
  summary: string
  createdAt: Date
  age: number
}

export interface SimilarityAnalysis {
  contentSimilarity: number
  packageOverlap: number
  dependencyOverlap: number
  semanticSimilarity: number
  isExactMatch: boolean
  isSimilar: boolean
  canMerge: boolean
  mergeRisk: 'low' | 'medium' | 'high'
}

export interface DeduplicationPassResult {
  unique: ChangesetInfo[]
  duplicates: ChangesetInfo[]
}

export interface ExistingChangesetCheckResult {
  unique: ChangesetInfo[]
  duplicateFiles: string[]
}

export interface MergeChangesetsResult {
  merged: ChangesetInfo[]
  mergeOperations: MergeOperation[]
}
