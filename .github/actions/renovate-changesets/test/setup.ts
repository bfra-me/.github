import process from 'node:process'
import {beforeEach, vi} from 'vitest'

/**
 * Global GitHub Actions environment mocks
 */
export const mockedGitHubActions = {
  core: {
    getInput: vi.fn(),
    getBooleanInput: vi.fn(),
    getMultilineInput: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    notice: vi.fn(),
    setFailed: vi.fn(),
    setOutput: vi.fn(),
    exportVariable: vi.fn(),
    addPath: vi.fn(),
    group: vi.fn(),
    saveState: vi.fn(),
    getState: vi.fn(),
    startGroup: vi.fn(),
    endGroup: vi.fn(),
    summary: {
      addRaw: vi.fn().mockReturnThis(),
      addTable: vi.fn().mockReturnThis(),
      addDetails: vi.fn().mockReturnThis(),
      addCodeBlock: vi.fn().mockReturnThis(),
      write: vi.fn().mockResolvedValue(undefined),
    },
  },
  github: {
    context: {
      payload: {},
      eventName: 'pull_request',
      sha: 'test-sha',
      ref: 'refs/heads/test-branch',
      workflow: 'test-workflow',
      action: 'test-action',
      actor: 'test-actor',
      job: 'test-job',
      runNumber: 1,
      runId: 1,
      repo: {
        owner: 'test-owner',
        repo: 'test-repo',
      },
      issue: {
        owner: 'test-owner',
        repo: 'test-repo',
        number: 1,
      },
    },
    getOctokit: vi.fn(),
  },
  exec: {
    exec: vi.fn(),
    getExecOutput: vi.fn(),
  },
}

/**
 * Octokit API mocks
 */
export const mockedOctokit = {
  rest: {
    pulls: {
      get: vi.fn(),
      list: vi.fn(),
      listFiles: vi.fn(),
      listCommits: vi.fn(),
      update: vi.fn(),
      createReview: vi.fn(),
      createReviewComment: vi.fn(),
      dismissReview: vi.fn(),
    },
    issues: {
      get: vi.fn(),
      list: vi.fn(),
      createComment: vi.fn(),
      updateComment: vi.fn(),
      deleteComment: vi.fn(),
      listComments: vi.fn(),
    },
    repos: {
      get: vi.fn(),
      getContent: vi.fn(),
      createOrUpdateFileContents: vi.fn(),
      deleteFile: vi.fn(),
      listCommits: vi.fn(),
      getCommit: vi.fn(),
      compareCommits: vi.fn(),
      getBranch: vi.fn(),
      listBranches: vi.fn(),
    },
    git: {
      getRef: vi.fn(),
      createRef: vi.fn(),
      updateRef: vi.fn(),
      deleteRef: vi.fn(),
      getCommit: vi.fn(),
      createCommit: vi.fn(),
      getTree: vi.fn(),
      createTree: vi.fn(),
      getBlob: vi.fn(),
      createBlob: vi.fn(),
    },
    search: {
      issuesAndPullRequests: vi.fn(),
      commits: vi.fn(),
      code: vi.fn(),
    },
  },
  paginate: vi.fn(),
  graphql: vi.fn(),
}

/**
 * File system mocks
 */
export const mockedFileSystem = {
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
  stat: vi.fn(),
  readdir: vi.fn(),
  unlink: vi.fn(),
  rmdir: vi.fn(),
  exists: vi.fn(),
}

/**
 * Changesets API mocks
 */
export const mockedChangesets = {
  write: vi.fn(),
  parse: vi.fn(),
  read: vi.fn(),
  getChangedPackages: vi.fn(),
  assembleReleasePlan: vi.fn(),
}

/**
 * Setup mocks for all external dependencies
 */
vi.mock('@actions/core', () => mockedGitHubActions.core)
vi.mock('@actions/github', () => mockedGitHubActions.github)
vi.mock('@actions/exec', () => mockedGitHubActions.exec)
vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => mockedOctokit),
}))
vi.mock('node:fs', () => ({
  promises: mockedFileSystem,
}))
vi.mock('node:fs/promises', () => mockedFileSystem)
vi.mock('@changesets/write', () => ({
  default: mockedChangesets.write,
}))
vi.mock('@changesets/parse', () => ({
  parse: mockedChangesets.parse,
}))

/**
 * Default test environment setup
 */
