import type {
  MultiPackageAnalysisConfig,
  MultiPackageAnalysisResult,
  PackageRelationship,
  WorkspacePackage,
} from './multi-package/types'
import type {RenovateDependency} from './renovate-parser'
import process from 'node:process'
import {
  determineAffectedPackages,
  generateRecommendations,
  performImpactAnalysis,
} from './multi-package/impact-analyzer'
import {analyzePackageRelationships} from './multi-package/relationship-analyzer'
import {discoverWorkspacePackages} from './multi-package/workspace-discovery'

function buildConfig(config: Partial<MultiPackageAnalysisConfig>): MultiPackageAnalysisConfig {
  return {
    workspaceRoot: config.workspaceRoot || process.cwd(),
    detectWorkspaces: config.detectWorkspaces ?? true,
    analyzeInternalDependencies: config.analyzeInternalDependencies ?? true,
    enforceVersionConsistency: config.enforceVersionConsistency ?? true,
    maxPackagesToAnalyze: config.maxPackagesToAnalyze || 50,
    versionConsistencyPatterns: config.versionConsistencyPatterns || [
      '@types/*',
      'typescript',
      'eslint*',
      'prettier*',
      '@testing-library/*',
      'vitest*',
      'jest*',
    ],
    internalPackagePatterns: config.internalPackagePatterns || ['@*/.*', '^[^@][^/]*$'],
    ...config,
  }
}

export async function analyzeMultiPackageUpdate(
  dependencies: RenovateDependency[],
  changedFiles: string[],
  config: Partial<MultiPackageAnalysisConfig> = {},
): Promise<MultiPackageAnalysisResult> {
  const resolvedConfig = buildConfig(config)

  try {
    const workspacePackages = await discoverWorkspacePackages(resolvedConfig)

    const packageRelationships = await analyzePackageRelationships(
      workspacePackages,
      resolvedConfig,
    )

    const affectedPackages = await determineAffectedPackages(
      dependencies,
      changedFiles,
      workspacePackages,
      packageRelationships,
    )

    const impactAnalysis = await performImpactAnalysis(
      dependencies,
      affectedPackages,
      packageRelationships,
      workspacePackages,
    )

    const recommendations = await generateRecommendations(
      workspacePackages,
      packageRelationships,
      impactAnalysis,
    )

    return {
      workspacePackages,
      packageRelationships,
      affectedPackages,
      impactAnalysis,
      recommendations,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Multi-package analysis failed: ${errorMessage}`)
  }
}

export type {
  MultiPackageAnalysisConfig,
  MultiPackageAnalysisResult,
  PackageRelationship,
  WorkspacePackage,
}
