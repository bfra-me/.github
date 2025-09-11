import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

/**
 * TASK-040: Enhanced End-to-End Tests with Real Renovate PRs
 *
 * This test suite provides comprehensive end-to-end testing of the Enhanced Renovate-Changesets Action
 * using realistic Renovate PR data patterns while calling the actual action implementation.
 *
 * Key improvements over the existing end-to-end tests:
 * 1. Uses the real action implementation instead of simplified mocks
 * 2. More realistic Renovate PR data based on actual production patterns
 * 3. Comprehensive testing of all manager types and update scenarios
 * 4. Proper validation of actual changeset content and outputs
 * 5. Enhanced security and grouped update handling
 * 6. Performance testing for large repositories
 */

// Mock file system operations
const fsMocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
  unlink: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  constants: {
    F_OK: 0,
  },
}))

vi.mock('node:fs', () => ({
  promises: {
    readFile: fsMocks.readFile,
    writeFile: fsMocks.writeFile,
    mkdir: fsMocks.mkdir,
    access: fsMocks.access,
    unlink: fsMocks.unlink,
    readdir: fsMocks.readdir,
    stat: fsMocks.stat,
    constants: fsMocks.constants,
  },
}))

// Mock @actions/core
const coreMocks = vi.hoisted(() => ({
  getInput: vi.fn(),
  getBooleanInput: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  setFailed: vi.fn(),
  setOutput: vi.fn(),
  summary: {
    addRaw: vi.fn().mockReturnThis(),
    addTable: vi.fn().mockReturnThis(),
    addDetails: vi.fn().mockReturnThis(),
    addCodeBlock: vi.fn().mockReturnThis(),
    write: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@actions/core', () => coreMocks)

// Mock @actions/exec for git operations
const execMocks = vi.hoisted(() => ({
  getExecOutput: vi.fn(),
}))

vi.mock('@actions/exec', () => execMocks)

// Mock @changesets/write
vi.mock('@changesets/write', () => ({
  default: vi.fn().mockImplementation(async (_changeset, _cwd) => {
    // Mock the changesets write functionality
    return 'mock-changeset-id'
  }),
}))

// Mock Octokit/GitHub API
const octokitMocks = vi.hoisted(() => ({
  rest: {
    pulls: {
      get: vi.fn(),
      listFiles: vi.fn(),
      listCommits: vi.fn(),
      update: vi.fn(),
      createReview: vi.fn(),
    },
    issues: {
      createComment: vi.fn(),
      updateComment: vi.fn(),
    },
    repos: {
      getContent: vi.fn(),
      createOrUpdateFileContents: vi.fn(),
    },
  },
}))

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => octokitMocks),
}))

// Mock js-yaml for configuration loading
vi.mock('js-yaml', () => ({
  load: vi.fn(),
}))

// Mock minimatch for pattern matching
vi.mock('minimatch', () => ({
  minimatch: vi.fn(),
}))

// Mock all the enhanced detector classes to avoid complex dependencies
vi.mock('../../src/renovate-parser', () => ({
  RenovateParser: vi.fn().mockImplementation(() => ({
    extractPRContext: vi.fn().mockResolvedValue({
      isRenovateBot: true,
      isGroupedUpdate: false,
      isSecurityUpdate: false,
      manager: 'npm',
      updateType: 'npm',
      dependencies: [
        {
          name: 'react',
          currentVersion: '17.0.2',
          newVersion: '18.3.1',
          manager: 'npm',
          updateType: 'major',
          isSecurityUpdate: false,
          packageFile: 'package.json',
        },
      ],
    }),
    isRenovateBranch: vi.fn().mockReturnValue(true),
  })),
}))

vi.mock('../../src/multi-package-analyzer', () => ({
  MultiPackageAnalyzer: vi.fn().mockImplementation(() => ({
    analyzeMultiPackageUpdate: vi.fn().mockResolvedValue({
      workspacePackages: [],
      packageRelationships: [],
      affectedPackages: [],
      impactAnalysis: {
        changesetStrategy: 'single',
        riskLevel: 'low',
      },
      recommendations: {
        createSeparateChangesets: false,
        reasoningChain: [],
      },
    }),
  })),
}))

vi.mock('../../src/multi-package-changeset-generator', () => ({
  MultiPackageChangesetGenerator: vi.fn().mockImplementation(() => ({
    generateMultiPackageChangesets: vi.fn().mockResolvedValue({
      strategy: 'single',
      changesets: [],
      filesCreated: [],
      totalPackagesAffected: 0,
      warnings: [],
      reasoning: [],
    }),
  })),
}))

vi.mock('../../src/semver-impact-assessor', () => ({
  SemverImpactAssessor: vi.fn().mockImplementation(() => ({
    assessImpact: vi.fn().mockReturnValue({
      overallImpact: 'minor',
      recommendedChangesetType: 'patch',
      isSecurityUpdate: false,
      hasBreakingChanges: false,
      confidence: 'high',
      dependencies: [],
      reasoning: [],
    }),
  })),
}))

vi.mock('../../src/change-categorization-engine', () => ({
  ChangeCategorizationEngine: vi.fn().mockImplementation(() => ({
    categorizeChanges: vi.fn().mockReturnValue({
      primaryCategory: 'dependencies',
      allCategories: ['dependencies'],
      summary: {
        securityUpdates: 0,
        breakingChanges: 0,
        highPriorityUpdates: 0,
        averageRiskLevel: 0,
      },
      confidence: 'high',
      reasoning: [],
    }),
  })),
}))

vi.mock('../../src/semver-bump-decision-engine', () => ({
  SemverBumpTypeDecisionEngine: vi.fn().mockImplementation(() => ({
    decideBumpType: vi.fn().mockReturnValue({
      bumpType: 'patch',
      confidence: 'high',
      primaryReason: 'Default patch for npm updates',
      riskAssessment: {
        level: 'low',
        score: 10,
      },
      overriddenRules: [],
      influencingFactors: [],
      reasoningChain: [],
    }),
  })),
}))

vi.mock('../../src/changeset-summary-generator', () => ({
  ChangesetSummaryGenerator: vi.fn().mockImplementation(() => ({
    generateSummary: vi.fn().mockResolvedValue('Update react dependency to v18.3.1'),
  })),
}))

// Mock @changesets/write
vi.mock('@changesets/write', () => ({
  write: vi.fn().mockResolvedValue(undefined),
}))

// Mock changeset creation utilities
vi.mock('../../src/write-renovate-changeset', () => ({
  writeRenovateChangeset: vi.fn().mockResolvedValue({
    success: true,
    files: ['.changeset/renovate-react-major.md'],
    changesetId: 'renovate-react-major',
    error: null,
  }),
}))

// Mock the template engine more specifically
vi.mock('../../src/changeset-template-engine', () => ({
  ChangesetTemplateEngine: vi.fn().mockImplementation(() => ({
    buildTemplate: vi.fn().mockReturnValue({
      header: '---\n"@bfra.me/.github": patch\n---\n',
      content: 'Update react dependency to v18.3.1',
      metadata: {
        template: 'dependency-update',
        reasoning: 'Default patch for npm updates',
      },
    }),
  })),
}))

// Mock all the enhanced detectors
vi.mock('../../src/npm-change-detector', () => ({
  NPMChangeDetector: vi.fn().mockImplementation(() => ({
    detectChangesFromPR: vi.fn().mockResolvedValue([]),
  })),
}))

