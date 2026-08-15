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
