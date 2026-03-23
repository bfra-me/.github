import type {MultiPackageAnalysisResult} from '../multi-package-analyzer'
import type {MultiPackageChangesetConfig} from './types'

export function enhanceChangesetSummary(
  baseSummary: string,
  analysis: MultiPackageAnalysisResult,
  config: MultiPackageChangesetConfig,
  specificPackage?: string,
  packageGroup?: string[],
): string {
  let enhancedSummary = baseSummary

  if (analysis.workspacePackages.length > 1) {
    const packageInfo = specificPackage
      ? `for package \`${specificPackage}\``
      : packageGroup == null
        ? `across ${analysis.affectedPackages.length} packages`
        : `for packages: ${packageGroup.map(p => `\`${p}\``).join(', ')}`

    enhancedSummary += `\n\n**Multi-package update** ${packageInfo}.`

    if (config.includeRelationshipInfo && analysis.packageRelationships.length > 0) {
      const relevantRelationships = specificPackage
        ? analysis.packageRelationships.filter(
            r => r.source === specificPackage || r.target === specificPackage,
          )
        : packageGroup == null
          ? analysis.packageRelationships
          : analysis.packageRelationships.filter(
              r => packageGroup.includes(r.source) && packageGroup.includes(r.target),
            )

      if (relevantRelationships.length > 0) {
        enhancedSummary += '\n\n**Package relationships:**'
        for (const rel of relevantRelationships.slice(0, 5)) {
          enhancedSummary += `\n- \`${rel.source}\` → \`${rel.target}\` (${rel.type})`
        }
        if (relevantRelationships.length > 5) {
          enhancedSummary += `\n- ... and ${relevantRelationships.length - 5} more`
        }
      }
    }

    if (analysis.impactAnalysis.indirectlyAffected.length > 0) {
      enhancedSummary += `\n\n**Impact:** ${analysis.impactAnalysis.directlyAffected.length} packages directly affected, ${analysis.impactAnalysis.indirectlyAffected.length} indirectly affected.`
    }
  }

  return enhancedSummary
}
