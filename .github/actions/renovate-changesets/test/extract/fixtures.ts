export const npmBody = `This PR contains the following updates:

| Package | Type | Update | Change |
|---|---|---|---|
| [react](https://github.com/facebook/react) | npm | minor | \`18.2.0\` -> \`18.3.1\` |

---

### Release Notes
`

export const dockerBody = `This PR contains the following updates:

| Package | Type | Update | Change |
|---|---|---|---|
| node | docker | minor | \`22.7.0-alpine\` -> \`22.8.0-alpine\` |

---
`

export const githubActionsBody = `This PR contains the following updates:

| Package | Type | Update | Change |
|---|---|---|---|
| actions/checkout | action | patch | \`v4.1.6\` -> \`v4.1.7\` |

---
`

export const customColumnBody = `This PR contains the following updates:

| Package | Age | Change | Confidence | Type | Update |
|---|---|---|---|---|---|
| [react](https://github.com/facebook/react) | 2 years | \`18.2.0\` -> \`18.3.1\` | high | npm | minor |

---
`

export const reorderedColumnBody = `This PR contains the following updates:

| Change | Update | Package | Type |
|---|---|---|---|
| \`18.2.0\` -> \`18.3.1\` | minor | react | npm |

---
`

export const groupedBody = `This PR contains the following updates:

| Package | Type | Update | Change |
|---|---|---|---|
| eslint | npm | major | \`8.57.0\` -> \`9.0.0\` |
| prettier | npm | major | \`3.2.5\` -> \`3.3.0\` |

---
`

export const securityBody = `This PR contains the following updates:

| Package | Type | Update | Change |
|---|---|---|---|
| [express](https://github.com/expressjs/express) | npm | patch | \`4.18.2\` -> \`4.19.2\` |

### Security

This update contains an important security fix.

---
`

export const mixedManagersBody = `This PR contains the following updates:

| Package | Change | Age | Confidence | OpenSSF | Code Search | Type | Update | Pending |
|---|---|---|---|---|---|---|---|---|
| @aws-sdk/client-iam | \`3.500.0\` -> \`3.501.0\` | 1 year | high | passing | passing | dependencies | minor | |
| @aws-sdk/client-lightsail | \`3.500.0\` -> \`3.501.0\` | 1 year | high | passing | passing | dependencies | minor | |
| @aws-sdk/client-s3 | \`3.500.0\` -> \`3.501.0\` | 1 year | high | passing | passing | dependencies | minor | |
| fro-bot/agent | \`v1.0.0\` -> \`v1.0.1\` | 1 year | high | passing | passing | action | patch | |

---
`

export const malformedRowBody = `This PR contains the following updates:

| Package | Type | Update | Change |
|---|---|---|---|
| react | npm | minor | \`18.2.0\` -> \`18.3.1\` |
| broken-package | npm | patch | not-a-version-transition |

---
`

export const missingTableBody = `This PR contains dependency updates, but the table was not rendered.

### Release Notes
`

export const missingPackageHeadingBody = `This PR contains the following updates:

| Type | Update | Change |
|---|---|---|
| npm | minor | \`18.2.0\` -> \`18.3.1\` |

---
`

export const markdownControlCharacterBody = `This PR contains the following updates:

| Package | Type | Update | Change |
|---|---|---|---|
| evil\`package\` | npm | patch | \`1.0.0\` -> \`1.0.1\` |

---
`

// Actions in this repo are pinned to commit SHAs, so Renovate opens digest-refresh PRs whose
// change cell holds two 40-character hexes rather than a version transition.
export const shaDigestBody = `This PR contains the following updates:

| Package | Type | Update | Change |
|---|---|---|---|
| actions/checkout | action | digest | \`3d3c42e5aac5ba805825da76410c181273ba90b1\` -> \`08c6903cd8c0fde910a37f88322edcfb5dd907a8\` |

---
`

// Underscores are legal in npm package names and must survive extraction unescaped, since the
// package name is matched against workspace package names downstream.
export const underscorePackageBody = `This PR contains the following updates:

| Package | Type | Update | Change |
|---|---|---|---|
| lint_staged | npm | major | \`16.4.0\` -> \`17.3.0\` |

---
`

export const calVerDockerBody = `This PR contains the following updates:

| Package | Type | Update | Change |
|---|---|---|---|
| myimage | docker | major | \`20240101\` -> \`20250101\` |
`