beforeEach(() => {
  // Reset all mocks before each test
  vi.clearAllMocks()

  // Setup default environment variables for GitHub Actions
  process.env.GITHUB_WORKSPACE = '/tmp/test-workspace'
  process.env.GITHUB_REPOSITORY = 'test-owner/test-repo'
  process.env.GITHUB_SHA = 'test-sha'
  process.env.GITHUB_REF = 'refs/heads/test-branch'
  process.env.GITHUB_EVENT_NAME = 'pull_request'
  process.env.GITHUB_ACTOR = 'test-actor'
  process.env.GITHUB_TOKEN = 'test-token'

  // Setup default core input mocks
  mockedGitHubActions.core.getInput.mockImplementation((name: string) => {
    const defaults: Record<string, string> = {
      token: 'test-token',
      'working-directory': '/tmp/test-workspace',
      'create-summary': 'true',
      'commit-changesets': 'true',
      'update-pr-description': 'true',
      'default-changeset-type': 'patch',
    }
    return defaults[name] || ''
  })

  mockedGitHubActions.core.getBooleanInput.mockImplementation((name: string) => {
    const booleanDefaults: Record<string, boolean> = {
      'create-summary': true,
      'commit-changesets': true,
      'update-pr-description': true,
      'skip-if-changeset-exists': false,
    }
    return booleanDefaults[name] || false
  })

  // Setup default GitHub context
  mockedGitHubActions.github.context.payload = {
    pull_request: {
      number: 1,
      title: 'test PR',
      body: 'test PR body',
      head: {
        ref: 'test-branch',
        sha: 'test-sha',
      },
      base: {
        ref: 'main',
        sha: 'base-sha',
      },
      user: {
        login: 'renovate[bot]',
        type: 'Bot',
      },
    },
    repository: {
      name: 'test-repo',
      full_name: 'test-owner/test-repo',
      owner: {
        login: 'test-owner',
      },
    },
  }

  // Setup default Octokit responses
  mockedOctokit.rest.pulls.get.mockResolvedValue({
    data: {
      number: 1,
      title: 'test PR',
      body: 'test PR body',
      head: {
        ref: 'test-branch',
        sha: 'test-sha',
      },
      base: {
        ref: 'main',
        sha: 'base-sha',
      },
      user: {
        login: 'renovate[bot]',
        type: 'Bot',
      },
    },
  })

  mockedOctokit.rest.pulls.listFiles.mockResolvedValue({
    data: [],
  })

  mockedOctokit.rest.pulls.listCommits.mockResolvedValue({
    data: [],
  })

  // Setup default file system responses
  mockedFileSystem.access.mockResolvedValue(undefined)
  mockedFileSystem.readFile.mockResolvedValue('{}')
  mockedFileSystem.writeFile.mockResolvedValue(undefined)
  mockedFileSystem.mkdir.mockResolvedValue(undefined)

  // Setup default changeset responses
  mockedChangesets.write.mockResolvedValue(undefined)
})

/**
 * Test utilities for creating mock data
 */
export const createMockPRContext = (overrides: Partial<any> = {}) => ({
  dependencies: [],
  isRenovateBot: true,
  branchName: 'renovate/test-branch',
  prTitle: 'chore(deps): update dependency test-package to v2.0.0',
  prBody: 'This PR contains the following updates...',
  commitMessages: ['chore(deps): update dependency test-package to v2.0.0'],
  isGroupedUpdate: false,
  isSecurityUpdate: false,
  updateType: 'major' as const,
  manager: 'npm' as const,
  files: [],
  ...overrides,
})

export const createMockDependency = (overrides: Partial<any> = {}) => ({
  name: 'test-package',
  currentVersion: '1.0.0',
  newVersion: '2.0.0',
  manager: 'npm' as const,
  updateType: 'major' as const,
  isSecurityUpdate: false,
  securitySeverity: null,
  isGrouped: false,
  packageFile: 'package.json',
  ...overrides,
})

export const createMockPRFile = (overrides: Partial<any> = {}) => ({
  filename: 'package.json',
  status: 'modified',
  additions: 1,
  deletions: 1,
  changes: 2,
  patch: '@@ -1,1 +1,1 @@\n-  "test-package": "^1.0.0"\n+  "test-package": "^2.0.0"',
  ...overrides,
})

export const createMockCommit = (overrides: Partial<any> = {}) => ({
  sha: 'test-sha',
  commit: {
    message: 'chore(deps): update dependency test-package to v2.0.0',
    author: {
      name: 'renovate[bot]',
      email: 'renovate@example.com',
      date: new Date().toISOString(),
    },
  },
  author: {
    login: 'renovate[bot]',
    type: 'Bot',
  },
  ...overrides,
})
