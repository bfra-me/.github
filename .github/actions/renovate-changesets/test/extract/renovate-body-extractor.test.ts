import {describe, expect, it} from 'vitest'
import {
  escapeForMarkdown,
  ExtractionError,
  extractRenovateUpdates,
  MalformedDependencyTableError,
  NoPackageTableError,
} from '../../src/extract/renovate-body-extractor'
import {
  calVerDockerBody,
  customColumnBody,
  dockerBody,
  githubActionsBody,
  groupedBody,
  malformedRowBody,
  markdownControlCharacterBody,
  missingPackageHeadingBody,
  missingTableBody,
  mixedHexBody,
  mixedManagersBody,
  npmBody,
  pureDigitDigestColumnBody,
  realInfraPR1103PostgresDigestBody,
  reorderedColumnBody,
  securityBody,
  shaDigestBody,
  shortShaBody,
  underscorePackageBody,
} from './fixtures'

describe('extractRenovateUpdates', () => {
  const rowBody = (packageCell: string, update: string, change: string): string =>
    `| Package | Update | Change |\n|---|---|---|\n| ${packageCell} | ${update} | ${change} |`

  it('extracts the canonical pin row unchanged', () => {
    const result = extractRenovateUpdates({
      prNumber: 2591,
      body: '| Package | Update | Change |\n|---|---|---|\n| [koa](https://github.com/koajs/koa) | pin | [`^1.7.0` → `1.7.0`](https://renovatebot.com/diffs/npm/koa/1.7.0/1.7.0) |',
      branchName: 'renovate/koa',
    })

    expect(result.updates[0]).toMatchObject({
      packageName: 'koa',
      currentVersion: '1.7.0',
      newVersion: '1.7.0',
      isDigest: false,
    })
  })

  it('extracts both sides of a replacement row', () => {
    const result = extractRenovateUpdates({
      prNumber: 2592,
      body: '| Package | Update | Change |\n|---|---|---|\n| [mocha](https://mochajs.org/) → [mochaNew](https://mochajs.org/) | replacement | [`6.2.3` → `6.2.4`](https://renovatebot.com/diffs/npm/mocha/6.2.3/6.2.4) |',
      branchName: 'renovate/mocha',
    })

    expect(result.updates[0]).toMatchObject({
      packageName: 'mochaNew',
      replacedPackageName: 'mocha',
      currentVersion: '6.2.3',
      newVersion: '6.2.4',
    })
  })

  it('extracts a rollback transition', () => {
    // Constructed: Renovate's Update cell is the load-bearing signal; the Change shape is not public-verbatim here.
    const result = extractRenovateUpdates({
      prNumber: 2593,
      body: rowBody('package', 'rollback', '`1.2.3` -> `1.2.2`'),
      branchName: 'renovate/package',
    })

    expect(result.updates[0]).toMatchObject({currentVersion: '1.2.3', newVersion: '1.2.2'})
  })

  it('marks pinDigest as a digest from the Update cell', () => {
    // Constructed: no public verbatim pinDigest row was available; Update is the load-bearing signal.
    const result = extractRenovateUpdates({
      prNumber: 2594,
      body: rowBody('package', 'pinDigest', '`v4` -> `v4@sha256:abc123`'),
      branchName: 'renovate/package',
    })

    expect(result.updates[0]).toMatchObject({currentVersion: '4', newVersion: '4'})
  })

  it('marks pinDigest as a digest for a bare-SHA Change cell', () => {
    // Constructed: no public verbatim pinDigest row was available; this proves Change shape is irrelevant.
    const result = extractRenovateUpdates({
      prNumber: 2595,
      body: rowBody('package', 'pinDigest', '`abc1234` -> `def5678`'),
      branchName: 'renovate/package',
    })

    expect(result.updates[0]?.isDigest).toBe(true)
  })

  it('extracts a bump range transition', () => {
    // Constructed: Renovate's Update cell is the load-bearing signal; the Change shape is not public-verbatim here.
    const result = extractRenovateUpdates({
      prNumber: 2596,
      body: rowBody('package', 'bump', '`^1.0.0` -> `^1.1.0`'),
      branchName: 'renovate/package',
    })

    expect(result.updates[0]).toMatchObject({currentVersion: '1.0.0', newVersion: '1.1.0'})
  })

  it('extracts the canonical digest row', () => {
    const result = extractRenovateUpdates({
      prNumber: 2597,
      body: '| Package | Type | Update | Change |\n|---|---|---|---|\n|[actions/setup-go](https://redirect.github.com/actions/setup-go) |action |digest |`0aaccfd` -> `d35c59a` |',
      branchName: 'renovate/actions-setup-go',
    })

    expect(result.updates[0]?.isDigest).toBe(true)
  })

  it('falls through to version parsing for an unrecognized Update value', () => {
    const result = extractRenovateUpdates({
      prNumber: 2598,
      body: rowBody('package', 'futureUpdateType', '`1.0.0` -> `1.1.0`'),
      branchName: 'renovate/package',
    })

    expect(result.updates[0]).toMatchObject({currentVersion: '1.0.0', newVersion: '1.1.0'})
  })

  const lockfileMaintenanceBody = `This PR contains the following updates:

| Update | Change |
|---|---|
| lockFileMaintenance | All lock files updated (every Monday before 3 AM) |

---

> [!WARNING]
> Some dependencies could not be looked up. Check the [Dependency Dashboard](../issues/7) for more information.

🔧 This Pull Request updates lock files to use the latest dependency versions.

---

### Configuration

📅 **Schedule**: (in timezone America/Phoenix)

- Branch creation
  - "before 3am on Monday"
- Automerge
  - At any time (no schedule defined)

🚦 **Automerge**: Enabled.

♻ **Rebasing**: Whenever PR is behind base branch, or you tick the rebase/retry checkbox.

👻 **Immortal**: This PR will be recreated if closed unmerged. Get [config help](https://redirect.github.com/renovatebot/renovate/discussions) if that's undesired.

---

  - [ ] <!-- rebase-check -->If you want to rebase/retry this PR, check this box

---

This PR has been generated by [Mend Renovate CLI](https://redirect.github.com/renovatebot/renovate).
<!--renovate-debug:eyJjcmVhdGVkSW5WZXIiOiI0NC4zMC4wIiwidXBkYXRlZEluVmVyIjoiNDQuMzAuMCIsInRhcmdldEJyYW5jaCI6Im1haW4iLCJsYWJlbHMiOlsiYXV0b21lcmdlIiwiZGVwZW5kZW5jaWVzIiwiamF2YXNjcmlwdCIsImxvY2tGaWxlTWFpbnRlbmFuY2UiLCJyZW5vdmF0ZSIsInNjaGVkdWxlZCJdfQ==-->`

  it('recognizes lockfile maintenance and records its package manager', () => {
    const result = extractRenovateUpdates({
      prNumber: 2585,
      body: lockfileMaintenanceBody,
      branchName: 'renovate/lock-file-maintenance',
      changedFiles: ['pnpm-lock.yaml', '.github/actions/renovate-changesets/dist/index.js'],
    })

    expect(result).toMatchObject({
      manager: 'npm',
      updates: [],
      operation: {kind: 'lockfile-maintenance', packageManagers: ['pnpm']},
    })
  })

  it('rejects lockfile maintenance without a matching changed lockfile', () => {
    expect(() =>
      extractRenovateUpdates({
        prNumber: 2585,
        body: lockfileMaintenanceBody,
        branchName: 'renovate/lock-file-maintenance',
        changedFiles: ['dist/index.js'],
      }),
    ).toThrowError(MalformedDependencyTableError)
  })

  it('distinguishes a body with no table from a malformed dependency table', () => {
    expect(() =>
      extractRenovateUpdates({
        prNumber: 2586,
        body: 'No tables here.',
        branchName: 'renovate/example',
      }),
    ).toThrowError(NoPackageTableError)
  })

  it('rejects a Package table that lacks a Change heading', () => {
    expect(() =>
      extractRenovateUpdates({
        prNumber: 2587,
        body: '| Package | Update |\n|---|---|\n| example | minor |',
        branchName: 'renovate/example',
      }),
    ).toThrowError(MalformedDependencyTableError)
  })

  it('rejects an unrelated Update and Change table as having no package table', () => {
    expect(() =>
      extractRenovateUpdates({
        prNumber: 2588,
        body: '| Update | Change |\n|---|---|\n| digest | `a` -> `b` |',
        branchName: 'renovate/example',
      }),
    ).toThrowError(NoPackageTableError)
  })

  it('scans past an unrelated leading table to find the dependency table', () => {
    const result = extractRenovateUpdates({
      prNumber: 2589,
      body: '| Update | Change |\n|---|---|\n| metadata | unchanged |\n\n| Package | Change |\n|---|---|\n| example | `1.0.0` -> `1.0.1` |',
      branchName: 'renovate/example',
    })

    expect(result.updates[0]?.packageName).toBe('example')
  })

  it('uses the Type heading from a nine-column Renovate table for each row', () => {
    const result = extractRenovateUpdates({
      prNumber: 1119,
      body: mixedManagersBody,
      branchName: 'renovate/all-non-major',
      manager: 'npm',
    })

    expect(result.updates.map(update => update.manager)).toEqual([
      'npm',
      'npm',
      'npm',
      'github-actions',
    ])
    expect(result.manager).toBe('mixed')
  })

  it('uses one supported manager from changed files when Type is absent', () => {
    const result = extractRenovateUpdates({
      prNumber: 1119,
      body: dockerBody,
      branchName: 'renovate/something',
      manager: 'npm',
      changedFiles: ['Dockerfile'],
    })

    expect(result.manager).toBe('docker')
    expect(result.updates[0]?.manager).toBe('docker')
  })

  it('uses unknown rows when changed files span multiple ecosystems and Type is absent', () => {
    const result = extractRenovateUpdates({
      prNumber: 1119,
      body: '| Package | Update | Change |\n|---|---|---|\n| package | minor | `1.0.0` -> `1.1.0` |',
      branchName: 'renovate/something',
      manager: 'npm',
      changedFiles: ['package.json', '.github/workflows/ci.yaml'],
    })

    expect(result.manager).toBe('unknown')
    expect(result.updates[0]?.manager).toBe('unknown')
  })

  it('does not use the fallback manager for an unknown Type cell', () => {
    const result = extractRenovateUpdates({
      prNumber: 1119,
      body: '| Package | Type | Change |\n|---|---|---|\n| package | mystery | `1.0.0` -> `1.0.1` |',
      branchName: 'renovate/something',
      manager: 'npm',
    })

    expect(result.manager).toBe('unknown')
    expect(result.updates[0]?.manager).toBe('unknown')
  })
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

  it('extracts a pure-digit CalVer transition as a version rather than a digest', () => {
    const result = extractRenovateUpdates({
      prNumber: 1021,
      body: calVerDockerBody,
      branchName: 'renovate/docker-myimage',
    })

    expect(result.updates[0]).toMatchObject({
      currentVersion: '20240101',
      newVersion: '20250101',
      isDigest: false,
    })
  })

  it('extracts a short hexadecimal SHA containing letters as a digest', () => {
    const result = extractRenovateUpdates({
      prNumber: 1022,
      body: shortShaBody,
      branchName: 'renovate/actions-checkout',
    })

    expect(result.updates[0]).toMatchObject({
      currentVersion: 'abc1234',
      newVersion: 'def5678',
      isDigest: true,
    })
  })

  it('classifies a mixed pure-digit and lettered hex transition as a digest', () => {
    const result = extractRenovateUpdates({
      prNumber: 1023,
      body: mixedHexBody,
      branchName: 'renovate/actions-checkout',
    })

    expect(result.updates[0]).toMatchObject({
      currentVersion: '1234567',
      newVersion: '89abcde',
      isDigest: true,
    })
  })

  it('extracts the live #1103 short-SHA Docker digest transition', () => {
    const result = extractRenovateUpdates({
      prNumber: 1103,
      body: realInfraPR1103PostgresDigestBody,
      branchName: 'renovate/docker-postgres',
    })

    expect(result.updates[0]).toMatchObject({
      packageName: 'postgres',
      currentVersion: 'cd17e2a',
      newVersion: '4006528',
      isDigest: true,
    })
  })

  it.each([
    ['[postgres](url) ([source](url), [changelog](url))', 'postgres'],
    ['[lint-staged](url)', 'lint-staged'],
    ['[@changesets/cli](url) ([source](url))', '@changesets/cli'],
    ['postgres', 'postgres'],
    ['[actions/checkout](url)', 'actions/checkout'],
  ])('extracts the first link text from package cell %s', (packageCell, expectedPackage) => {
    const result = extractRenovateUpdates({
      prNumber: 1029,
      body: `| Package | Change |\n|---|---|\n| ${packageCell} | \`1.0.0\` -> \`1.0.1\` |`,
      branchName: 'renovate/package',
    })

    expect(result.updates[0]?.packageName).toBe(expectedPackage)
  })

  it.each([
    ['docker-compose', 'docker'],
    ['dockerfile', 'docker'],
    ['pnpm', 'npm'],
    ['lockfile', 'npm'],
    ['github-actions', 'github-actions'],
  ] as const)('maps supplied manager %s to %s', (manager, expectedManager) => {
    const result = extractRenovateUpdates({
      prNumber: 1030,
      body: '| Package | Update | Change |\n|---|---|---|\n| package | minor | `1.0.0` -> `1.1.0` |',
      branchName: 'renovate/some-package',
      manager,
    })

    expect(result.manager).toBe(expectedManager)
  })

  it('lets the Update heading mark an all-digit transition as a digest', () => {
    const result = extractRenovateUpdates({
      prNumber: 1024,
      body: pureDigitDigestColumnBody,
      branchName: 'renovate/docker-postgres',
    })

    expect(result.updates[0]).toMatchObject({
      currentVersion: '1234567',
      newVersion: '7654321',
      isDigest: true,
    })
  })

  it('does not apply the hex fallback when Update explicitly identifies a version update', () => {
    expect(() =>
      extractRenovateUpdates({
        prNumber: 1028,
        body: `| Package | Update | Change |\n|---|---|---|\n| package | major | \`cd17e2a\` -> \`4006528\` |`,
        branchName: 'renovate/package',
      }),
    ).toThrow('PR #1028 row 1 has no valid version transition')
  })

  it.each([
    ['cd17e2a', '4006528'],
    ['4006528', 'cd17e2a'],
    ['cd17e2a', 'bd06528'],
    ['3d3c42e5aac5ba805825da76410c181273ba90b1', '08c6903cd8c0fde910a37f88322edcfb5dd907a8'],
  ])('uses the hex fallback for %s -> %s', (currentVersion, newVersion) => {
    const result = extractRenovateUpdates({
      prNumber: 1025,
      body: `| Package | Change |\n|---|---|\n| package | \`${currentVersion}\` -> \`${newVersion}\` |`,
      branchName: 'renovate/docker-package',
    })

    expect(result.updates[0]?.isDigest).toBe(true)
  })

  it('keeps an all-digit transition as a version when no Update heading disambiguates it', () => {
    const result = extractRenovateUpdates({
      prNumber: 1026,
      body: '| Package | Change |\n|---|---|\n| package | `1234567` -> `7654321` |',
      branchName: 'renovate/docker-package',
    })

    expect(result.updates[0]).toMatchObject({
      currentVersion: '1234567',
      newVersion: '7654321',
      isDigest: false,
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
