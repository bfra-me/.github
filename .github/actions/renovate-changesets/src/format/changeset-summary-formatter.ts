import type {ClassificationResult} from '../classify/renovate-classifier.js'
import type {
  ExtractedManager,
  ExtractedRenovateUpdates,
  ExtractedRowManager,
} from '../extract/renovate-body-extractor.js'

import {escapeForMarkdown} from '../extract/renovate-body-extractor.js'

export interface FormatSummaryOptions {
  emoji?: boolean
}

interface ManagerLabels {
  singular: string
  plural: string
}

const MANAGER_LABELS: Record<ExtractedRowManager, ManagerLabels> = {
  npm: {singular: 'npm dependency', plural: 'npm dependencies'},
  docker: {singular: 'Docker image', plural: 'Docker images'},
  'github-actions': {
    singular: 'GitHub Actions workflow dependency',
    plural: 'GitHub Actions workflow dependencies',
  },
  unknown: {singular: 'dependency', plural: 'dependencies'},
}

export function formatChangesetSummary(
  classification: ClassificationResult,
  extracted: ExtractedRenovateUpdates,
  options: FormatSummaryOptions = {},
): string {
  const prefix = getEmojiPrefix(classification, extracted, options.emoji ?? false)

  if (extracted.operation?.kind === 'lockfile-maintenance') {
    const managers = extracted.operation.packageManagers
    const summary =
      managers.length === 1
        ? `Refresh ${managers[0]} lockfile dependencies`
        : 'Refresh package-manager lockfiles'
    return `${prefix}${summary}`
  }

  if (extracted.updates.length === 0) {
    const labels = labelsForManager(extracted.manager)
    return `${prefix}${classification.isSecurityUpdate ? 'Security update for' : 'Update'} ${labels.plural}`
  }

  const renderedUpdates = extracted.updates.map(update => ({
    packageName: `\`${escapeForMarkdown(update.packageName)}\``,
    versions: formatVersions(update),
  }))

  if (classification.isSecurityUpdate) {
    if (renderedUpdates.length === 1) {
      const update = renderedUpdates[0]
      const labels = labelsForManager(extracted.updates[0]?.manager ?? 'unknown')
      return `${prefix}Security update for ${labels.singular} ${update?.packageName ?? ''}${update?.versions ?? ''}`
    }

    if (extracted.manager === 'mixed') {
      return `${prefix}Security update across managers: ${formatManagerGroups(extracted)}`
    }

    const labels = labelsForManager(extracted.manager)
    return `${prefix}Security update for ${labels.plural}: ${renderedUpdates.map(update => update.packageName).join(', ')}`
  }

  if (renderedUpdates.length === 1) {
    const update = renderedUpdates[0]
    const labels = labelsForManager(extracted.updates[0]?.manager ?? 'unknown')
    const replacement = extracted.updates[0]?.replacedPackageName
    if (replacement != null) {
      return `${prefix}Replace ${labels.singular} \`${escapeForMarkdown(replacement)}\` with ${update?.packageName ?? ''}`
    }
    return `${prefix}Update ${labels.singular} ${update?.packageName ?? ''}${update?.versions ?? ''}`
  }

  if (extracted.manager === 'mixed') {
    return `${prefix}Group update across managers: ${formatManagerGroups(extracted)}`
  }

  const labels = labelsForManager(extracted.manager)
  return `${prefix}Group update for ${labels.plural}: ${renderedUpdates.map(update => update.packageName).join(', ')}`
}

function labelsForManager(manager: ExtractedManager | ExtractedRowManager): ManagerLabels {
  return manager in MANAGER_LABELS
    ? MANAGER_LABELS[manager as ExtractedRowManager]
    : MANAGER_LABELS.unknown
}

function formatManagerGroups(extracted: ExtractedRenovateUpdates): string {
  const groups = new Map<ExtractedRowManager, string[]>()
  for (const update of extracted.updates) {
    const packages = groups.get(update.manager) ?? []
    packages.push(`\`${escapeForMarkdown(update.packageName)}\``)
    groups.set(update.manager, packages)
  }

  return [...groups.entries()]
    .map(([manager, packages]) => {
      const labels = labelsForManager(manager)
      const label = packages.length === 1 ? labels.singular : labels.plural
      return `${label}: ${packages.join(', ')}`
    })
    .join('; ')
}

// Digest refreshes carry no human-meaningful version text — printing two 40-character SHAs is
// noise in a changelog — so the summary names the package and stops there.
function formatVersions(update: ExtractedRenovateUpdates['updates'][number]): string {
  if (update.isDigest) return ''
  return ` from \`${escapeForMarkdown(update.currentVersion)}\` to \`${escapeForMarkdown(update.newVersion)}\``
}

function getEmojiPrefix(
  classification: ClassificationResult,
  extracted: ExtractedRenovateUpdates,
  emojiEnabled: boolean,
): string {
  if (!emojiEnabled) return ''
  if (classification.isSecurityUpdate) return '🔒 '
  if (extracted.updates.length > 1) return '📦 '

  switch (extracted.updates[0]?.manager ?? extracted.manager) {
    case 'docker':
      return '🐳 '
    case 'github-actions':
      return '⚙️ '
    case 'npm':
      return '📦 '
    default:
      return ''
  }
}
