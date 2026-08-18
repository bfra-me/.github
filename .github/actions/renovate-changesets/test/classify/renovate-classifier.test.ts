import type {
  ExtractedRenovateUpdates,
  ExtractedUpdate,
} from '../../src/extract/renovate-body-extractor'
import {describe, expect, it} from 'vitest'
import {classifyRenovateUpdates} from '../../src/classify/renovate-classifier'
import {extractRenovateUpdates} from '../../src/extract/renovate-body-extractor'
import {formatChangesetSummary} from '../../src/format/changeset-summary-formatter'
import {
  githubActionsBody,
  groupedBody,
  npmBody,
  realInfraPR1103PostgresDigestBody,
  realRenovatePR2528Body,
  securityBody,
  underscorePackageBody,
} from '../extract/fixtures'

function createExtractedUpdate(
  currentVersion: string,
  newVersion: string,
  packageName = 'example',
  isDigest = false,
): ExtractedUpdate {
  return {packageName, currentVersion, newVersion, manager: 'npm', isDigest}
}

function createExtractedUpdates(
  updates: ExtractedUpdate[],
  signals: Pick<ExtractedRenovateUpdates, 'branchName' | 'commitMessage' | 'labels'> = {
    branchName: 'renovate/example-1.x',
    labels: [],
  },
): ExtractedRenovateUpdates {
  return {
    prNumber: 2000,
    branchName: signals.branchName,
    manager: 'npm',
    ...(signals.commitMessage == null ? {} : {commitMessage: signals.commitMessage}),
    labels: signals.labels,
    updates,
  }
}

