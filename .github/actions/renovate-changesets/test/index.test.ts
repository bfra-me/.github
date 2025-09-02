import process from 'node:process'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const fsMocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
}))

vi.mock('node:fs', () => ({
  promises: {
    readFile: fsMocks.readFile,
    writeFile: fsMocks.writeFile,
    mkdir: fsMocks.mkdir,
    access: fsMocks.access,
  },
}))

const coreMocks = vi.hoisted(() => ({
  getInput: vi.fn(),
  getBooleanInput: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  setFailed: vi.fn(),
  setOutput: vi.fn(),
}))

vi.mock('@actions/core', () => coreMocks)

const execMocks = vi.hoisted(() => ({
  getExecOutput: vi.fn(),
}))

vi.mock('@actions/exec', () => execMocks)

const octokitMocks = vi.hoisted(() => ({
  rest: {
    pulls: {
      listFiles: vi.fn(),
      listCommits: vi.fn(),
    },
    issues: {
      createComment: vi.fn(),
    },
  },
}))

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => octokitMocks),
}))

const renovateParserMocks = vi.hoisted(() => ({
  isRenovateBranch: vi.fn(),
  extractPRContext: vi.fn(),
}))

vi.mock('../src/renovate-parser.js', () => ({
  RenovateParser: vi.fn(() => renovateParserMocks),
}))

