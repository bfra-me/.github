import type {ClassificationResult} from '../classify/renovate-classifier.js'
import type {ExtractedRenovateUpdates} from '../extract/renovate-body-extractor.js'

import {escapeForMarkdown} from '../extract/renovate-body-extractor.js'

export interface FormatSummaryOptions {
  emoji?: boolean
}

interface ManagerLabels {
  singular: string
  plural: string
}

const MANAGER_LABELS: Record<ExtractedRenovateUpdates['manager'], ManagerLabels> = {
  npm: {singular: 'npm dependency', plural: 'npm dependencies'},
  docker: {singular: 'Docker image', plural: 'Docker images'},
  'github-actions': {
    singular: 'GitHub Actions workflow dependency',
    plural: 'GitHub Actions workflow dependencies',
  },
}

export function formatChangesetSummary(
  classification: ClassificationResult,
  extracted: ExtractedRenovateUpdates,
  options: FormatSummaryOptions = {},
): string {
  const labels = MANAGER_LABELS[extracted.manager]
  const prefix = getEmojiPrefix(classification, extracted, options.emoji ?? false)

  if (extracted.updates.length === 0) {
    return `${prefix}${classification.isSecurityUpdate ? 'Security update for' : 'Update'} ${labels.plural}`
  }

  const renderedUpdates = extracted.updates.map(update => ({
    packageName: `\`${escapeForMarkdown(update.packageName)}\``,
    versions: ` from \`${escapeForMarkdown(update.currentVersion)}\` to \`${escapeForMarkdown(update.newVersion)}\``,
  }))

  if (classification.isSecurityUpdate) {
    if (renderedUpdates.length === 1) {
      const update = renderedUpdates[0]
      return `${prefix}Security update for ${labels.singular} ${update?.packageName ?? ''}${update?.versions ?? ''}`
    }

    return `${prefix}Security update for ${labels.plural}: ${renderedUpdates.map(update => update.packageName).join(', ')}`
  }

  if (renderedUpdates.length === 1) {
    const update = renderedUpdates[0]
    return `${prefix}Update ${labels.singular} ${update?.packageName ?? ''}${update?.versions ?? ''}`
  }

  return `${prefix}Group update for ${labels.plural}: ${renderedUpdates.map(update => update.packageName).join(', ')}`
}

function getEmojiPrefix(
  classification: ClassificationResult,
  extracted: ExtractedRenovateUpdates,
  emojiEnabled: boolean,
): string {
  if (!emojiEnabled) return ''
  if (classification.isSecurityUpdate) return '🔒 '
  if (extracted.updates.length > 1) return '📦 '

  switch (extracted.manager) {
    case 'docker':
      return '🐳 '
    case 'github-actions':
      return '⚙️ '
    case 'npm':
      return '📦 '
  }
}
