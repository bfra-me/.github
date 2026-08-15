import {describe, expect, it} from 'vitest'
import {
  escapeForMarkdown,
  ExtractionError,
  extractRenovateUpdates,
} from '../../src/extract/renovate-body-extractor'
import {
  customColumnBody,
  dockerBody,
  githubActionsBody,
  groupedBody,
  malformedRowBody,
  markdownControlCharacterBody,
  missingPackageHeadingBody,
  missingTableBody,
  npmBody,
  reorderedColumnBody,
  securityBody,
  shaDigestBody,
  underscorePackageBody,
} from './fixtures'

describe('extractRenovateUpdates', () => {
  it('extracts an npm update with package, versions, and manager', () => {
    expect(
      extractRenovateUpdates({
        prNumber: 1001,
        body: npmBody,
        branchName: 'renovate/react-18.x',
      }),
    ).toEqual({
      prNumber: 1001,
      branchName: 'renovate/react-18.x',
      manager: 'npm',
      labels: [],
      updates: [
        {
          packageName: 'react',
          currentVersion: '18.2.0',
          newVersion: '18.3.1',
          manager: 'npm',
          isDigest: false,
        },
      ],
    })
  })

  // Every action in this repo is SHA-pinned, so digest refreshes are routine. The version pattern
  // is unanchored and matched stray digit runs inside a 40-char SHA, turning
  // `3d3c42e5...` -> `08c6903c...` into `1` -> `08`. SHAs must be matched first.
  it('extracts a commit SHA transition as a digest rather than a version', () => {
    const result = extractRenovateUpdates({
      prNumber: 1020,
      body: shaDigestBody,
      branchName: 'renovate/actions-checkout',
    })

    expect(result.updates[0]).toMatchObject({
      packageName: 'actions/checkout',
      currentVersion: '3d3c42e5aac5ba805825da76410c181273ba90b1',
      newVersion: '08c6903cd8c0fde910a37f88322edcfb5dd907a8',
      isDigest: true,
    })
  })

  it('resolves an extra custom column by heading text', () => {
    const result = extractRenovateUpdates({
      prNumber: 1002,
      body: customColumnBody,
      branchName: 'renovate/react-18.x',
    })

    expect(result.updates[0]).toMatchObject({
      packageName: 'react',
      currentVersion: '18.2.0',
      newVersion: '18.3.1',
    })
  })

  it('resolves reordered columns by heading text', () => {
    const result = extractRenovateUpdates({
      prNumber: 1003,
      body: reorderedColumnBody,
      branchName: 'renovate/react-18.x',
    })

    expect(result.updates[0]).toMatchObject({
      packageName: 'react',
      currentVersion: '18.2.0',
      newVersion: '18.3.1',
    })
  })

  it.each([
    ['Docker', dockerBody, 'renovate/docker-node-22.x', 'docker', 'node'],
    [
      'GitHub Actions',
      githubActionsBody,
      'renovate/actions-checkout-4.x',
      'github-actions',
      'actions/checkout',
    ],
  ] as const)(
    'extracts a %s update from its branch',
    (_label, body, branchName, manager, packageName) => {
      const result = extractRenovateUpdates({prNumber: 1004, body, branchName})

      expect(result.manager).toBe(manager)
      expect(result.updates[0]).toMatchObject({packageName, manager})
    },
  )

  it('extracts one update per row from a grouped body', () => {
    const result = extractRenovateUpdates({
      prNumber: 1005,
      body: groupedBody,
      branchName: 'renovate/eslint-monorepo',
    })

    expect(result.updates).toHaveLength(2)
    expect(result.updates.map(update => update.packageName)).toEqual(['eslint', 'prettier'])
  })

  it('passes raw security signals through without classifying them', () => {
    const result = extractRenovateUpdates({
      prNumber: 1006,
      body: securityBody,
      branchName: 'renovate/express-4.x',
      commitMessage: 'fix(deps): update dependency express to v4.19.2 [SECURITY]',
    })

    expect(result.commitMessage).toBe('fix(deps): update dependency express to v4.19.2 [SECURITY]')
    expect(result.labels).toEqual([])
  })

  it('fails closed when one row is malformed', () => {
    expect(() =>
      extractRenovateUpdates({
        prNumber: 1007,
        body: malformedRowBody,
        branchName: 'renovate/react-18.x',
      }),
    ).toThrowError(new ExtractionError('PR #1007 row 2 has no valid version transition'))
  })

  it('fails with the pull request number when no table is recognizable', () => {
    expect(() =>
      extractRenovateUpdates({
        prNumber: 1008,
        body: missingTableBody,
        branchName: 'renovate/react-18.x',
      }),
    ).toThrow('PR #1008')
  })

  it('fails closed when an expected heading is absent', () => {
    expect(() =>
      extractRenovateUpdates({
        prNumber: 1013,
        body: missingPackageHeadingBody,
        branchName: 'renovate/react-18.x',
      }),
    ).toThrow('requires Package and Change headings')
  })

  it('does not expose body text, token values, or environment values in diagnostics', () => {
    const body = `${missingTableBody}\nsecret-token-123\nGITHUB_TOKEN=do-not-log-this`

    expect(() =>
      extractRenovateUpdates({
        prNumber: 1009,
        body,
        branchName: 'renovate/react-18.x',
      }),
    ).toThrowError(
      expect.objectContaining({
        message: expect.not.stringMatching(
          /secret-token-123|GITHUB_TOKEN|do-not-log-this|Release Notes/,
        ),
      }),
    )
  })

  it('preserves package identifiers verbatim instead of escaping them', () => {
    const result = extractRenovateUpdates({
      prNumber: 1010,
      body: markdownControlCharacterBody,
      branchName: 'renovate/evil-package-1.x',
    })

    // Extraction validates but does not escape: the package name is an identifier that gets matched
    // against workspace package names downstream. Escaping here would corrupt that match.
    expect(result.updates[0]?.packageName).toBe('evil`package`')
  })

  it('leaves underscores in package identifiers intact', () => {
    const result = extractRenovateUpdates({
      prNumber: 1011,
      body: underscorePackageBody,
      branchName: 'renovate/lint-staged-17.x',
    })

    expect(result.updates[0]?.packageName).toBe('lint_staged')
  })

  it('escapes markdown control characters only at render time', () => {
    expect(escapeForMarkdown('evil`package`')).toBe('evil\\`package\\`')
    expect(escapeForMarkdown('lint_staged')).toBe(String.raw`lint\_staged`)
    expect(escapeForMarkdown('@scope/pkg')).toBe('@scope/pkg')
  })
})
