import type {RenovateDependency} from '../renovate-parser'

export interface WorkspacePackage {
  name: string
  path: string
  packageJsonPath: string
  version: string
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  peerDependencies: Record<string, string>
  optionalDependencies: Record<string, string>
  private: boolean
  workspaces?: string[]
}

export type PackageRelationshipType =
  | 'internal-dependency'
  | 'peer-dependency'
  | 'dev-dependency'
  | 'version-consistency'
  | 'affected-by-update'

export interface PackageRelationship {
  source: string
  target: string
  type: PackageRelationshipType
  dependencyName?: string
  version?: string
  confidence: number
  impact: 'low' | 'medium' | 'high'
}

export interface MultiPackageAnalysisConfig {
  workspaceRoot: string
  detectWorkspaces: boolean
  analyzeInternalDependencies: boolean
  enforceVersionConsistency: boolean
  maxPackagesToAnalyze: number
  versionConsistencyPatterns: string[]
  internalPackagePatterns: string[]
}

export interface MultiPackageAnalysisResult {
  workspacePackages: WorkspacePackage[]
  packageRelationships: PackageRelationship[]
  affectedPackages: string[]
  impactAnalysis: {
    directlyAffected: string[]
    indirectlyAffected: string[]
    riskLevel: 'low' | 'medium' | 'high'
    changesetStrategy: 'single' | 'multiple' | 'grouped'
  }
  recommendations: {
    createSeparateChangesets: boolean
    packageGroups: string[][]
    reasoningChain: string[]
  }
}

export interface ImpactAnalyzerInput {
  dependencies: RenovateDependency[]
  changedFiles: string[]
  workspacePackages: WorkspacePackage[]
  relationships: PackageRelationship[]
}
