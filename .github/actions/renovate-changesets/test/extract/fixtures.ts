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