describe('classifyRenovateUpdates', () => {
  it('classifies lockfile maintenance as a non-security patch', () => {
    const extracted = {
      ...createExtractedUpdates([]),
      operation: {kind: 'lockfile-maintenance' as const, packageManagers: ['pnpm' as const]},
    }

    expect(classifyRenovateUpdates(extracted)).toEqual({
      bumpType: 'patch',
      updateCategory: 'patch',
      isSecurityUpdate: false,
    })
  })

  it('classifies a patch transition as a patch bump', () => {
    const extracted = extractRenovateUpdates({
      prNumber: 2001,
      body: githubActionsBody,
      branchName: 'renovate/actions-checkout-4.x',
    })

    expect(classifyRenovateUpdates(extracted)).toMatchObject({
      bumpType: 'patch',
      updateCategory: 'patch',
      isSecurityUpdate: false,
    })
  })

  it('classifies replacement as a patch bump', () => {
    const extracted = extractRenovateUpdates({
      prNumber: 2592,
      body: '| Package | Update | Change |\n|---|---|---|\n| [mocha](https://mochajs.org/) → [mochaNew](https://mochajs.org/) | replacement | [`6.2.3` → `6.2.4`](https://renovatebot.com/diffs/npm/mocha/6.2.3/6.2.4) |',
      branchName: 'renovate/mocha',
    })

    expect(classifyRenovateUpdates(extracted).bumpType).toBe('patch')
  })

  it('classifies rollback as a patch bump', () => {
    // Constructed: the Update cell is the load-bearing rollback signal.
    const extracted = extractRenovateUpdates({
      prNumber: 2593,
      body: '| Package | Update | Change |\n|---|---|---|\n| package | rollback | `1.2.3` -> `1.2.2` |',
      branchName: 'renovate/package',
    })

    expect(classifyRenovateUpdates(extracted).bumpType).toBe('patch')
  })

  it('classifies pinDigest as a patch bump', () => {
    // Constructed: the Update cell is the load-bearing pinDigest signal.
    const extracted = extractRenovateUpdates({
      prNumber: 2594,
      body: '| Package | Update | Change |\n|---|---|---|\n| package | pinDigest | `v4` -> `v4@sha256:abc123` |',
      branchName: 'renovate/package',
    })

    expect(classifyRenovateUpdates(extracted).bumpType).toBe('patch')
  })

  it('classifies bump ranges by their underlying versions', () => {
    // Constructed: the Update cell is the load-bearing bump signal.
    const extracted = extractRenovateUpdates({
      prNumber: 2596,
      body: '| Package | Update | Change |\n|---|---|---|\n| package | bump | `^1.0.0` -> `^1.1.0` |',
      branchName: 'renovate/package',
    })

    expect(classifyRenovateUpdates(extracted).bumpType).toBe('minor')
  })

  it('classifies a major transition as a major bump', () => {
    const extracted = extractRenovateUpdates({
      prNumber: 2002,
      body: underscorePackageBody,
      branchName: 'renovate/lint-staged-17.x',
    })

    expect(classifyRenovateUpdates(extracted).bumpType).toBe('major')
  })

  it('takes the highest bump across patch and minor grouped updates', () => {
    const extracted = createExtractedUpdates([
      createExtractedUpdate('1.0.0', '1.0.1', 'patch-package'),
      createExtractedUpdate('1.0.0', '1.1.0', 'minor-package'),
    ])

    expect(classifyRenovateUpdates(extracted).bumpType).toBe('minor')
  })

  it('takes the highest bump across minor and major grouped updates', () => {
    const extracted = createExtractedUpdates([
      createExtractedUpdate('1.0.0', '1.1.0', 'minor-package'),
      createExtractedUpdate('1.0.0', '2.0.0', 'major-package'),
    ])

    expect(classifyRenovateUpdates(extracted).bumpType).toBe('major')
  })

  it('handles a non-semver transition conservatively without throwing', () => {
    const extracted = createExtractedUpdates([createExtractedUpdate('latest', 'stable')])

    expect(() => classifyRenovateUpdates(extracted)).not.toThrow()
    expect(classifyRenovateUpdates(extracted).bumpType).toBe('major')
  })

  it('classifies a prerelease progression as a patch bump', () => {
    const extracted = createExtractedUpdates([
      createExtractedUpdate('1.0.0-beta.1', '1.0.0-beta.2'),
    ])

    expect(classifyRenovateUpdates(extracted).bumpType).toBe('patch')
  })

  it('classifies a prerelease to stable release of the same core version as a patch bump', () => {
    const extracted = createExtractedUpdates([createExtractedUpdate('1.0.0-rc.1', '1.0.0')])

    expect(classifyRenovateUpdates(extracted).bumpType).toBe('patch')
  })

  it('treats a prerelease rollback as a conservative major bump', () => {
    const extracted = createExtractedUpdates([
      createExtractedUpdate('1.0.0-beta.2', '1.0.0-beta.1'),
    ])

    expect(classifyRenovateUpdates(extracted).bumpType).toBe('major')
  })

  it('classifies a vulnerability branch topic as security', () => {
    const extracted = extractRenovateUpdates({
      prNumber: 2003,
      body: securityBody,
      branchName: 'renovate/vulnerability-express-4.x',
    })

    expect(classifyRenovateUpdates(extracted)).toMatchObject({
      isSecurityUpdate: true,
      updateCategory: 'security',
    })
  })

  it('classifies the documented security commit suffix as security', () => {
    const extracted = extractRenovateUpdates({
      prNumber: 2004,
      body: npmBody,
      branchName: 'renovate/react-18.x',
      commitMessage: 'chore(deps): update dependency react to v18.3.1 [SECURITY]',
    })

    expect(classifyRenovateUpdates(extracted).isSecurityUpdate).toBe(true)
  })

  // `vulnerabilityAlerts.labels` is user-configured, so the applied label text varies by repo.
  // Match the conventional values rather than the name of the config option that sets them.
  it.each(['security', 'Security', 'vulnerability'])(
    'classifies the %s label as security',
    label => {
      const extracted = extractRenovateUpdates({
        prNumber: 2005,
        body: npmBody,
        branchName: 'renovate/react-18.x',
        labels: [label],
      })

      expect(classifyRenovateUpdates(extracted).isSecurityUpdate).toBe(true)
    },
  )

  it('classifies a whitespace-padded security label as security', () => {
    const extracted = extractRenovateUpdates({
      prNumber: 2008,
      body: npmBody,
      branchName: 'renovate/react-18.x',
      labels: [' security '],
    })

    expect(classifyRenovateUpdates(extracted).isSecurityUpdate).toBe(true)
  })

  it('does not treat the vulnerabilityAlerts config option name as a label', () => {
    const extracted = extractRenovateUpdates({
      prNumber: 2005,
      body: npmBody,
      branchName: 'renovate/react-18.x',
      labels: ['dependencies'],
    })

    expect(classifyRenovateUpdates(extracted).isSecurityUpdate).toBe(false)
  })

  it('does not classify a routine update from critical wording in body prose', () => {
    const extracted = extractRenovateUpdates({
      prNumber: 2006,
      body: `${npmBody}\nThe release notes mention a critical performance improvement.`,
      branchName: 'renovate/react-18.x',
    })

    expect(classifyRenovateUpdates(extracted).isSecurityUpdate).toBe(false)
  })

  it('classifies grouped fixture updates without using body grouping prose', () => {
    const extracted = extractRenovateUpdates({
      prNumber: 2007,
      body: groupedBody,
      branchName: 'renovate/eslint-monorepo',
    })

    expect(classifyRenovateUpdates(extracted).bumpType).toBe('major')
  })

  // Docker tags and GitHub Actions pins are not strict semver. Treating them as unparseable made
  // every Docker tag refresh and every Action pin bump a major release.
  it.each([
    ['22.04', '22.10', 'minor'],
    ['22.04', '24.04', 'major'],
    ['3.19', '3.20', 'minor'],
    ['3.19', '3.19', 'patch'],
  ] as const)('classifies two-component Docker tag %s -> %s as %s', (from, to, expected) => {
    expect(
      classifyRenovateUpdates(createExtractedUpdates([createExtractedUpdate(from, to)])).bumpType,
    ).toBe(expected)
  })

  it.each([
    ['4', '5', 'major'],
    ['4', '4', 'patch'],
  ] as const)('classifies single-component Action pin %s -> %s as %s', (from, to, expected) => {
    expect(
      classifyRenovateUpdates(createExtractedUpdates([createExtractedUpdate(from, to)])).bumpType,
    ).toBe(expected)
  })

  it('still treats a genuinely unparseable version as major', () => {
    expect(
      classifyRenovateUpdates(createExtractedUpdates([createExtractedUpdate('latest', 'stable')]))
        .bumpType,
    ).toBe('major')
  })

  // A digest refresh repins the same reference. Without this, SHAs fall through to version parsing,
  // fail to parse, and classify as major — so every SHA-pinned action bump would publish a major.
  it('classifies a digest refresh as a patch', () => {
    const update = createExtractedUpdate(
      '3d3c42e5aac5ba805825da76410c181273ba90b1',
      '08c6903cd8c0fde910a37f88322edcfb5dd907a8',
      'actions/checkout',
      true,
    )

    expect(classifyRenovateUpdates(createExtractedUpdates([update])).bumpType).toBe('patch')
  })

  it('runs the real PR #2528 body through extraction, classification, and formatting', () => {
    const extracted = extractRenovateUpdates({
      prNumber: 2528,
      body: realRenovatePR2528Body,
      branchName: 'renovate/lint-staged-17.x',
    })
    const classification = classifyRenovateUpdates(extracted)

    expect(extracted).toMatchObject({manager: 'npm', updates: [{isDigest: false}]})
    expect(extracted.updates[0]).toMatchObject({
      packageName: 'lint-staged',
      currentVersion: '16.4.0',
      newVersion: '17.3.0',
    })
    expect(classification).toEqual({
      bumpType: 'major',
      updateCategory: 'major',
      isSecurityUpdate: false,
    })
    expect(formatChangesetSummary(classification, extracted)).toBe(
      'Update npm dependency `lint-staged` from `16.4.0` to `17.3.0`',
    )
  })

  it('runs the live #1103 Docker digest body through extraction, classification, and formatting', () => {
    const extracted = extractRenovateUpdates({
      prNumber: 1103,
      body: realInfraPR1103PostgresDigestBody,
      branchName: 'renovate/docker-postgres',
      manager: 'docker-compose',
    })
    const classification = classifyRenovateUpdates(extracted)

    expect(classification).toEqual({
      bumpType: 'patch',
      updateCategory: 'patch',
      isSecurityUpdate: false,
    })
    expect(formatChangesetSummary(classification, extracted)).toBe('Update Docker image `postgres`')
  })

  it.each([
    ['20240101', '20250101', 'major'],
    ['1234567', '7654321', 'major'],
    ['22.04', '22.10', 'minor'],
    ['4', '5', 'major'],
    ['16.4.0', '17.3.0', 'major'],
  ] as const)(
    'classifies extracted version transition %s -> %s as %s',
    (currentVersion, newVersion, expected) => {
      const extracted = extractRenovateUpdates({
        prNumber: 1027,
        body: `| Package | Change |\n|---|---|\n| package | \`${currentVersion}\` -> \`${newVersion}\` |`,
        branchName: currentVersion === '22.04' ? 'renovate/docker-package' : 'renovate/package',
      })

      expect(extracted.updates[0]?.isDigest).toBe(false)
      expect(classifyRenovateUpdates(extracted).bumpType).toBe(expected)
    },
  )
})