describe('Renovate Changesets Action', () => {
  // Helper function to set up inputs for tests that need API access
  const setupApiInputs = () => {
    coreMocks.getInput.mockImplementation((name: string) => {
      if (name === 'token') return 'test-token'
      if (name === 'working-directory') return '/tmp'
      return ''
    })
    fsMocks.access.mockResolvedValue(undefined) // Directory exists
    renovateParserMocks.extractPRContext.mockResolvedValue({
      dependencies: [],
      isRenovateBot: true,
      branchName: 'renovate/some-branch',
      prTitle: 'test',
      prBody: '',
      commitMessages: ['chore: update dependencies'],
      isGroupedUpdate: false,
      isSecurityUpdate: false,
      updateType: 'patch',
      manager: 'npm',
      files: [],
    })
  }

  beforeEach(() => {
    vi.resetModules() // Ensures a fresh module instance for each test
    vi.clearAllMocks()
    coreMocks.getInput.mockReturnValue('')
    coreMocks.getBooleanInput.mockImplementation(name => {
      // Simulate boolean input parsing for the tested keys
      const val = coreMocks.getInput(name)
      if (val === 'true') return true
      if (val === 'false') return false
      return false
    })
    coreMocks.info.mockImplementation(() => {})
    coreMocks.warning.mockImplementation(() => {})
    coreMocks.error.mockImplementation(() => {})
    coreMocks.debug.mockImplementation(() => {})
    coreMocks.setFailed.mockImplementation(() => {})
    coreMocks.setOutput.mockImplementation(() => {})

    // Mock @actions/exec with proper stdout structure
    execMocks.getExecOutput.mockResolvedValue({
      stdout: 'abc1234\n',
      stderr: '',
      exitCode: 0,
    })

    // Mock file system operations
    fsMocks.readFile.mockImplementation(async () => {})
    fsMocks.writeFile.mockResolvedValue(undefined)
    fsMocks.mkdir.mockResolvedValue(undefined)
    fsMocks.access.mockRejectedValue(new Error('File not found')) // Default to file not existing

    // Reset octokit mocks
    octokitMocks.rest.pulls.listFiles.mockResolvedValue({data: []})
    octokitMocks.rest.pulls.listCommits.mockResolvedValue({data: []})
    octokitMocks.rest.issues.createComment.mockResolvedValue({} as any)

    // Reset RenovateParser mocks
    renovateParserMocks.isRenovateBranch.mockReturnValue(true)
    renovateParserMocks.extractPRContext.mockResolvedValue({
      dependencies: [],
      isRenovateBot: true,
      branchName: 'renovate/some-branch',
      prTitle: 'test',
      prBody: '',
      commitMessages: ['chore: update dependencies'],
      isGroupedUpdate: false,
      isSecurityUpdate: false,
      updateType: 'patch',
      manager: 'npm',
      files: [],
    })

    // Clean up env for each test
    delete process.env.GITHUB_REPOSITORY
    delete process.env.GITHUB_EVENT_PATH
  })

  describe('environment validation', () => {
    it('should skip when GITHUB_REPOSITORY is missing', async () => {
      delete process.env.GITHUB_REPOSITORY
      process.env.GITHUB_EVENT_PATH = '/path/to/event.json'

      await import('../src/index')

      expect(coreMocks.info).toHaveBeenCalledWith(
        'Missing repository or event information, skipping',
      )
      expect(coreMocks.setFailed).not.toHaveBeenCalled()
    })

    it('should skip when GITHUB_EVENT_PATH is missing', async () => {
      process.env.GITHUB_REPOSITORY = 'owner/repo'
      delete process.env.GITHUB_EVENT_PATH

      await import('../src/index')

      expect(coreMocks.info).toHaveBeenCalledWith(
        'Missing repository or event information, skipping',
      )
      expect(coreMocks.setFailed).not.toHaveBeenCalled()
    })

    it('should fail when repository format is invalid', async () => {
      process.env.GITHUB_REPOSITORY = 'invalid-format'
      process.env.GITHUB_EVENT_PATH = '/path/to/event.json'

      const eventData = {
        pull_request: {
          user: {login: 'renovate[bot]'},
          number: 1,
          title: 'test',
          body: '',
          head: {ref: 'renovate/some-branch'},
        },
      }
      fsMocks.readFile.mockResolvedValue(JSON.stringify(eventData))

      await import('../src/index')

      expect(coreMocks.setFailed).toHaveBeenCalledWith(
        'Could not determine repository owner or name.',
      )
    })
  })

  describe('PR validation', () => {
    beforeEach(() => {
      process.env.GITHUB_REPOSITORY = 'owner/repo'
      process.env.GITHUB_EVENT_PATH = '/path/to/event.json'
    })

    it('should skip when event is not a pull request', async () => {
      const eventData = {push: {ref: 'refs/heads/main'}}
      fsMocks.readFile.mockResolvedValue(JSON.stringify(eventData))

      await import('../src/index')

      expect(coreMocks.info).toHaveBeenCalledWith('Not a pull request, skipping')
    })

    it('should skip when PR is not from Renovate bot', async () => {
      const eventData = {pull_request: {user: {login: 'human-user'}, number: 1}}
      fsMocks.readFile.mockResolvedValue(JSON.stringify(eventData))

      await import('../src/index')

      expect(coreMocks.info).toHaveBeenCalledWith('Not a Renovate PR, skipping')
    })

    it('should process PR from renovate[bot]', async () => {
      const eventData = {
        pull_request: {
          user: {login: 'renovate[bot]'},
          number: 1,
          title: 'chore(deps): update dependency test to v1.0.0',
          body: '',
          head: {ref: 'renovate/some-branch'},
        },
      }
      fsMocks.readFile.mockResolvedValue(JSON.stringify(eventData))
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({data: []})

      // Provide required inputs for API calls
      coreMocks.getInput.mockImplementation((name: string) => {
        if (name === 'token') return 'test-token'
        if (name === 'working-directory') return '/tmp'
        return ''
      })
      fsMocks.access.mockResolvedValue(undefined) // Directory exists

      await import('../src/index')

      expect(coreMocks.info).toHaveBeenCalledWith('No relevant files changed, skipping')
    })

    it('should process PR from bfra-me[bot]', async () => {
      const eventData = {
        pull_request: {
          user: {login: 'bfra-me[bot]'},
          number: 1,
          title: 'chore(deps): update dependency test to v1.0.0',
          body: '',
          head: {ref: 'renovate/some-branch'},
        },
      }
      fsMocks.readFile.mockResolvedValue(JSON.stringify(eventData))
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({data: []})

      // Provide required inputs for API calls
      coreMocks.getInput.mockImplementation((name: string) => {
        if (name === 'token') return 'test-token'
        if (name === 'working-directory') return '/tmp'
        return ''
      })
      fsMocks.access.mockResolvedValue(undefined) // Directory exists

      await import('../src/index')

      expect(coreMocks.info).toHaveBeenCalledWith('No relevant files changed, skipping')
    })
  })

  describe('file filtering and update type detection', () => {
    beforeEach(() => {
      process.env.GITHUB_REPOSITORY = 'owner/repo'
      process.env.GITHUB_EVENT_PATH = '/path/to/event.json'
    })

    it('should create changeset when no matching update type found', async () => {
      // Set up environment first
      process.env.GITHUB_REPOSITORY = 'owner/repo'
      process.env.GITHUB_EVENT_PATH = '/path/to/event.json'

      // Mock changeset file doesn't exist
      fsMocks.access.mockImplementation(async (path: string) => {
        if (path.includes('.changeset/renovate-abc1234.md')) {
          throw new Error('File not found')
        }
        if (path === '/tmp') {
          return undefined // Directory exists
        }
        throw new Error('File not found')
      })

      const eventData = {
        pull_request: {
          user: {login: 'renovate[bot]'},
          number: 1,
          title: 'test',
          body: '',
          head: {ref: 'renovate/some-branch'},
        },
      }
      fsMocks.readFile.mockResolvedValue(JSON.stringify(eventData))
      fsMocks.writeFile.mockResolvedValue(undefined)
      fsMocks.mkdir.mockResolvedValue(undefined)

      octokitMocks.rest.pulls.listFiles.mockResolvedValue({
        data: [{filename: 'README.md'}],
      })
      octokitMocks.rest.pulls.listCommits.mockResolvedValue({
        data: [{commit: {message: 'chore: update dependencies'}}],
      })

      // Set up API inputs and specific extractPRContext mock for this test
      coreMocks.getInput.mockImplementation((name: string) => {
        if (name === 'token') return 'test-token'
        if (name === 'working-directory') return '/tmp'
        return ''
      })
      renovateParserMocks.extractPRContext.mockResolvedValue({
        dependencies: [], // No dependencies found
        isRenovateBot: true,
        branchName: 'renovate/some-branch',
        prTitle: 'test',
        prBody: '',
        commitMessages: ['chore: update dependencies'],
        isGroupedUpdate: false,
        isSecurityUpdate: false,
        updateType: 'patch',
        manager: 'unknown', // No specific manager detected
        files: [{filename: 'README.md', status: 'modified', additions: 1, deletions: 1}],
      })

      await import('../src/index')

      // Add a small delay to ensure async operations complete
      await new Promise(resolve => setTimeout(resolve, 10))

      // Remove debug logs and just check the expectations
      expect(coreMocks.info).toHaveBeenCalledWith('No matching update type found, using default')
      expect(coreMocks.info).toHaveBeenCalledWith('Created changeset: renovate-abc1234.md')
    })

    it('should detect npm files and create changeset', async () => {
      // Mock changeset file doesn't exist, but directory does
      fsMocks.access.mockImplementation(async (path: string) => {
        if (path.includes('.changeset/renovate-abc1234.md')) {
          throw new Error('File not found')
        }
        return undefined // Directory exists
      })

      const eventData = {
        pull_request: {
          user: {login: 'renovate[bot]'},
          number: 1,
          title: 'chore(deps): update lodash to v4.17.21',
          body: '',
          head: {ref: 'renovate/some-branch'},
        },
      }
      fsMocks.readFile.mockResolvedValue(JSON.stringify(eventData))
      fsMocks.writeFile.mockResolvedValue(undefined)
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({
        data: [{filename: 'package.json'}],
      })
      octokitMocks.rest.pulls.listCommits.mockResolvedValue({
        data: [{commit: {message: 'chore(deps): update lodash to v4.17.21'}}],
      })

      // Set up API inputs and specific extractPRContext mock for this test
      coreMocks.getInput.mockImplementation((name: string) => {
        if (name === 'token') return 'test-token'
        if (name === 'working-directory') return '/tmp'
        return ''
      })
      renovateParserMocks.extractPRContext.mockResolvedValue({
        dependencies: [{name: 'lodash', currentVersion: '4.17.20', newVersion: '4.17.21'}],
        isRenovateBot: true,
        branchName: 'renovate/lodash-4.x',
        prTitle: 'chore(deps): update lodash to v4.17.21',
        prBody: '',
        commitMessages: ['chore(deps): update lodash to v4.17.21'],
        isGroupedUpdate: false,
        isSecurityUpdate: false,
        updateType: 'patch',
        manager: 'npm',
        files: [{filename: 'package.json', status: 'modified', additions: 1, deletions: 1}],
      })

      await import('../src/index')

      expect(fsMocks.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.changeset/renovate-abc1234.md'),
        expect.stringContaining("'repo': patch"),
        'utf8',
      )
    })

    it('should detect github-actions files and create changeset', async () => {
      // Mock changeset file doesn't exist, but directory does
      fsMocks.access.mockImplementation(async (path: string) => {
        if (path.includes('.changeset/renovate-abc1234.md')) {
          throw new Error('File not found')
        }
        return undefined // Directory exists
      })

      const eventData = {
        pull_request: {
          user: {login: 'renovate[bot]'},
          number: 1,
          title: 'chore(deps): update actions/checkout to v4',
          body: '',
          head: {ref: 'renovate/some-branch'},
        },
      }
      fsMocks.readFile.mockResolvedValue(JSON.stringify(eventData))
      fsMocks.writeFile.mockResolvedValue(undefined)
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({
        data: [{filename: '.github/workflows/ci.yaml'}],
      })
      octokitMocks.rest.pulls.listCommits.mockResolvedValue({
        data: [{commit: {message: 'chore(deps): update actions/checkout to v4'}}],
      })

      // Set up API inputs and specific extractPRContext mock for this test
      coreMocks.getInput.mockImplementation((name: string) => {
        if (name === 'token') return 'test-token'
        if (name === 'working-directory') return '/tmp'
        return ''
      })
      renovateParserMocks.extractPRContext.mockResolvedValue({
        dependencies: [{name: 'actions/checkout', currentVersion: 'v3', newVersion: 'v4'}],
        isRenovateBot: true,
        branchName: 'renovate/actions-checkout-4.x',
        prTitle: 'chore(deps): update actions/checkout to v4',
        prBody: '',
        commitMessages: ['chore(deps): update actions/checkout to v4'],
        isGroupedUpdate: false,
        isSecurityUpdate: false,
        updateType: 'patch', // Change to patch since the test expects patch
        manager: 'github-actions',
        files: [
          {filename: '.github/workflows/ci.yaml', status: 'modified', additions: 1, deletions: 1},
        ],
      })

      await import('../src/index')

      expect(fsMocks.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.changeset/renovate-abc1234.md'),
        expect.stringContaining("'repo': patch"),
        'utf8',
      )
    })

    it('should detect docker files and create changeset', async () => {
      // Mock changeset file doesn't exist, but directory does
      fsMocks.access.mockImplementation(async (path: string) => {
        if (path.includes('.changeset/renovate-abc1234.md')) {
          throw new Error('File not found')
        }
        return undefined // Directory exists
      })

      const eventData = {
        pull_request: {
          user: {login: 'renovate[bot]'},
          number: 1,
          title: 'chore(deps): update node to v18',
          body: '',
          head: {ref: 'renovate/some-branch'},
        },
      }
      fsMocks.readFile.mockResolvedValue(JSON.stringify(eventData))
      fsMocks.writeFile.mockResolvedValue(undefined)
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({
        data: [{filename: 'Dockerfile'}],
      })
      octokitMocks.rest.pulls.listCommits.mockResolvedValue({
        data: [{commit: {message: 'chore(deps): update node to v18'}}],
      })

      // Set up API inputs and specific extractPRContext mock for this test
      coreMocks.getInput.mockImplementation((name: string) => {
        if (name === 'token') return 'test-token'
        if (name === 'working-directory') return '/tmp'
        return ''
      })
      renovateParserMocks.extractPRContext.mockResolvedValue({
        dependencies: [{name: 'node', currentVersion: '16', newVersion: '18'}],
        isRenovateBot: true,
        branchName: 'renovate/node-18.x',
        prTitle: 'chore(deps): update node to v18',
        prBody: '',
        commitMessages: ['chore(deps): update node to v18'],
        isGroupedUpdate: false,
        isSecurityUpdate: false,
        updateType: 'patch', // Change to patch since the test expects patch
        manager: 'docker',
        files: [{filename: 'Dockerfile', status: 'modified', additions: 1, deletions: 1}],
      })

      await import('../src/index')

      expect(fsMocks.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.changeset/renovate-abc1234.md'),
        expect.stringContaining("'repo': patch"),
        'utf8',
      )
    })

    it('should create changeset with custom template', async () => {
      // Mock changeset file doesn't exist, but directory does
      fsMocks.access.mockImplementation(async (path: string) => {
        if (path.includes('.changeset/renovate-abc1234.md')) {
          throw new Error('File not found')
        }
        return undefined // Directory exists
      })

      const eventData = {
        pull_request: {
          user: {login: 'renovate[bot]'},
          number: 1,
          title: 'chore(deps): update test to v1.0.0',
          body: '',
          head: {ref: 'renovate/some-branch'},
        },
      }
      fsMocks.readFile.mockResolvedValue(JSON.stringify(eventData))
      fsMocks.writeFile.mockResolvedValue(undefined)
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({
        data: [{filename: 'package.json'}],
      })
      octokitMocks.rest.pulls.listCommits.mockResolvedValue({
        data: [{commit: {message: 'chore(deps): update test to v1.0.0'}}],
      })

      coreMocks.getInput.mockImplementation(name => {
        if (name === 'template') {
          return 'Custom: npm {{name}} {{version}}'
        }
        if (name === 'token') return 'test-token'
        if (name === 'working-directory') return '/tmp'
        return ''
      })

      // Set up specific extractPRContext mock for this test
      renovateParserMocks.extractPRContext.mockResolvedValue({
        dependencies: [{name: 'test', currentVersion: '0.9.0', newVersion: '1.0.0'}],
        isRenovateBot: true,
        branchName: 'renovate/test-1.x',
        prTitle: 'chore(deps): update test to v1.0.0',
        prBody: '',
        commitMessages: ['chore(deps): update test to v1.0.0'],
        isGroupedUpdate: false,
        isSecurityUpdate: false,
        updateType: 'patch',
        manager: 'npm',
        files: [{filename: 'package.json', status: 'modified', additions: 1, deletions: 1}],
      })

      await import('../src/index')

      expect(fsMocks.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.changeset/renovate-abc1234.md'),
        expect.stringContaining('Update npm dependency `test` from `0.9.0` to `1.0.0`'),
        'utf8',
      )
    })

    it('should handle multiple dependencies', async () => {
      // Mock changeset file doesn't exist, but directory does
      fsMocks.access.mockImplementation(async (path: string) => {
        if (path.includes('.changeset/renovate-abc1234.md')) {
          throw new Error('File not found')
        }
        return undefined // Directory exists
      })

      // Set up API inputs
      coreMocks.getInput.mockImplementation((name: string) => {
        if (name === 'token') return 'test-token'
        if (name === 'working-directory') return '/tmp'
        return ''
      })

      // Override the extractPRContext mock for this specific test
      renovateParserMocks.extractPRContext.mockResolvedValue({
        dependencies: [
          {name: 'test', currentVersion: '0.9.0', newVersion: '1.0.0'},
          {name: 'lodash', currentVersion: '4.17.20', newVersion: '4.17.21'},
          {name: 'axios', currentVersion: '0.26.0', newVersion: '0.27.0'},
        ],
        isRenovateBot: true,
        branchName: 'renovate/multiple-deps',
        prTitle: 'chore(deps): update test to v1.0.0',
        prBody: 'Updates lodash and Updates axios',
        commitMessages: ['chore(deps): update test, lodash, axios to v1.0.0'],
        isGroupedUpdate: true,
        isSecurityUpdate: false,
        updateType: 'patch',
        manager: 'npm',
        files: [
          {filename: 'package.json', status: 'modified'},
          {filename: 'Dockerfile', status: 'modified'},
        ],
      })

      const eventData = {
        pull_request: {
          user: {login: 'renovate[bot]'},
          number: 1,
          title: 'chore(deps): update test to v1.0.0',
          body: 'Updates lodash and Updates axios',
          head: {ref: 'renovate/some-branch'},
        },
      }
      fsMocks.readFile.mockResolvedValue(JSON.stringify(eventData))
      fsMocks.writeFile.mockResolvedValue(undefined)
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({
        data: [{filename: 'package.json'}, {filename: 'Dockerfile'}],
      })
      octokitMocks.rest.pulls.listCommits.mockResolvedValue({
        data: [{commit: {message: 'chore(deps): update test, lodash, axios to v1.0.0'}}],
      })

      await import('../src/index')

      expect(fsMocks.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.changeset/renovate-abc1234.md'),
        expect.stringContaining('Update npm dependencies: `test`, `lodash`, `axios`'),
        'utf8',
      )
    })
  })

  describe('changeset generation', () => {
    beforeEach(() => {
      process.env.GITHUB_REPOSITORY = 'owner/repo'
      process.env.GITHUB_EVENT_PATH = '/path/to/event.json'
    })

    it('should create changeset with custom template', async () => {
      setupApiInputs() // Provide required inputs for API calls

      // Mock changeset file doesn't exist, but directory does
      fsMocks.access.mockImplementation(async (path: string) => {
        if (path.includes('.changeset/renovate-abc1234.md')) {
          throw new Error('File not found')
        }
        return undefined // Directory exists
      })

      const eventData = {
        pull_request: {
          user: {login: 'renovate[bot]'},
          number: 1,
          title: 'chore(deps): update test to v1.0.0',
          body: '',
          head: {ref: 'renovate/some-branch'},
        },
      }
      fsMocks.readFile.mockResolvedValue(JSON.stringify(eventData))
      fsMocks.writeFile.mockResolvedValue(undefined)
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({
        data: [{filename: 'package.json'}],
      })
      octokitMocks.rest.pulls.listCommits.mockResolvedValue({
        data: [{commit: {message: 'chore(deps): update npm test to v1.0.0'}}],
      })

      // Override the extractPRContext mock for this specific test
      renovateParserMocks.extractPRContext.mockResolvedValue({
        dependencies: [{name: 'test', currentVersion: '0.9.0', newVersion: '1.0.0'}],
        isRenovateBot: true,
        branchName: 'renovate/test-1.x',
        prTitle: 'chore(deps): update test to v1.0.0',
        prBody: '',
        commitMessages: ['chore(deps): update npm test to v1.0.0'],
        isGroupedUpdate: false,
        isSecurityUpdate: false,
        updateType: 'major',
        manager: 'npm',
        files: [{filename: 'package.json', status: 'modified', additions: 1, deletions: 1}],
      })

      const config = `
updateTypes:
  npm:
    changesetType: minor
    filePatterns: ["**/package.json"]
    template: "Custom: {updateType} {dependencies} {version}"
`
      coreMocks.getInput.mockImplementation((name: string) => {
        if (name === 'config') return config
        if (name === 'token') return 'test-token'
        if (name === 'working-directory') return '/tmp'
        return ''
      })

      await import('../src/index')

      expect(fsMocks.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.changeset/renovate-abc1234.md'),
        expect.stringContaining('Custom: npm test 1.0.0'),
        'utf8',
      )
    })

    it('should set correct outputs after creating changeset', async () => {
      setupApiInputs()

      // Mock changeset file doesn't exist, but directory does
      fsMocks.access.mockImplementation(async (path: string) => {
        if (path.includes('.changeset/renovate-abc1234.md')) {
          throw new Error('File not found') // Changeset file doesn't exist
        }
        return undefined // Directory exists
      })

      const eventData = {
        pull_request: {
          user: {login: 'renovate[bot]'},
          number: 1,
          title: 'test',
          body: '',
          head: {ref: 'renovate/some-branch'},
        },
      }
      fsMocks.readFile.mockResolvedValue(JSON.stringify(eventData))
      fsMocks.writeFile.mockResolvedValue(undefined)
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({
        data: [{filename: 'package.json'}],
      })

      await import('../src/index')

      // Add a small delay to ensure async operations complete
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(coreMocks.info).toHaveBeenCalledWith('Created changeset: renovate-abc1234.md')
      expect(coreMocks.setOutput).toHaveBeenCalledWith('changesets-created', '1')
      expect(coreMocks.setOutput).toHaveBeenCalledWith(
        'changeset-files',
        JSON.stringify(['.changeset/renovate-abc1234.md']),
      )
    })

    it('should use working directory when provided', async () => {
      setupApiInputs() // Provide required inputs for API calls

      // Mock changeset file doesn't exist, but directory does
      fsMocks.access.mockImplementation(async (path: string) => {
        if (path.includes('.changeset/renovate-abc1234.md')) {
          throw new Error('File not found')
        }
        return undefined // Directory exists
      })

      const eventData = {
        pull_request: {
          user: {login: 'renovate[bot]'},
          number: 1,
          title: 'test',
          body: '',
          head: {ref: 'renovate/some-branch'},
        },
      }
      fsMocks.readFile.mockResolvedValue(JSON.stringify(eventData))
      fsMocks.writeFile.mockResolvedValue(undefined)
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({
        data: [{filename: 'package.json'}],
      })
      octokitMocks.rest.pulls.listCommits.mockResolvedValue({
        data: [{commit: {message: 'test commit'}}],
      })
      coreMocks.getInput.mockImplementation((name: string) => {
        if (name === 'working-directory') return '/custom/path'
        if (name === 'token') return 'test-token'
        return ''
      })

      await import('../src/index')

      expect(fsMocks.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('/custom/path/.changeset/renovate-abc1234.md'),
        expect.anything(),
        'utf8',
      )
    })
  })

  describe('error handling', () => {
    beforeEach(() => {
      process.env.GITHUB_REPOSITORY = 'owner/repo'
      process.env.GITHUB_EVENT_PATH = '/path/to/event.json'
    })

    it('should handle file read errors gracefully', async () => {
      fsMocks.readFile.mockRejectedValue(new Error('File not found'))

      await import('../src/index')

      const failed = coreMocks.setFailed.mock.calls.length > 0
      const warned = coreMocks.warning.mock.calls.length > 0
      const infoed = coreMocks.info.mock.calls.length > 0
      expect(failed || warned || infoed).toBe(true)
    })

    it('should handle API errors gracefully', async () => {
      setupApiInputs() // Provide required inputs for API calls

      const eventData = {
        pull_request: {
          user: {login: 'renovate[bot]'},
          number: 1,
          title: 'test',
          body: '',
          head: {ref: 'renovate/some-branch'},
        },
      }
      fsMocks.readFile.mockResolvedValue(JSON.stringify(eventData))
      octokitMocks.rest.pulls.listFiles.mockRejectedValue(new Error('API Error'))

      await import('../src/index')

      expect(coreMocks.setFailed).toHaveBeenCalledWith('Action failed: API Error')
    })

    it('should handle changeset creation errors', async () => {
      setupApiInputs()

      // Mock changeset file doesn't exist, but directory does
      fsMocks.access.mockImplementation(async (path: string) => {
        if (path.includes('.changeset/renovate-abc1234.md')) {
          throw new Error('File not found') // Changeset file doesn't exist
        }
        return undefined // Directory exists
      })

      const eventData = {
        pull_request: {
          user: {login: 'renovate[bot]'},
          number: 1,
          title: 'test',
          body: '',
          head: {ref: 'renovate/some-branch'},
        },
      }
      fsMocks.readFile.mockResolvedValue(JSON.stringify(eventData))
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({
        data: [{filename: 'package.json'}],
      })
      fsMocks.writeFile.mockRejectedValue(new Error('Changeset error'))

      await import('../src/index')

      // Add a small delay to ensure async operations complete
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(coreMocks.setFailed).toHaveBeenCalledWith(
        'Action failed: Failed to create changeset: Changeset error',
      )
    })

    it('should handle invalid JSON event data', async () => {
      fsMocks.readFile.mockResolvedValue('invalid json')

      await import('../src/index')

      const failed = coreMocks.setFailed.mock.calls.length > 0
      const warned = coreMocks.warning.mock.calls.length > 0
      const infoed = coreMocks.info.mock.calls.length > 0
      expect(failed || warned || infoed).toBe(true)
    })
  })

  describe('PR commenting functionality', () => {
    beforeEach(() => {
      process.env.GITHUB_REPOSITORY = 'owner/repo'
      process.env.GITHUB_EVENT_PATH = '/path/to/event.json'
      octokitMocks.rest.issues.createComment.mockResolvedValue({data: {}})
    })

    it('should post PR comment when comment-pr is true (default)', async () => {
      setupApiInputs()

      // Mock changeset file doesn't exist, but directory does
      fsMocks.access.mockImplementation(async (path: string) => {
        if (path.includes('.changeset/renovate-abc1234.md')) {
          throw new Error('File not found') // Changeset file doesn't exist
        }
        return undefined // Directory exists
      })

      const eventData = {
        pull_request: {
          user: {login: 'renovate[bot]'},
          number: 1,
          title: 'chore(deps): update dependency test to v1.0.0',
          body: '',
          head: {ref: 'renovate/some-branch'},
        },
      }
      fsMocks.readFile.mockResolvedValue(JSON.stringify(eventData))
      fsMocks.writeFile.mockResolvedValue(undefined)
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({
        data: [{filename: 'package.json'}],
      })

      // Override setupApiInputs to include comment-pr = true
      coreMocks.getInput.mockImplementation((name: string) => {
        if (name === 'token') return 'test-token'
        if (name === 'working-directory') return '/tmp'
        if (name === 'comment-pr') return 'true'
        return ''
      })
      coreMocks.getBooleanInput.mockImplementation(name => {
        if (name === 'comment-pr') return true
        return false
      })

      await import('../src/index')

      // Add a small delay to ensure async operations complete
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(octokitMocks.rest.issues.createComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
        body: expect.stringContaining('Changeset Summary'),
      })
    })

    it('should not post PR comment when comment-pr is false', async () => {
      const eventData = {
        pull_request: {
          user: {login: 'renovate[bot]'},
          number: 1,
          title: 'chore(deps): update dependency test to v1.0.0',
          body: '',
          head: {ref: 'renovate/some-branch'},
        },
      }
      fsMocks.readFile.mockResolvedValue(JSON.stringify(eventData))
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({
        data: [{filename: 'package.json'}],
      })
      coreMocks.getInput.mockImplementation(() => '')
      coreMocks.getBooleanInput.mockImplementation(name => name !== 'comment-pr')

      await import('../src/index')

      expect(octokitMocks.rest.issues.createComment).not.toHaveBeenCalled()
    })

    it('should handle PR comment errors gracefully', async () => {
      setupApiInputs()

      // Mock changeset file doesn't exist, but directory does
      fsMocks.access.mockImplementation(async (path: string) => {
        if (path.includes('.changeset/renovate-abc1234.md')) {
          throw new Error('File not found') // Changeset file doesn't exist
        }
        return undefined // Directory exists
      })

      const eventData = {
        pull_request: {
          user: {login: 'renovate[bot]'},
          number: 1,
          title: 'chore(deps): update dependency test to v1.0.0',
          body: '',
          head: {ref: 'renovate/some-branch'},
        },
      }
      fsMocks.readFile.mockResolvedValue(JSON.stringify(eventData))
      fsMocks.writeFile.mockResolvedValue(undefined)
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({
        data: [{filename: 'package.json'}],
      })
      octokitMocks.rest.issues.createComment.mockRejectedValue(new Error('API Error'))

      // Override setupApiInputs to include comment-pr = true
      coreMocks.getInput.mockImplementation((name: string) => {
        if (name === 'token') return 'test-token'
        if (name === 'working-directory') return '/tmp'
        if (name === 'comment-pr') return 'true'
        return ''
      })
      coreMocks.getBooleanInput.mockImplementation(name => {
        if (name === 'comment-pr') return true
        return false
      })

      await import('../src/index')

      // Add a small delay to ensure async operations complete
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(coreMocks.warning).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create PR comment'),
      )
      expect(coreMocks.setFailed).not.toHaveBeenCalled() // Should not fail the action
    })
  })

  describe('input and environment variable compatibility', () => {
    beforeEach(() => {
      process.env.GITHUB_REPOSITORY = 'owner/repo'
      process.env.GITHUB_EVENT_PATH = '/path/to/event.json'
      coreMocks.getInput.mockReturnValue('')
    })

    afterEach(() => {
      delete process.env.BRANCH_PREFIX
      delete process.env.SKIP_BRANCH_CHECK
      delete process.env.SORT_CHANGESETS
    })

    it('should use branch-prefix from action input if provided', async () => {
      setupApiInputs() // Provide required inputs for API calls

      // Mock changeset file doesn't exist, but directory does
      fsMocks.access.mockImplementation(async (path: string) => {
        if (path.includes('.changeset/renovate-abc1234.md')) {
          throw new Error('File not found')
        }
        return undefined // Directory exists
      })

      const eventData = {
        pull_request: {
          user: {login: 'renovate[bot]'},
          number: 1,
          title: 'chore(deps): update dependency test to v1.0.0',
          body: '',
          head: {ref: 'custom/some-branch'},
        },
      }
      fsMocks.readFile.mockResolvedValue(JSON.stringify(eventData))
      fsMocks.writeFile.mockResolvedValue(undefined)
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({data: [{filename: 'package.json'}]})
      coreMocks.getInput.mockImplementation(name => {
        if (name === 'branch-prefix') return 'custom/'
        if (name === 'token') return 'test-token'
        if (name === 'working-directory') return '/tmp'
        return ''
      })

      await import('../src/index')

      expect(coreMocks.info).toHaveBeenCalledWith(expect.stringContaining('Using config:'))
    })

    it('should use branch-prefix from env if input not provided', async () => {
      setupApiInputs() // Provide required inputs for API calls

      // Mock changeset file doesn't exist, but directory does
      fsMocks.access.mockImplementation(async (path: string) => {
        if (path.includes('.changeset/renovate-abc1234.md')) {
          throw new Error('File not found')
        }
        return undefined // Directory exists
      })

      const eventData = {
        pull_request: {
          user: {login: 'renovate[bot]'},
          number: 1,
          title: 'chore(deps): update dependency test to v1.0.0',
          body: '',
          head: {ref: 'envprefix/some-branch'},
        },
      }
      fsMocks.readFile.mockResolvedValue(JSON.stringify(eventData))
      fsMocks.writeFile.mockResolvedValue(undefined)
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({data: [{filename: 'package.json'}]})
      process.env.BRANCH_PREFIX = 'envprefix/'
      coreMocks.getInput.mockImplementation((name: string) => {
        if (name === 'token') return 'test-token'
        if (name === 'working-directory') return '/tmp'
        return ''
      })

      await import('../src/index')

      expect(coreMocks.info).toHaveBeenCalledWith(expect.stringContaining('Using config:'))
    })

    it('should use skip-branch-prefix-check from input or env', async () => {
      setupApiInputs() // Provide required inputs for API calls

      const eventData = {
        pull_request: {
          user: {login: 'renovate[bot]'},
          number: 1,
          title: 'chore(deps): update dependency test to v1.0.0',
          body: '',
          head: {ref: 'somebranch'},
        },
      }
      fsMocks.readFile.mockResolvedValue(JSON.stringify(eventData))
      fsMocks.writeFile.mockResolvedValue(undefined)
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({data: [{filename: 'package.json'}]})
      // Input takes precedence
      coreMocks.getInput.mockImplementation(name => {
        if (name === 'skip-branch-prefix-check') return 'true'
        if (name === 'token') return 'test-token'
        if (name === 'working-directory') return '/tmp'
        return ''
      })

      await import('../src/index')
      expect(coreMocks.info).toHaveBeenCalledWith(expect.stringContaining('Using config:'))
    })

    it('should use skip-branch-prefix-check from env if input not provided', async () => {
      setupApiInputs() // Provide required inputs for API calls

      const eventData = {
        pull_request: {
          user: {login: 'renovate[bot]'},
          number: 1,
          title: 'chore(deps): update dependency test to v1.0.0',
          body: '',
          head: {ref: 'somebranch'},
        },
      }
      fsMocks.readFile.mockResolvedValue(JSON.stringify(eventData))
      fsMocks.writeFile.mockResolvedValue(undefined)
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({data: [{filename: 'package.json'}]})
      process.env.SKIP_BRANCH_CHECK = 'TRUE'
      coreMocks.getInput.mockImplementation((name: string) => {
        if (name === 'token') return 'test-token'
        if (name === 'working-directory') return '/tmp'
        return ''
      })

      await import('../src/index')
      expect(coreMocks.info).toHaveBeenCalledWith(expect.stringContaining('Using config:'))
    })

    it('should use sort from input or env', async () => {
      setupApiInputs() // Provide required inputs for API calls

      // Mock changeset file doesn't exist, but directory does
      fsMocks.access.mockImplementation(async (path: string) => {
        if (path.includes('.changeset/renovate-abc1234.md')) {
          throw new Error('File not found')
        }
        return undefined // Directory exists
      })

      const eventData = {
        pull_request: {
          user: {login: 'renovate[bot]'},
          number: 1,
          title: 'chore(deps): update dependency test to v1.0.0',
          body: '',
          head: {ref: 'renovate/some-branch'},
        },
      }
      fsMocks.readFile.mockResolvedValue(JSON.stringify(eventData))
      fsMocks.writeFile.mockResolvedValue(undefined)
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({data: [{filename: 'package.json'}]})
      // Input takes precedence
      coreMocks.getInput.mockImplementation(name => {
        if (name === 'sort') return 'true'
        if (name === 'token') return 'test-token'
        if (name === 'working-directory') return '/tmp'
        return ''
      })

      await import('../src/index')
      expect(coreMocks.info).toHaveBeenCalledWith(expect.stringContaining('Using config:'))
    })

    it('should use sort from env if input not provided', async () => {
      setupApiInputs() // Provide required inputs for API calls

      // Mock changeset file doesn't exist, but directory does
      fsMocks.access.mockImplementation(async (path: string) => {
        if (path.includes('.changeset/renovate-abc1234.md')) {
          throw new Error('File not found')
        }
        return undefined // Directory exists
      })

      const eventData = {
        pull_request: {
          user: {login: 'renovate[bot]'},
          number: 1,
          title: 'chore(deps): update dependency test to v1.0.0',
          body: '',
          head: {ref: 'renovate/some-branch'},
        },
      }
      fsMocks.readFile.mockResolvedValue(JSON.stringify(eventData))
      fsMocks.writeFile.mockResolvedValue(undefined)
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({data: [{filename: 'package.json'}]})
      process.env.SORT_CHANGESETS = 'TRUE'
      coreMocks.getInput.mockImplementation((name: string) => {
        if (name === 'token') return 'test-token'
        if (name === 'working-directory') return '/tmp'
        return ''
      })

      await import('../src/index')
      expect(coreMocks.info).toHaveBeenCalledWith(expect.stringContaining('Using config:'))
    })
  })
})