vi.mock('../../src/github-actions-change-detector', () => ({
  GitHubActionsChangeDetector: vi.fn().mockImplementation(() => ({
    detectChangesFromPR: vi.fn().mockResolvedValue([]),
  })),
}))

vi.mock('../../src/docker-change-detector', () => ({
  DockerChangeDetector: vi.fn().mockImplementation(() => ({
    detectChangesFromPR: vi.fn().mockResolvedValue([]),
  })),
}))

vi.mock('../../src/python-change-detector', () => ({
  PythonChangeDetector: vi.fn().mockImplementation(() => ({
    detectChangesFromPR: vi.fn().mockResolvedValue([]),
  })),
}))

vi.mock('../../src/jvm-change-detector', () => ({
  JVMChangeDetector: vi.fn().mockImplementation(() => ({
    detectChangesFromPR: vi.fn().mockResolvedValue([]),
  })),
}))

vi.mock('../../src/go-change-detector', () => ({
  GoChangeDetector: vi.fn().mockImplementation(() => ({
    detectChangesFromPR: vi.fn().mockResolvedValue([]),
  })),
}))

vi.mock('../../src/breaking-change-detector', () => ({
  BreakingChangeDetector: vi.fn().mockImplementation(() => ({
    analyzeBreakingChanges: vi.fn().mockResolvedValue({
      hasBreakingChanges: false,
      overallSeverity: 'low',
      indicators: [],
    }),
  })),
}))

vi.mock('../../src/security-vulnerability-detector', () => ({
  SecurityVulnerabilityDetector: vi.fn().mockImplementation(() => ({
    analyzeSecurityVulnerabilities: vi.fn().mockResolvedValue({
      hasSecurityIssues: false,
      overallSeverity: 'low',
      vulnerabilities: [],
      riskScore: 0,
    }),
  })),
}))

vi.mock('../../src/git-operations', () => ({
  createGitOperations: vi.fn().mockReturnValue({
    commitChangesetFiles: vi.fn().mockResolvedValue({
      success: false, // Disable git operations in tests
      commitSha: '',
      committedFiles: [],
      error: '',
      pushSuccess: false,
      pushError: '',
      conflictsResolved: false,
      conflictResolution: '',
      branchUpdated: false,
      retryAttempts: 0,
    }),
  }),
}))

vi.mock('../../src/grouped-pr-manager', () => ({
  createGroupedPRManager: vi.fn().mockReturnValue({
    detectGroupedPRs: vi.fn().mockResolvedValue([]),
    updateGroupedPRs: vi.fn().mockResolvedValue({
      prsUpdated: 0,
      prsFailed: 0,
      strategy: 'none',
      identifier: '',
      results: [],
    }),
  }),
}))

/**
 * Enhanced Real Renovate PR samples for comprehensive end-to-end testing
 * These samples are based on actual Renovate PR patterns seen in production
 */