export const shortShaBody = `This PR contains the following updates:

| Package | Type | Update | Change |
|---|---|---|---|
| actions/checkout | action | digest | \`abc1234\` -> \`def5678\` |
`

export const mixedHexBody = `This PR contains the following updates:

| Package | Type | Update | Change |
|---|---|---|---|
| actions/checkout | action | digest | \`1234567\` -> \`89abcde\` |
`

// Captured from bfra-me/.github PR #2528 on July 31, 2026. Release Notes are intentionally trimmed
// after the first release entry; the real table, badge-heavy cells, warning callout, and surrounding
// Renovate structure are preserved so this remains a representative production fixture.
export const realRenovatePR2528Body = `This PR contains the following updates:

| Package | Change | [Age](https://docs.renovatebot.com/merge-confidence/) | [Confidence](https://docs.renovatebot.com/merge-confidence/) | OpenSSF | Code Search |
|---|---|---|---|---|---|
| [lint-staged](https://redirect.github.com/lint-staged/lint-staged) | [\`16.4.0\` → \`17.3.0\`](https://renovatebot.com/diffs/npm/lint-staged/16.4.0/17.3.0) | ![age](https://developer.mend.io/api/mc/badges/age/npm/lint-staged/17.3.0?slim=true) | ![confidence](https://developer.mend.io/api/mc/badges/confidence/npm/lint-staged/16.4.0/17.3.0?slim=true) | [![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/lint-staged/lint-staged/badge)](https://securityscorecards.dev/viewer/?uri=github.com/lint-staged/lint-staged) | [![GitHub Code Search for "lint-staged"](https://img.shields.io/badge/code_search-lint--staged-2671E5.svg?logo=github)](https://redirect.github.com/search?q=repo:bfra-me%2F.github+lint-staged) |

---

> [!WARNING]
> Some dependencies could not be looked up. Check the [Dependency Dashboard](../issues/7) for more information.

---

### Release Notes

<details>
<summary>lint-staged/lint-staged (lint-staged)</summary>

### [\`v17.3.0\`](https://redirect.github.com/lint-staged/lint-staged/blob/HEAD/CHANGELOG.md#1730)

##### Minor Changes

- It is now possible to run multiple tasks in parallel for a single glob by configuring it with an array of tasks.

</details>
`

// Captured from marcusrbrown/infra PR #1103 on August 15, 2026. This is the real body, including
// the linked package cell with source/changelog links, the OpenSSF badge, and Renovate metadata.
export const realInfraPR1103PostgresDigestBody = `This PR contains the following updates:

| Package | Update | Change | OpenSSF |
|---|---|---|---|
| [postgres](https://hub.docker.com/_/postgres) ([source](https://redirect.github.com/postgres/postgres), [changelog](https://www.postgresql.org/docs/release/)) | digest | \`cd17e2a\` → \`4006528\` | [![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/postgres/postgres/badge)](https://securityscorecards.dev/viewer/?uri=github.com/postgres/postgres) |

---

### Configuration

📅 **Schedule**: (in timezone America/Phoenix)

- Branch creation
  - At any time (no schedule defined)
- Automerge
  - At any time (no schedule defined)

🚦 **Automerge**: Disabled by config. Please merge this manually once you are satisfied.

♻ **Rebasing**: Whenever PR is behind base branch, or you tick the rebase/retry checkbox.

🔕 **Ignore**: Close this PR and you won't be reminded about this update again.

---

 - [ ] <!-- rebase-check -->If you want to rebase/retry this PR, check this box

---

This PR has been generated by [Mend Renovate CLI](https://redirect.github.com/renovatebot/renovate).
<!--renovate-debug:eyJjcmVhdGVkSW5WZXIiOiI0NC4zMC4wIiwidXBkYXRlZEluVmVyIjoiNDQuMzAuMCIsInRhcmdldEJyYW5jaCI6Im1haW4iLCJsYWJlbHMiOlsiYXV0b21lcmdlIiwiZGVwZW5kZW5jaWVzIiwiZGlnZXN0IiwicmVub3ZhdGUiXX0=-->
`

export const pureDigitDigestColumnBody = `This PR contains the following updates:

| Package | Update | Change | OpenSSF |
|---|---|---|---|
| [postgres](https://hub.docker.com/_/postgres) | digest | \`1234567\` → \`7654321\` | ![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/docker-library/postgres/badge) |
`
