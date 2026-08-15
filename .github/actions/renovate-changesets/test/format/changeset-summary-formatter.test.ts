import {describe, expect, it} from 'vitest'
import {classifyRenovateUpdates} from '../../src/classify/renovate-classifier'
import {extractRenovateUpdates} from '../../src/extract/renovate-body-extractor'
import {formatChangesetSummary} from '../../src/format/changeset-summary-formatter'
import {
  dockerBody,
  githubActionsBody,
  groupedBody,
  markdownControlCharacterBody,
  npmBody,
  securityBody,
} from '../extract/fixtures'

function formatUpdate(
  body: string,
  branchName: string,
  options: {emoji?: boolean} = {},
  commitMessage?: string,
): string {
  const extracted = extractRenovateUpdates({
    prNumber: 3001,
    body,
    branchName,
    commitMessage,
  })

  return formatChangesetSummary(classifyRenovateUpdates(extracted), extracted, options)
}

describe('formatChangesetSummary', () => {
  it('formats npm updates without emoji by default', () => {
    expect(formatUpdate(npmBody, 'renovate/react-18.x')).toBe(
      'Update npm dependency `react` from `18.2.0` to `18.3.1`',
    )
  })

  it('formats Docker updates without emoji', () => {
    expect(formatUpdate(dockerBody, 'renovate/docker-node-22.x', {emoji: false})).toBe(
      'Update Docker image `node` from `22.7.0-alpine` to `22.8.0-alpine`',
    )
  })

  it('formats Docker updates with the established ecosystem emoji', () => {
    expect(formatUpdate(dockerBody, 'renovate/docker-node-22.x', {emoji: true})).toBe(
      '🐳 Update Docker image `node` from `22.7.0-alpine` to `22.8.0-alpine`',
    )
  })

  it('formats GitHub Actions updates with the established ecosystem emoji', () => {
    expect(formatUpdate(githubActionsBody, 'renovate/actions-checkout-4.x', {emoji: true})).toBe(
      '⚙️ Update GitHub Actions workflow dependency `actions/checkout` from `4.1.6` to `4.1.7`',
    )
  })

  it('formats security updates with security wording and emoji when enabled', () => {
    expect(
      formatUpdate(
        securityBody,
        'renovate/express-4.x',
        {emoji: true},
        'fix(deps): update dependency express to v4.19.2 [SECURITY]',
      ),
    ).toBe('🔒 Security update for npm dependency `express` from `4.18.2` to `4.19.2`')
  })

  it('formats grouped updates with every package name', () => {
    expect(formatUpdate(groupedBody, 'renovate/eslint-monorepo')).toBe(
      'Group update for npm dependencies: `eslint`, `prettier`',
    )
  })

  it('escapes markdown control characters only when rendering', () => {
    const summary = formatUpdate(markdownControlCharacterBody, 'renovate/evil-package-1.x')

    expect(summary).toContain(String.raw`evil\`package\``)
    expect(summary).toContain('Update npm dependency')
  })
})