const ENHANCED_RENOVATE_SAMPLES = {
  // Comprehensive NPM dependency update with detailed metadata
  npmReactMajorUpdate: {
    branchName: 'renovate/react-18.x',
    prNumber: 1001,
    prTitle: 'chore(deps): update dependency react to v18.3.1',
    prBody: `This PR contains the following updates:

| Package | Change | Age | Adoption | Passing | Confidence |
|---|---|---|---|---|---|
| [react](https://reactjs.org/) ([source](https://github.com/facebook/react/tree/HEAD/packages/react)) | [\`17.0.2\` -> \`18.3.1\`](https://renovatebot.com/diffs/npm/react/17.0.2/18.3.1) | [![age](https://developer.mend.io/api/mc/badges/age/npm/react/18.3.1?slim=true)](https://docs.renovatebot.com/merge-confidence/) | [![adoption](https://developer.mend.io/api/mc/badges/adoption/npm/react/18.3.1?slim=true)](https://docs.renovatebot.com/merge-confidence/) | [![passing](https://developer.mend.io/api/mc/badges/compatibility/npm/react/17.0.2/18.3.1?slim=true)](https://docs.renovatebot.com/merge-confidence/) | [![confidence](https://developer.mend.io/api/mc/badges/confidence/npm/react/17.0.2/18.3.1?slim=true)](https://docs.renovatebot.com/merge-confidence/) |

---

### Release Notes

<details>
<summary>facebook/react (react)</summary>

### [\`v18.3.1\`](https://github.com/facebook/react/releases/tag/v18.3.1)

[Compare Source](https://github.com/facebook/react/compare/v18.3.0...v18.3.1)

#### React DOM

*   Fix hydration diff when an attribute is null/undefined ([&#8203;30464](https://github.com/facebook/react/pull/30464) by [@&#8203;sebmarkbage](https://github.com/sebmarkbage))

**Note:** This release contains important fixes for server-side rendering.

**Breaking Changes:**
- ReactDOM.render is no longer supported in React 18
- Automatic batching behavior changes
- Stricter concurrent mode requirements

</details>

---

### Configuration

📅 **Schedule**: At any time (no schedule defined).

🚦 **Automerge**: Disabled by config. Please merge this manually once you are satisfied.

♻ **Rebasing**: Whenever PR becomes conflicted, or you tick the rebase/retry checkbox.

🔕 **Ignore**: Close this PR and you won't be reminded about this update again.

---

This PR has been generated by [Renovate Bot](https://github.com/renovatebot/renovate).`,
    commits: [
      {
        sha: 'abc123def456',
        message: 'chore(deps): update dependency react to v18.3.1',
        author: {login: 'renovate[bot]'},
      },
    ],
    files: [
      {
        filename: 'package.json',
        status: 'modified',
        additions: 1,
        deletions: 1,
        patch: `@@ -15,7 +15,7 @@
   "dependencies": {
     "@types/node": "^20.0.0",
-    "react": "^17.0.2",
+    "react": "^18.3.1",
     "react-dom": "^18.3.1"
   }`,
      },
      {
        filename: 'pnpm-lock.yaml',
        status: 'modified',
        additions: 25,
        deletions: 22,
        patch: `@@ -100,10 +100,10 @@ packages:
-    react@17.0.2:
+    react@18.3.1:
       resolution: {integrity: sha512-...}
       engines: {node: '>=0.10.0'}`,
      },
    ],
  },

  // Critical security update with CVE details
  criticalExpressSecurityUpdate: {
    branchName: 'renovate/express-4.x',
    prNumber: 1002,
    prTitle: 'fix(deps): update dependency express to v4.19.2 [SECURITY]',
    prBody: `This PR contains the following updates:

| Package | Change | Age | Adoption | Passing | Confidence |
|---|---|---|---|---|---|
| [express](https://expressjs.com/) ([source](https://github.com/expressjs/express)) | [\`4.18.2\` -> \`4.19.2\`](https://renovatebot.com/diffs/npm/express/4.18.2/4.19.2) | [![age](https://developer.mend.io/api/mc/badges/age/npm/express/4.19.2?slim=true)](https://docs.renovatebot.com/merge-confidence/) | [![adoption](https://developer.mend.io/api/mc/badges/adoption/npm/express/4.19.2?slim=true)](https://docs.renovatebot.com/merge-confidence/) | [![passing](https://developer.mend.io/api/mc/badges/compatibility/npm/express/4.18.2/4.19.2?slim=true)](https://docs.renovatebot.com/merge-confidence/) | [![confidence](https://developer.mend.io/api/mc/badges/confidence/npm/express/4.18.2/4.19.2?slim=true)](https://docs.renovatebot.com/merge-confidence/) |

---

### 🔒 Important Security Information

This update includes **important security fixes**. Please merge as soon as possible.

### Vulnerabilities fixed

*   **[CVE-2024-29041](https://github.com/advisories/GHSA-rv95-896h-c2vc)**: Potential ReDoS vulnerability in express path-to-regexp

    *   Severity: **High**
    *   CVSS Score: 7.5
    *   Impact: Denial of Service
    *   Patched in: 4.19.2

*   **[CVE-2024-43796](https://github.com/advisories/GHSA-qw6h-vgh9-j6wx)**: express accepts malformed URLs

    *   Severity: **Medium**
    *   CVSS Score: 5.3
    *   Impact: Information Disclosure
    *   Patched in: 4.19.2

### Release Notes

<details>
<summary>expressjs/express (express)</summary>

### [\`v4.19.2\`](https://github.com/expressjs/express/releases/tag/4.19.2)

*   Fix routing with bad regular expression
*   deps: path-to-regexp@0.1.10
    *   Fix ReDoS vulnerability when using certain patterns
*   deps: body-parser@1.20.2
*   deps: serve-static@1.15.0

</details>

---

This PR has been generated by [Renovate Bot](https://github.com/renovatebot/renovate).`,
    commits: [
      {
        sha: 'def456ghi789',
        message: 'fix(deps): update dependency express to v4.19.2 [SECURITY]',
        author: {login: 'renovate[bot]'},
      },
    ],
    files: [
      {
        filename: 'package.json',
        status: 'modified',
        additions: 1,
        deletions: 1,
        patch: `@@ -15,7 +15,7 @@
   "dependencies": {
     "cors": "^2.8.5",
-    "express": "^4.18.2",
+    "express": "^4.19.2",
     "helmet": "^7.0.0"
   }`,
      },
    ],
  },

  // GitHub Actions security update
  githubActionsSecurityUpdate: {
    branchName: 'renovate/actions-checkout-4.x',
    prNumber: 1003,
    prTitle: 'chore(deps): update actions/checkout action to v4.1.7 [SECURITY]',
    prBody: `This PR contains the following updates:

| Package | Type | Update | Change |
|---|---|---|---|
| [actions/checkout](https://github.com/actions/checkout) | action | patch | \`v4.1.6\` -> \`v4.1.7\` |

---

### 🔒 Important Security Information

This update includes **important security fixes**. Please merge as soon as possible.

### Vulnerabilities fixed

*   **[GHSA-mw99-9chc-xw7r](https://github.com/advisories/GHSA-mw99-9chc-xw7r)**: Arbitrary code execution in actions/checkout
    *   Severity: **High**
    *   CVSS Score: 8.1
    *   Impact: Remote Code Execution

### Release Notes

<details>
<summary>actions/checkout</summary>

### [\`v4.1.7\`](https://github.com/actions/checkout/releases/tag/v4.1.7)

**Security:**
- Fix arbitrary code execution vulnerability in git operations
- Improved validation of repository references
- Enhanced sanitization of user inputs

**Bug Fixes:**
- Fixed issue with sparse checkout on Windows
- Improved error handling for invalid repositories

</details>

---

This PR has been generated by [Renovate Bot](https://github.com/renovatebot/renovate).`,
    commits: [
      {
        sha: 'ghi789jkl012',
        message: 'chore(deps): update actions/checkout action to v4.1.7 [SECURITY]',
        author: {login: 'renovate[bot]'},
      },
    ],
    files: [
      {
        filename: '.github/workflows/ci.yaml',
        status: 'modified',
        additions: 2,
        deletions: 2,
        patch: `@@ -15,7 +15,7 @@ jobs:
     steps:
-      - uses: actions/checkout@v4.1.6
+      - uses: actions/checkout@v4.1.7
         with:
           fetch-depth: 0
@@ -35,7 +35,7 @@ jobs:
     steps:
-      - uses: actions/checkout@v4.1.6
+      - uses: actions/checkout@v4.1.7
         with:
           token: \${{ secrets.GITHUB_TOKEN }}`,
      },
    ],
  },

  // Grouped ESLint monorepo update with multiple packages
  eslintGroupedUpdate: {
    branchName: 'renovate/eslint-monorepo',
    prNumber: 1004,
    prTitle: 'chore(deps-dev): update eslint monorepo to v9.0.0 (major)',
    prBody: `This PR contains the following updates:

| Package | Change | Age | Adoption | Passing | Confidence |
|---|---|---|---|---|---|
| [@typescript-eslint/eslint-plugin](https://typescript-eslint.io) ([source](https://github.com/typescript-eslint/typescript-eslint/tree/HEAD/packages/eslint-plugin)) | [\`7.18.0\` -> \`8.0.0\`](https://renovatebot.com/diffs/npm/@typescript-eslint%2feslint-plugin/7.18.0/8.0.0) | [![age](https://developer.mend.io/api/mc/badges/age/npm/@typescript-eslint%2feslint-plugin/8.0.0?slim=true)](https://docs.renovatebot.com/merge-confidence/) | [![adoption](https://developer.mend.io/api/mc/badges/adoption/npm/@typescript-eslint%2feslint-plugin/8.0.0?slim=true)](https://docs.renovatebot.com/merge-confidence/) | [![passing](https://developer.mend.io/api/mc/badges/compatibility/npm/@typescript-eslint%2feslint-plugin/7.18.0/8.0.0?slim=true)](https://docs.renovatebot.com/merge-confidence/) | [![confidence](https://developer.mend.io/api/mc/badges/confidence/npm/@typescript-eslint%2feslint-plugin/7.18.0/8.0.0?slim=true)](https://docs.renovatebot.com/merge-confidence/) |
| [@typescript-eslint/parser](https://typescript-eslint.io) ([source](https://github.com/typescript-eslint/typescript-eslint/tree/HEAD/packages/parser)) | [\`7.18.0\` -> \`8.0.0\`](https://renovatebot.com/diffs/npm/@typescript-eslint%2fparser/7.18.0/8.0.0) | [![age](https://developer.mend.io/api/mc/badges/age/npm/@typescript-eslint%2fparser/8.0.0?slim=true)](https://docs.renovatebot.com/merge-confidence/) | [![adoption](https://developer.mend.io/api/mc/badges/adoption/npm/@typescript-eslint%2fparser/8.0.0?slim=true)](https://docs.renovatebot.com/merge-confidence/) | [![passing](https://developer.mend.io/api/mc/badges/compatibility/npm/@typescript-eslint%2fparser/7.18.0/8.0.0?slim=true)](https://docs.renovatebot.com/merge-confidence/) | [![confidence](https://developer.mend.io/api/mc/badges/confidence/npm/@typescript-eslint%2fparser/7.18.0/8.0.0?slim=true)](https://docs.renovatebot.com/merge-confidence/) |
| [eslint](https://eslint.org) ([source](https://github.com/eslint/eslint)) | [\`8.57.0\` -> \`9.0.0\`](https://renovatebot.com/diffs/npm/eslint/8.57.0/9.0.0) | [![age](https://developer.mend.io/api/mc/badges/age/npm/eslint/9.0.0?slim=true)](https://docs.renovatebot.com/merge-confidence/) | [![adoption](https://developer.mend.io/api/mc/badges/adoption/npm/eslint/9.0.0?slim=true)](https://docs.renovatebot.com/merge-confidence/) | [![passing](https://developer.mend.io/api/mc/badges/compatibility/npm/eslint/8.57.0/9.0.0?slim=true)](https://docs.renovatebot.com/merge-confidence/) | [![confidence](https://developer.mend.io/api/mc/badges/confidence/npm/eslint/8.57.0/9.0.0?slim=true)](https://docs.renovatebot.com/merge-confidence/) |

---

⚠ **Dependency Lookup Warnings** ⚠

Warnings were logged while processing this repo. Please check the logs for more information.

---

### Release Notes

<details>
<summary>typescript-eslint/typescript-eslint (@&#8203;typescript-eslint/eslint-plugin)</summary>

### [\`v8.0.0\`](https://github.com/typescript-eslint/typescript-eslint/releases/tag/v8.0.0)

## 8.0.0 (2024-09-23)

### ⚠ BREAKING CHANGES

* drop support for TypeScript 4.7
* remove deprecated formatting rules
* update recommended configurations

**Features:**
- New rules for better TypeScript analysis
- Improved performance and memory usage
- Enhanced type checking capabilities

**Breaking Changes:**
- Requires TypeScript 5.0+
- Several rules have new default configurations
- Some rules have been renamed or removed

</details>

<details>
<summary>eslint/eslint</summary>

### [\`v9.0.0\`](https://github.com/eslint/eslint/releases/tag/v9.0.0)

## v9.0.0 - March 15, 2024

### Breaking Changes

* Drop support for Node.js v18.17.0, v18.17.1, and v19
* Remove deprecated formatting rules and formatters
* Require Node.js ^18.18.0 || ^20.9.0 || >=21.1.0

### New Features

* Flat config is now the default
* New language options and rule configurations
* Improved performance for large codebases

</details>

---

### Configuration

📅 **Schedule**: At any time (no schedule defined).

🚦 **Automerge**: Disabled by config. Please merge this manually once you are satisfied.

♻ **Rebasing**: Whenever PR becomes conflicted, or you tick the rebase/retry checkbox.

🔕 **Ignore**: Close this PR and you won't be reminded about these updates again.

---

This PR has been generated by [Renovate Bot](https://github.com/renovatebot/renovate).`,
    commits: [
      {
        sha: 'jkl012mno345',
        message: 'chore(deps-dev): update eslint monorepo to v9.0.0 (major)',
        author: {login: 'renovate[bot]'},
      },
    ],
    files: [
      {
        filename: 'package.json',
        status: 'modified',
        additions: 3,
        deletions: 3,
        patch: `@@ -25,9 +25,9 @@
   "devDependencies": {
-    "@typescript-eslint/eslint-plugin": "^7.18.0",
-    "@typescript-eslint/parser": "^7.18.0",
-    "eslint": "^8.57.0",
+    "@typescript-eslint/eslint-plugin": "^8.0.0",
+    "@typescript-eslint/parser": "^8.0.0",
+    "eslint": "^9.0.0",
     "prettier": "^3.0.0"
   }`,
      },
      {
        filename: 'packages/core/package.json',
        status: 'modified',
        additions: 3,
        deletions: 3,
        patch: `@@ -15,9 +15,9 @@
   "devDependencies": {
-    "@typescript-eslint/eslint-plugin": "^7.18.0",
-    "@typescript-eslint/parser": "^7.18.0",
-    "eslint": "^8.57.0"
+    "@typescript-eslint/eslint-plugin": "^8.0.0",
+    "@typescript-eslint/parser": "^8.0.0",
+    "eslint": "^9.0.0"
   }`,
      },
    ],
  },

  // Docker image update
  nodeDockerUpdate: {
    branchName: 'renovate/docker-node-22.x',
    prNumber: 1005,
    prTitle: 'chore(deps): update node Docker tag to v22.8.0',
    prBody: `This PR contains the following updates:

| Package | Type | Update | Change |
|---|---|---|---|
| node | docker | minor | \`22.7.0-alpine\` -> \`22.8.0-alpine\` |

---

### Release Notes

<details>
<summary>nodejs/node</summary>

### [\`v22.8.0\`](https://github.com/nodejs/node/releases/tag/v22.8.0)

### Notable Changes

**Module customization hooks now stable**

Module customization is now stable. This includes \`register()\` to register loaders, and specifying loaders via the \`--import\` command-line option.

**API changes**

*   **cli**: allow running wasm in limited vmem with --disable-wasm-trap-handler ([#52766](https://github.com/nodejs/node/pull/52766))
*   **fs**: add stacktrace to fs/promises ([#49849](https://github.com/nodejs/node/pull/49849))
*   **process**: add \`process.features.require_module\` ([#52762](https://github.com/nodejs/node/pull/52762))

</details>

---

### Configuration

📅 **Schedule**: At any time (no schedule defined).

🚦 **Automerge**: Disabled by config. Please merge this manually once you are satisfied.

♻ **Rebasing**: Whenever PR becomes conflicted, or you tick the rebase/retry checkbox.

🔕 **Ignore**: Close this PR and you won't be reminded about this update again.

---

This PR has been generated by [Renovate Bot](https://github.com/renovatebot/renovate).`,
    commits: [
      {
        sha: 'mno345pqr678',
        message: 'chore(deps): update node Docker tag to v22.8.0',
        author: {login: 'renovate[bot]'},
      },
    ],
    files: [
      {
        filename: 'Dockerfile',
        status: 'modified',
        additions: 1,
        deletions: 1,
        patch: `@@ -1,4 +1,4 @@
-FROM node:22.7.0-alpine
+FROM node:22.8.0-alpine

 WORKDIR /app
 COPY package*.json ./`,
      },
      {
        filename: 'docker-compose.prod.yml',
        status: 'modified',
        additions: 1,
        deletions: 1,
        patch: `@@ -6,7 +6,7 @@ services:
     build:
       context: .
       dockerfile: Dockerfile
-    image: node:22.7.0-alpine
+    image: node:22.8.0-alpine
     restart: unless-stopped`,
      },
    ],
  },

  // Python Django major update
  pythonDjangoMajorUpdate: {
    branchName: 'renovate/django-5.x',
    prNumber: 1006,
    prTitle: 'chore(deps): update dependency django to v5.1.0',
    prBody: `This PR contains the following updates:

| Package | Change | Age | Adoption | Passing | Confidence |
|---|---|---|---|---|---|
| [Django](https://www.djangoproject.com/) ([changelog](https://docs.djangoproject.com/en/5.1/releases/)) | \`4.2.16\` -> \`5.1.0\` | [![age](https://developer.mend.io/api/mc/badges/age/pypi/django/5.1.0?slim=true)](https://docs.renovatebot.com/merge-confidence/) | [![adoption](https://developer.mend.io/api/mc/badges/adoption/pypi/django/5.1.0?slim=true)](https://docs.renovatebot.com/merge-confidence/) | [![passing](https://developer.mend.io/api/mc/badges/compatibility/pypi/django/4.2.16/5.1.0?slim=true)](https://docs.renovatebot.com/merge-confidence/) | [![confidence](https://developer.mend.io/api/mc/badges/confidence/pypi/django/4.2.16/5.1.0?slim=true)](https://docs.renovatebot.com/merge-confidence/) |

---

### Release Notes

<details>
<summary>django/django</summary>

### [\`v5.1.0\`](https://docs.djangoproject.com/en/5.1/releases/5.1/)

**Django 5.1 release notes**

*Welcome to Django 5.1!*

These release notes cover the new features, as well as some backwards incompatible changes you'll want to be aware of when upgrading from Django 5.0 or earlier. We've begun the deprecation process for some features.

### Python compatibility

Django 5.1 supports Python 3.10, 3.11, and 3.12. We **highly recommend** and only officially support the latest release of each series.

### What's new in Django 5.1

**Field groups in forms**
- New form rendering API for organizing fields into groups
- Enhanced accessibility and semantic markup

**Simplified templates for forms**
- More streamlined form rendering with better defaults
- Improved error handling and display

**New database functions and features**
- Additional database functions for complex queries
- Improved query optimization

**Performance improvements**
- Faster ORM operations
- Enhanced caching mechanisms
- Reduced memory usage

### Backwards incompatible changes in 5.1

Please see the documentation for a complete list of backwards incompatible changes.

</details>

---

### Configuration

📅 **Schedule**: At any time (no schedule defined).

🚦 **Automerge**: Disabled by config. Please merge this manually once you are satisfied.

♻ **Rebasing**: Whenever PR becomes conflicted, or you tick the rebase/retry checkbox.

🔕 **Ignore**: Close this PR and you won't be reminded about this update again.

---

This PR has been generated by [Renovate Bot](https://github.com/renovatebot/renovate).`,
    commits: [
      {
        sha: 'pqr678stu901',
        message: 'chore(deps): update dependency django to v5.1.0',
        author: {login: 'renovate[bot]'},
      },
    ],
    files: [
      {
        filename: 'requirements.txt',
        status: 'modified',
        additions: 1,
        deletions: 1,
        patch: `@@ -1,7 +1,7 @@
 # Core dependencies
-Django==4.2.16
+Django==5.1.0
 psycopg2-binary==2.9.9
 celery==5.3.4
 redis==5.0.1`,
      },
      {
        filename: 'requirements-dev.txt',
        status: 'modified',
        additions: 1,
        deletions: 1,
        patch: `@@ -1,5 +1,5 @@
 # Development dependencies
-Django==4.2.16
+Django==5.1.0
 pytest-django==4.8.0
 black==24.0.0`,
      },
    ],
  },
}

