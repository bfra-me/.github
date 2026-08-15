import {describe, expect, it} from 'vitest'
import {ExtractionError, extractRenovateUpdates} from '../../src/extract/renovate-body-extractor'
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
      isSecurityUpdate: false,
      updates: [
        {
          packageName: 'react',
          currentVersion: '18.2.0',
          newVersion: '18.3.1',
          manager: 'npm',
        },
      ],
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

  it('marks security metadata from the commit message without trusting body prose', () => {
    const result = extractRenovateUpdates({
      prNumber: 1006,
      body: securityBody,
      branchName: 'renovate/express-4.x',
      commitMessage: 'fix(deps): update dependency express to v4.19.2 [SECURITY]',
    })

    expect(result.isSecurityUpdate).toBe(true)
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

  it('escapes markdown control characters at the extraction boundary', () => {
    const result = extractRenovateUpdates({
      prNumber: 1010,
      body: markdownControlCharacterBody,
      branchName: 'renovate/evil-package-1.x',
    })

    expect(result.updates[0]?.packageName).toBe('evil\\`package\\`')
  })
})
