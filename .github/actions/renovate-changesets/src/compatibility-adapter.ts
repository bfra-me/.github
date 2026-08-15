import type {CategorizationInfo, ReleaseEntry} from './changeset-info-formatter.js'
import type {ClassificationResult} from './classify/renovate-classifier.js'
import type {ExtractedRenovateUpdates} from './extract/renovate-body-extractor.js'
import type {RenovateDependency} from './renovate-parser.js'

export interface ClassifiedCompatibilityResult {
  categorizationResult: CategorizationInfo
  dependencies: RenovateDependency[]
  dependencyNames: string[]
  releases: ReleaseEntry[]
}

const RISK_BY_BUMP = {
  patch: 20,
  minor: 50,
  major: 80,
} as const

const CONFIDENCE_BY_BUMP = {
  patch: 'high',
  minor: 'medium',
  major: 'low',
} as const

export function adaptClassifiedUpdates(
  extracted: ExtractedRenovateUpdates,
  classification: ClassificationResult,
  releaseNames: string[] = extracted.updates.map(update => update.packageName),
): ClassifiedCompatibilityResult {
  const dependencyNames = extracted.updates.map(update => update.packageName)
  const dependencies: RenovateDependency[] = extracted.updates.map(update => ({
    name: update.packageName,
    currentVersion: update.currentVersion,
    newVersion: update.newVersion,
    manager: extracted.manager,
    updateType: update.isDigest ? 'digest' : classification.bumpType,
    isSecurityUpdate: classification.isSecurityUpdate,
    securitySeverity: null,
    isGrouped: extracted.updates.length > 1,
  }))

  const updateCount = extracted.updates.length
  const majorCount = classification.bumpType === 'major' ? updateCount : 0

  return {
    categorizationResult: {
      primaryCategory: classification.updateCategory,
      allCategories: [classification.updateCategory],
      summary: {
        securityUpdates: classification.isSecurityUpdate ? updateCount : 0,
        breakingChanges: majorCount,
        highPriorityUpdates: majorCount,
        averageRiskLevel: RISK_BY_BUMP[classification.bumpType],
      },
      confidence: CONFIDENCE_BY_BUMP[classification.bumpType],
    },
    dependencies,
    dependencyNames,
    releases: releaseNames.map(name => ({name, type: classification.bumpType})),
  }
}