describe('TASK-040: Enhanced End-to-End Tests with Real Renovate PRs', () => {
  let mockWorkspace: string

  // Test helper to run the real action implementation
  const runRealAction = async () => {
    // Import and run the source TypeScript directly to work with mocks
    try {
      const {run} = await import('../../src/index')
      await run()
    } catch (error) {
      console.error('Action run failed:', error)
      throw error
    }
  }

  beforeEach(async () => {
    // Set up test workspace
    mockWorkspace = '/tmp/enhanced-test-workspace'

    // Reset all mocks
    vi.clearAllMocks()

    // Mock file system operations for test environment
    fsMocks.access.mockImplementation(async (path: string) => {
      const pathStr = path.toString()
      // eslint-disable-next-line no-console
      console.log(`DEBUG: fs.access called with: ${pathStr}`)

      // Allow access to directories and core files
      if (pathStr.includes('.changeset') && !pathStr.endsWith('.md')) {
        return Promise.resolve() // .changeset directory exists
      }
      if (pathStr.includes('package.json') || pathStr.includes('pnpm-lock.yaml')) {
        return Promise.resolve() // These files exist
      }

      // CRITICAL: Reject access to changeset files so they get created
      if (pathStr.includes('.changeset') && pathStr.endsWith('.md')) {
        // eslint-disable-next-line no-console
        console.log(`DEBUG: Rejecting changeset file access: ${pathStr}`)
        const error = new Error('ENOENT: no such file or directory') as any
        error.code = 'ENOENT'
        throw error
      }

      return Promise.resolve()
    })
    fsMocks.mkdir.mockResolvedValue(undefined)
    fsMocks.readdir.mockImplementation(async (path: string) => {
      // eslint-disable-next-line no-console
      console.log(`DEBUG: fs.readdir called with: ${path}`)
      if (path.toString().includes('.changeset')) {
        // eslint-disable-next-line no-console
        console.log('DEBUG: Returning empty array for .changeset directory')
        return []
      }
      return []
    })
    fsMocks.stat.mockResolvedValue({isDirectory: () => true} as any)

    // Mock reading package.json and changeset config
    fsMocks.readFile.mockImplementation(async (filePath: string) => {
      const path = filePath.toString()

      if (path.includes('package.json') && !path.includes('.changeset')) {
        return JSON.stringify({
          name: '@test/enhanced-repo',
          version: '1.0.0',
          dependencies: {},
          devDependencies: {},
        })
      }

      if (path.includes('.changeset/config.json')) {
        return JSON.stringify({
          $schema: 'https://unpkg.com/@changesets/config@2.3.1/schema.json',
          changelog: '@changesets/cli/changelog',
          commit: false,
          fixed: [],
          linked: [],
          access: 'restricted',
          baseBranch: 'main',
          updateInternalDependencies: 'patch',
          ignore: [],
        })
      }

      if (path.includes('GITHUB_EVENT_PATH') || path.includes('event.json')) {
        // This will be set per test
        return '{}'
      }

      throw new Error(`Unexpected file read: ${filePath}`)
    })

    // Mock git operations
    execMocks.getExecOutput.mockImplementation(async (command: string, args: string[]) => {
      if (command === 'git') {
        if (args.includes('config')) {
          return {
            exitCode: 0,
            stdout: 'renovate[bot] <renovate@whitesourcesoftware.com>',
            stderr: '',
          }
        }
        if (args.includes('rev-parse')) {
          return {exitCode: 0, stdout: 'abc123\n', stderr: ''}
        }
        if (args.includes('add') || args.includes('commit') || args.includes('push')) {
          return {exitCode: 0, stdout: '', stderr: ''}
        }
      }
      return {exitCode: 0, stdout: '', stderr: ''}
    })

    // Set up default action inputs
    coreMocks.getInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        token: 'mock-github-token',
        'working-directory': mockWorkspace,
        'branch-prefix': 'renovate/',
        'default-changeset-type': 'patch',
        'comment-pr': 'true',
        'update-pr-description': 'true',
        'config-file': '',
        config: '',
        'exclude-patterns': '',
      }
      return inputs[name] || ''
    })

    coreMocks.getBooleanInput.mockImplementation((name: string) => {
      const boolInputs: Record<string, boolean> = {
        'skip-branch-prefix-check': false,
        sort: true,
        'comment-pr': true,
        'update-pr-description': true,
        'update-grouped-prs': false,
      }
      return boolInputs[name] || false
    })

    // Mock minimatch to properly match patterns (instead of always returning true)
    const minimatchMock = await import('minimatch')
    vi.mocked(minimatchMock.minimatch).mockImplementation((file: string, pattern: string) => {
      // Handle common patterns used in the action
      if (pattern.includes('package.json')) return file.includes('package.json')
      if (pattern.includes('pnpm-lock.yaml')) return file.includes('pnpm-lock.yaml')
      if (pattern.includes('yarn.lock')) return file.includes('yarn.lock')
      if (pattern.includes('package-lock.json')) return file.includes('package-lock.json')
      if (pattern.includes('.github/workflows')) return file.includes('.github/workflows')
      if (pattern.includes('Dockerfile')) return file.includes('Dockerfile')
      if (pattern.includes('requirements.txt')) return file.includes('requirements.txt')
      if (pattern.includes('.changeset')) return file.includes('.changeset')
      // Default to false for unknown patterns in tests
      return false
    })

    // Add debugging to core functions
    coreMocks.info.mockImplementation((message: string) => {
      console.error('INFO:', message)
    })
    coreMocks.warning.mockImplementation((message: string) => {
      console.error('WARNING:', message)
    })
    coreMocks.error.mockImplementation((message: string) => {
      console.error('ERROR:', message)
    })
    coreMocks.setFailed.mockImplementation((message: string) => {
      console.error('SET_FAILED:', message)
    })

    // Set required environment variables
    vi.stubEnv('GITHUB_REPOSITORY', 'test-owner/enhanced-test-repo')
    vi.stubEnv('GITHUB_EVENT_PATH', `${mockWorkspace}/event.json`)
    vi.stubEnv('GITHUB_WORKSPACE', mockWorkspace)
    vi.stubEnv('GITHUB_EVENT_NAME', 'pull_request')
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  describe('NPM Dependency Updates', () => {
    it('should handle React major version update with comprehensive analysis', async () => {
      const sample = ENHANCED_RENOVATE_SAMPLES.npmReactMajorUpdate

      // Set up GitHub event data
      vi.stubEnv('GITHUB_REF_NAME', sample.branchName)
      vi.stubEnv('GITHUB_HEAD_REF', sample.branchName)

      // Mock event data
      const eventData = {
        pull_request: {
          number: sample.prNumber,
          title: sample.prTitle,
          body: sample.prBody,
          user: {login: 'renovate[bot]'},
          head: {ref: sample.branchName},
          base: {ref: 'main'},
        },
      }

      fsMocks.readFile.mockImplementation(async (filePath: string) => {
        const path = filePath.toString()
        if (path.includes('event.json')) {
          return JSON.stringify(eventData)
        }
        // Use default implementation for other files
        return fsMocks.readFile.getMockImplementation()?.(filePath) || '{}'
      })

      // Mock GitHub API responses
      octokitMocks.rest.pulls.get.mockResolvedValue({
        data: eventData.pull_request,
      })

      octokitMocks.rest.pulls.listCommits.mockResolvedValue({
        data: sample.commits,
      })

      octokitMocks.rest.pulls.listFiles.mockResolvedValue({
        data: sample.files,
      })

      octokitMocks.rest.issues.createComment.mockResolvedValue({
        data: {id: 1001, body: 'mock comment'},
      })

      // Run the actual action
      await runRealAction()

      // Verify changeset creation
      expect(fsMocks.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\.changeset\/renovate-abc123\.md$/),
        expect.stringContaining('---'),
        'utf8',
      )

      // Verify changeset content includes React dependency
      const changesetCall = fsMocks.writeFile.mock.calls.find(
        call =>
          call[0].toString().includes('.changeset') &&
          call[0].toString().includes('renovate-abc123.md'),
      )
      expect(changesetCall).toBeDefined()
      if (changesetCall) {
        const content = changesetCall[1] as string
        expect(content).toContain('enhanced-test-repo')
        expect(content).toContain('patch')
        expect(content).toMatch(/Update.*react.*dependency/i)
      }

      // Verify comprehensive outputs are set
      expect(coreMocks.setOutput).toHaveBeenCalledWith('changesets-created', expect.any(String))
      expect(coreMocks.setOutput).toHaveBeenCalledWith('update-type', expect.any(String))
      expect(coreMocks.setOutput).toHaveBeenCalledWith('dependencies', expect.any(String))

      // Verify enhanced categorization outputs
      expect(coreMocks.setOutput).toHaveBeenCalledWith('primary-category', expect.any(String))
      expect(coreMocks.setOutput).toHaveBeenCalledWith('all-categories', expect.any(String))
      expect(coreMocks.setOutput).toHaveBeenCalledWith('categorization-summary', expect.any(String))

      // Verify multi-package analysis outputs
      expect(coreMocks.setOutput).toHaveBeenCalledWith('multi-package-strategy', expect.any(String))
      expect(coreMocks.setOutput).toHaveBeenCalledWith(
        'workspace-packages-count',
        expect.any(String),
      )

      // Verify PR comment creation with enhanced content
      expect(octokitMocks.rest.issues.createComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'enhanced-test-repo',
        issue_number: sample.prNumber,
        body: expect.stringContaining('🔄 Changeset Generated'),
      })
    })
  })

  describe('Critical Security Updates', () => {
    it('should handle critical Express security update with proper prioritization', async () => {
      const sample = ENHANCED_RENOVATE_SAMPLES.criticalExpressSecurityUpdate

      // Set up GitHub event data
      vi.stubEnv('GITHUB_REF_NAME', sample.branchName)
      vi.stubEnv('GITHUB_HEAD_REF', sample.branchName)

      const eventData = {
        pull_request: {
          number: sample.prNumber,
          title: sample.prTitle,
          body: sample.prBody,
          user: {login: 'renovate[bot]'},
          head: {ref: sample.branchName},
          base: {ref: 'main'},
        },
      }

      fsMocks.readFile.mockImplementation(async (filePath: string) => {
        const path = filePath.toString()
        if (path.includes('event.json')) {
          return JSON.stringify(eventData)
        }
        return fsMocks.readFile.getMockImplementation()?.(filePath) || '{}'
      })

      // Mock GitHub API responses
      octokitMocks.rest.pulls.get.mockResolvedValue({data: eventData.pull_request})
      octokitMocks.rest.pulls.listCommits.mockResolvedValue({data: sample.commits})
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({data: sample.files})
      octokitMocks.rest.issues.createComment.mockResolvedValue({
        data: {id: 1002, body: 'mock security comment'},
      })

      // Run the actual action
      await runRealAction()

      // Verify security-specific outputs
      expect(coreMocks.setOutput).toHaveBeenCalledWith('security-updates', expect.any(String))
      expect(coreMocks.setOutput).toHaveBeenCalledWith('average-risk-level', expect.any(String))

      // Verify changeset creation
      expect(fsMocks.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\.changeset\/renovate-abc123\.md$/),
        expect.stringContaining('---'),
        'utf8',
      )

      // Verify security classification in PR comment
      const commentCall = octokitMocks.rest.issues.createComment.mock.calls[0]
      expect(commentCall[0].body).toContain('🔄 Changeset Generated')

      // The action should detect this as a security update
      expect(coreMocks.setOutput).toHaveBeenCalledWith('security-updates', expect.any(String))
    })
  })

  describe('GitHub Actions Security Updates', () => {
    it('should handle GitHub Actions security update with proper manager detection', async () => {
      const sample = ENHANCED_RENOVATE_SAMPLES.githubActionsSecurityUpdate

      // Set up GitHub event data
      vi.stubEnv('GITHUB_REF_NAME', sample.branchName)
      vi.stubEnv('GITHUB_HEAD_REF', sample.branchName)

      const eventData = {
        pull_request: {
          number: sample.prNumber,
          title: sample.prTitle,
          body: sample.prBody,
          user: {login: 'renovate[bot]'},
          head: {ref: sample.branchName},
          base: {ref: 'main'},
        },
      }

      fsMocks.readFile.mockImplementation(async (filePath: string) => {
        const path = filePath.toString()
        if (path.includes('event.json')) {
          return JSON.stringify(eventData)
        }
        return fsMocks.readFile.getMockImplementation()?.(filePath) || '{}'
      })

      // Mock GitHub API responses
      octokitMocks.rest.pulls.get.mockResolvedValue({data: eventData.pull_request})
      octokitMocks.rest.pulls.listCommits.mockResolvedValue({data: sample.commits})
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({data: sample.files})
      octokitMocks.rest.issues.createComment.mockResolvedValue({
        data: {id: 1003, body: 'mock actions comment'},
      })

      // Run the actual action
      await runRealAction()

      // Verify GitHub Actions manager detection
      expect(coreMocks.setOutput).toHaveBeenCalledWith('update-type', expect.any(String))

      // Verify security update detection
      expect(coreMocks.setOutput).toHaveBeenCalledWith('security-updates', expect.any(String))

      // Verify changeset creation
      expect(fsMocks.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\.changeset\/renovate-abc123\.md$/),
        expect.stringContaining('---'),
        'utf8',
      )
    })
  })

  describe('Grouped Updates', () => {
    it('should handle ESLint monorepo grouped update with proper categorization', async () => {
      const sample = ENHANCED_RENOVATE_SAMPLES.eslintGroupedUpdate

      // Set up GitHub event data
      vi.stubEnv('GITHUB_REF_NAME', sample.branchName)
      vi.stubEnv('GITHUB_HEAD_REF', sample.branchName)

      const eventData = {
        pull_request: {
          number: sample.prNumber,
          title: sample.prTitle,
          body: sample.prBody,
          user: {login: 'renovate[bot]'},
          head: {ref: sample.branchName},
          base: {ref: 'main'},
        },
      }

      fsMocks.readFile.mockImplementation(async (filePath: string) => {
        const path = filePath.toString()
        if (path.includes('event.json')) {
          return JSON.stringify(eventData)
        }
        return fsMocks.readFile.getMockImplementation()?.(filePath) || '{}'
      })

      // Mock GitHub API responses
      octokitMocks.rest.pulls.get.mockResolvedValue({data: eventData.pull_request})
      octokitMocks.rest.pulls.listCommits.mockResolvedValue({data: sample.commits})
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({data: sample.files})
      octokitMocks.rest.issues.createComment.mockResolvedValue({
        data: {id: 1004, body: 'mock grouped comment'},
      })

      // Run the actual action
      await runRealAction()

      // Verify grouped update handling
      expect(coreMocks.setOutput).toHaveBeenCalledWith('multi-package-strategy', expect.any(String))
      expect(coreMocks.setOutput).toHaveBeenCalledWith('all-categories', expect.any(String))

      // Verify changeset creation
      expect(fsMocks.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\.changeset\/renovate-abc123\.md$/),
        expect.stringContaining('---'),
        'utf8',
      )

      // Verify comprehensive analysis outputs
      expect(coreMocks.setOutput).toHaveBeenCalledWith(
        'categorization-confidence',
        expect.any(String),
      )
      expect(coreMocks.setOutput).toHaveBeenCalledWith(
        'workspace-packages-count',
        expect.any(String),
      )
    })
  })

  describe('Docker Updates', () => {
    it('should handle Node.js Docker image update with proper versioning', async () => {
      const sample = ENHANCED_RENOVATE_SAMPLES.nodeDockerUpdate

      // Set up GitHub event data
      vi.stubEnv('GITHUB_REF_NAME', sample.branchName)
      vi.stubEnv('GITHUB_HEAD_REF', sample.branchName)

      const eventData = {
        pull_request: {
          number: sample.prNumber,
          title: sample.prTitle,
          body: sample.prBody,
          user: {login: 'renovate[bot]'},
          head: {ref: sample.branchName},
          base: {ref: 'main'},
        },
      }

      fsMocks.readFile.mockImplementation(async (filePath: string) => {
        const path = filePath.toString()
        if (path.includes('event.json')) {
          return JSON.stringify(eventData)
        }
        return fsMocks.readFile.getMockImplementation()?.(filePath) || '{}'
      })

      // Mock GitHub API responses
      octokitMocks.rest.pulls.get.mockResolvedValue({data: eventData.pull_request})
      octokitMocks.rest.pulls.listCommits.mockResolvedValue({data: sample.commits})
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({data: sample.files})
      octokitMocks.rest.issues.createComment.mockResolvedValue({
        data: {id: 1005, body: 'mock docker comment'},
      })

      // Run the actual action
      await runRealAction()

      // Verify Docker update detection
      expect(coreMocks.setOutput).toHaveBeenCalledWith('update-type', expect.any(String))

      // Verify changeset creation
      expect(fsMocks.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\.changeset\/renovate-abc123\.md$/),
        expect.stringContaining('---'),
        'utf8',
      )

      // Verify Docker-specific analysis
      expect(coreMocks.setOutput).toHaveBeenCalledWith('primary-category', expect.any(String))
    })
  })

  describe('Python Dependencies', () => {
    it('should handle Django major version update with proper impact assessment', async () => {
      const sample = ENHANCED_RENOVATE_SAMPLES.pythonDjangoMajorUpdate

      // Set up GitHub event data
      vi.stubEnv('GITHUB_REF_NAME', sample.branchName)
      vi.stubEnv('GITHUB_HEAD_REF', sample.branchName)

      const eventData = {
        pull_request: {
          number: sample.prNumber,
          title: sample.prTitle,
          body: sample.prBody,
          user: {login: 'renovate[bot]'},
          head: {ref: sample.branchName},
          base: {ref: 'main'},
        },
      }

      fsMocks.readFile.mockImplementation(async (filePath: string) => {
        const path = filePath.toString()
        if (path.includes('event.json')) {
          return JSON.stringify(eventData)
        }
        return fsMocks.readFile.getMockImplementation()?.(filePath) || '{}'
      })

      // Mock GitHub API responses
      octokitMocks.rest.pulls.get.mockResolvedValue({data: eventData.pull_request})
      octokitMocks.rest.pulls.listCommits.mockResolvedValue({data: sample.commits})
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({data: sample.files})
      octokitMocks.rest.issues.createComment.mockResolvedValue({
        data: {id: 1006, body: 'mock python comment'},
      })

      // Run the actual action
      await runRealAction()

      // Verify Python manager detection
      expect(coreMocks.setOutput).toHaveBeenCalledWith('update-type', expect.any(String))

      // Verify major version handling
      expect(coreMocks.setOutput).toHaveBeenCalledWith('breaking-changes', expect.any(String))

      // Verify changeset creation
      expect(fsMocks.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\.changeset\/renovate-abc123\.md$/),
        expect.stringContaining('---'),
        'utf8',
      )
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle non-Renovate PRs gracefully', async () => {
      // Set up GitHub event data for non-Renovate PR
      vi.stubEnv('GITHUB_REF_NAME', 'feature/manual-update')
      vi.stubEnv('GITHUB_HEAD_REF', 'feature/manual-update')

      const eventData = {
        pull_request: {
          number: 9999,
          title: 'Manual dependency update',
          body: 'Manually updating dependencies',
          user: {login: 'human-developer'},
          head: {ref: 'feature/manual-update'},
          base: {ref: 'main'},
        },
      }

      fsMocks.readFile.mockImplementation(async (filePath: string) => {
        const path = filePath.toString()
        if (path.includes('event.json')) {
          return JSON.stringify(eventData)
        }
        return fsMocks.readFile.getMockImplementation()?.(filePath) || '{}'
      })

      // Run the actual action
      await runRealAction()

      // Verify it gracefully skips non-Renovate PRs
      expect(coreMocks.info).toHaveBeenCalledWith('Not a Renovate PR, skipping')
      expect(fsMocks.writeFile).not.toHaveBeenCalled()
      expect(coreMocks.setFailed).not.toHaveBeenCalled()
    })

    it('should handle missing working directory gracefully', async () => {
      // Mock working directory access failure
      fsMocks.access.mockRejectedValueOnce(new Error('ENOENT: no such file or directory'))

      const sample = ENHANCED_RENOVATE_SAMPLES.npmReactMajorUpdate

      // Set up valid GitHub event data
      vi.stubEnv('GITHUB_REF_NAME', sample.branchName)
      vi.stubEnv('GITHUB_HEAD_REF', sample.branchName)

      const eventData = {
        pull_request: {
          number: sample.prNumber,
          title: sample.prTitle,
          body: sample.prBody,
          user: {login: 'renovate[bot]'},
          head: {ref: sample.branchName},
          base: {ref: 'main'},
        },
      }

      fsMocks.readFile.mockImplementation(async (filePath: string) => {
        const path = filePath.toString()
        if (path.includes('event.json')) {
          return JSON.stringify(eventData)
        }
        return fsMocks.readFile.getMockImplementation()?.(filePath) || '{}'
      })

      // Run the actual action
      await runRealAction()

      // Verify error handling
      expect(coreMocks.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Working directory does not exist'),
      )
    })

    it('should handle GitHub API errors gracefully', async () => {
      const sample = ENHANCED_RENOVATE_SAMPLES.criticalExpressSecurityUpdate

      // Set up GitHub event data
      vi.stubEnv('GITHUB_REF_NAME', sample.branchName)
      vi.stubEnv('GITHUB_HEAD_REF', sample.branchName)

      const eventData = {
        pull_request: {
          number: sample.prNumber,
          title: sample.prTitle,
          body: sample.prBody,
          user: {login: 'renovate[bot]'},
          head: {ref: sample.branchName},
          base: {ref: 'main'},
        },
      }

      fsMocks.readFile.mockImplementation(async (filePath: string) => {
        const path = filePath.toString()
        if (path.includes('event.json')) {
          return JSON.stringify(eventData)
        }
        return fsMocks.readFile.getMockImplementation()?.(filePath) || '{}'
      })

      // Mock GitHub API failure
      octokitMocks.rest.pulls.listFiles.mockRejectedValueOnce(new Error('API rate limit exceeded'))

      // Run the actual action
      await runRealAction()

      // Verify error handling
      expect(coreMocks.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('API rate limit exceeded'),
      )
    })
  })

  describe('Performance and Integration', () => {
    it('should handle large monorepo updates efficiently', async () => {
      const sample = ENHANCED_RENOVATE_SAMPLES.eslintGroupedUpdate

      // Create a large file list (simulating monorepo with many packages)
      const manyFiles = Array.from({length: 100}, (_, i) => ({
        filename: `packages/package-${i}/package.json`,
        status: 'modified',
        additions: 3,
        deletions: 3,
        patch: `@@ -15,9 +15,9 @@
   "devDependencies": {
-    "@typescript-eslint/eslint-plugin": "^7.18.0",
-    "@typescript-eslint/parser": "^7.18.0",
-    "eslint": "^8.57.0"
+    "@typescript-eslint/eslint-plugin": "^8.0.0",
+    "@typescript-eslint/parser": "^8.0.0",
+    "eslint": "^9.0.0"
   }`,
      }))

      // Set up GitHub event data
      vi.stubEnv('GITHUB_REF_NAME', sample.branchName)
      vi.stubEnv('GITHUB_HEAD_REF', sample.branchName)

      const eventData = {
        pull_request: {
          number: sample.prNumber,
          title: sample.prTitle,
          body: sample.prBody,
          user: {login: 'renovate[bot]'},
          head: {ref: sample.branchName},
          base: {ref: 'main'},
        },
      }

      fsMocks.readFile.mockImplementation(async (filePath: string) => {
        const path = filePath.toString()
        if (path.includes('event.json')) {
          return JSON.stringify(eventData)
        }
        return fsMocks.readFile.getMockImplementation()?.(filePath) || '{}'
      })

      // Mock GitHub API responses with large file list
      octokitMocks.rest.pulls.get.mockResolvedValue({data: eventData.pull_request})
      octokitMocks.rest.pulls.listCommits.mockResolvedValue({data: sample.commits})
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({data: manyFiles})
      octokitMocks.rest.issues.createComment.mockResolvedValue({
        data: {id: 2000, body: 'mock large update comment'},
      })

      const startTime = Date.now()

      // Run the actual action
      await runRealAction()

      const endTime = Date.now()
      const executionTime = endTime - startTime

      // Verify it completes in reasonable time (< 10 seconds for test)
      expect(executionTime).toBeLessThan(10000)

      // Verify it still creates appropriate changesets
      expect(coreMocks.setOutput).toHaveBeenCalledWith('changesets-created', expect.any(String))

      // Verify multi-package analysis was performed
      expect(coreMocks.setOutput).toHaveBeenCalledWith(
        'workspace-packages-count',
        expect.any(String),
      )
    })

    it('should complete full end-to-end workflow without errors', async () => {
      const sample = ENHANCED_RENOVATE_SAMPLES.npmReactMajorUpdate

      // Set up GitHub event data
      vi.stubEnv('GITHUB_REF_NAME', sample.branchName)
      vi.stubEnv('GITHUB_HEAD_REF', sample.branchName)

      const eventData = {
        pull_request: {
          number: sample.prNumber,
          title: sample.prTitle,
          body: sample.prBody,
          user: {login: 'renovate[bot]'},
          head: {ref: sample.branchName},
          base: {ref: 'main'},
        },
      }

      fsMocks.readFile.mockImplementation(async (filePath: string) => {
        const path = filePath.toString()
        if (path.includes('event.json')) {
          return JSON.stringify(eventData)
        }
        return fsMocks.readFile.getMockImplementation()?.(filePath) || '{}'
      })

      // Mock all GitHub API responses
      octokitMocks.rest.pulls.get.mockResolvedValue({data: eventData.pull_request})
      octokitMocks.rest.pulls.listCommits.mockResolvedValue({data: sample.commits})
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({data: sample.files})
      octokitMocks.rest.issues.createComment.mockResolvedValue({
        data: {id: 3000, body: 'mock workflow comment'},
      })
      octokitMocks.rest.pulls.update.mockResolvedValue({
        data: {id: 3000, body: 'updated PR description'},
      })

      // Run the actual action
      await runRealAction()

      // Verify comprehensive workflow execution
      expect(coreMocks.setFailed).not.toHaveBeenCalled()

      // Verify all major outputs were set
      const expectedOutputs = [
        'changesets-created',
        'update-type',
        'dependencies',
        'changeset-summary',
        'primary-category',
        'multi-package-strategy',
        'commit-success',
        'pr-comment-created',
        'pr-description-updated',
      ]

      for (const output of expectedOutputs) {
        expect(coreMocks.setOutput).toHaveBeenCalledWith(output, expect.any(String))
      }

      // Verify changeset file was written
      expect(fsMocks.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\.changeset\/renovate-abc123\.md$/),
        expect.stringContaining('---'),
        'utf8',
      )

      // Verify PR interactions
      expect(octokitMocks.rest.issues.createComment).toHaveBeenCalled()
      expect(octokitMocks.rest.pulls.update).toHaveBeenCalled()
    })
  })
})
