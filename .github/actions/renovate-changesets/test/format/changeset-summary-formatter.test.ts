import {describe, expect, it} from 'vitest'
import {classifyRenovateUpdates} from '../../src/classify/renovate-classifier'
import {extractRenovateUpdates} from '../../src/extract/renovate-body-extractor'
import {formatChangesetSummary} from '../../src/format/changeset-summary-formatter'
import {
  dockerBody,
  githubActionsBody,
  groupedBody,
  markdownControlCharacterBody,
  mixedManagersBody,
  npmBody,
  securityBody,
  shaDigestBody,
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
  it('renders replacement updates with both package names', () => {
    const extracted = extractRenovateUpdates({
      prNumber: 3101,
      body: '| Package | Update | Change |\n|---|---|---|\n| [mocha](https://mochajs.org/) → [mochaNew](https://mochajs.org/) | replacement | [`6.2.3` → `6.2.4`](https://renovatebot.com/diffs/npm/mocha/6.2.3/6.2.4) |',
      branchName: 'renovate/mocha',
    })

    expect(formatChangesetSummary(classifyRenovateUpdates(extracted), extracted)).toBe(
      'Replace npm dependency `mocha` with `mochaNew`',
    )
  })

  it('formats lockfile maintenance by package manager', () => {
    const extracted = extractRenovateUpdates({
      prNumber: 3002,
      body: '| Update | Change |\n|---|---|\n| lockFileMaintenance | lock files refreshed |',
      branchName: 'renovate/lock-file-maintenance',
      changedFiles: ['pnpm-lock.yaml'],
    })

    expect(formatChangesetSummary(classifyRenovateUpdates(extracted), extracted)).toBe(
      'Refresh pnpm lockfile dependencies',
    )
    expect(
      formatChangesetSummary(classifyRenovateUpdates(extracted), extracted, {emoji: true}),
    ).toBe('📦 Refresh pnpm lockfile dependencies')
  })

  it('formats mixed manager groups in first-seen order', () => {
    expect(formatUpdate(mixedManagersBody, 'renovate/all-non-major')).toBe(
      'Group update across managers: npm dependencies: `@aws-sdk/client-iam`, `@aws-sdk/client-lightsail`, `@aws-sdk/client-s3`; GitHub Actions workflow dependency: `fro-bot/agent`',
    )
  })

  it('uses the row manager for a single action update', () => {
    expect(formatUpdate(githubActionsBody, 'renovate/npm-context')).toBe(
      'Update GitHub Actions workflow dependency `actions/checkout` from `4.1.6` to `4.1.7`',
    )
  })

  it('uses generic wording for an unknown row', () => {
    expect(
      formatUpdate(
        '| Package | Type | Change |\n|---|---|---|\n| package | mystery | `1.0.0` -> `1.0.1` |',
        'renovate/npm-context',
      ),
    ).toBe('Update dependency `package` from `1.0.0` to `1.0.1`')
  })

  it('uses across-manager wording for mixed security updates', () => {
    const securityMixedBody = mixedManagersBody.replace(
      'dependencies | minor',
      'dependencies | patch',
    )
    expect(
      formatUpdate(
        securityMixedBody,
        'renovate/all-non-major',
        {emoji: true},
        'fix(deps): security update [SECURITY]',
      ),
    ).toBe(
      '🔒 Security update across managers: npm dependencies: `@aws-sdk/client-iam`, `@aws-sdk/client-lightsail`, `@aws-sdk/client-s3`; GitHub Actions workflow dependency: `fro-bot/agent`',
    )
  })
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

  // Two 40-character SHAs are noise in a changelog, so a digest refresh names the package and
  // stops. This matches the suppression established by PR #1798.
  it('omits version text for a digest refresh', () => {
    expect(formatUpdate(shaDigestBody, 'renovate/actions-checkout')).toBe(
      'Update GitHub Actions workflow dependency `actions/checkout`',
    )
  })
})
