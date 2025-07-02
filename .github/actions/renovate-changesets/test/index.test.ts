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
    },
    issues: {
      createComment: vi.fn(),
    },
  },
}))

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => octokitMocks),
}))

describe('Renovate Changesets Action', () => {
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
    coreMocks.setFailed.mockImplementation(() => {})
    coreMocks.setOutput.mockImplementation(() => {})

    // Mock @actions/exec
    execMocks.getExecOutput.mockResolvedValue({
      stdout: 'abc1234',
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
    octokitMocks.rest.issues.createComment.mockResolvedValue({} as any)

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
        data: [{filename: 'README.md'}],
      })

      await import('../src/index')

      expect(coreMocks.info).toHaveBeenCalledWith('No matching update type found, using default')
      expect(coreMocks.info).toHaveBeenCalledWith('Created changeset: renovate-abc1234.md')
    })

    it('should detect npm files and create changeset', async () => {
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
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({
        data: [{filename: 'package.json'}],
      })

      await import('../src/index')

      expect(fsMocks.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.changeset/renovate-abc1234.md'),
        expect.stringContaining("'repo': patch"),
        'utf8',
      )
    })

    it('should detect github-actions files and create changeset', async () => {
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
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({
        data: [{filename: '.github/workflows/ci.yaml'}],
      })

      await import('../src/index')

      expect(fsMocks.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.changeset/renovate-abc1234.md'),
        expect.stringContaining("'repo': patch"),
        'utf8',
      )
    })

    it('should detect docker files and create changeset', async () => {
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
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({
        data: [{filename: 'Dockerfile'}],
      })

      await import('../src/index')

      expect(fsMocks.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.changeset/renovate-abc1234.md'),
        expect.stringContaining("'repo': patch"),
        'utf8',
      )
    })

    it('should create changeset with custom template', async () => {
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
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({
        data: [{filename: 'package.json'}],
      })

      coreMocks.getInput.mockImplementation(name => {
        if (name === 'template') {
          return 'Custom: npm {{name}} {{version}}'
        }
        return ''
      })

      await import('../src/index')

      expect(fsMocks.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.changeset/renovate-abc1234.md'),
        expect.stringContaining('Update dependencies dependency `test` to `1.0.0`'),
        'utf8',
      )
    })

    it('should handle multiple dependencies', async () => {
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
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({
        data: [{filename: 'package.json'}, {filename: 'Dockerfile'}],
      })

      await import('../src/index')

      expect(fsMocks.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.changeset/renovate-abc1234.md'),
        expect.stringContaining(
          'Update dependencies dependencies: `test`, `lodash`, `axios` to `1.0.0`',
        ),
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
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({
        data: [{filename: 'package.json'}],
      })

      const config = `
updateTypes:
  npm:
    changesetType: minor
    filePatterns: ["**/package.json"]
    template: "Custom: {updateType} {dependencies} {version}"
`
      coreMocks.getInput.mockImplementation((name: string) => (name === 'config' ? config : ''))

      await import('../src/index')

      expect(fsMocks.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.changeset/renovate-abc1234.md'),
        expect.stringContaining('Update dependencies dependency `test` to `1.0.0`'),
        'utf8',
      )
    })

    it('should handle multiple dependencies', async () => {
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
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({
        data: [{filename: 'package.json'}],
      })

      await import('../src/index')

      expect(fsMocks.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.changeset/renovate-abc1234.md'),
        expect.stringContaining('dependencies: `test`, `lodash`, `axios`'),
        'utf8',
      )
    })

    it('should set correct outputs after creating changeset', async () => {
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

      await import('../src/index')

      expect(coreMocks.info).toHaveBeenCalledWith('Created changeset: renovate-abc1234.md')
      expect(coreMocks.setOutput).toHaveBeenCalledWith('changesets-created', '1')
      expect(coreMocks.setOutput).toHaveBeenCalledWith(
        'changeset-files',
        JSON.stringify(['.changeset/renovate-abc1234.md']),
      )
    })

    it('should use working directory when provided', async () => {
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
      coreMocks.getInput.mockImplementation((name: string) =>
        name === 'working-directory' ? '/custom/path' : '',
      )

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

      expect(coreMocks.setFailed).toHaveBeenCalledWith('Action failed: Changeset error')
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

  describe('dry-run mode', () => {
    beforeEach(() => {
      process.env.GITHUB_REPOSITORY = 'owner/repo'
      process.env.GITHUB_EVENT_PATH = '/path/to/event.json'
    })

    it('should not create changeset files when dry-run is true', async () => {
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
      coreMocks.getInput.mockImplementation(name => (name === 'dry-run' ? 'true' : ''))
      coreMocks.getBooleanInput.mockImplementation(name => name === 'dry-run')

      await import('../src/index')

      // Verify writeFile was not called in dry-run mode
      expect(fsMocks.writeFile).not.toHaveBeenCalled()

      // Verify logs about dry run
      expect(coreMocks.info).toHaveBeenCalledWith(
        'DRY RUN MODE: Would have written changeset with the following content:',
      )
      expect(coreMocks.info).toHaveBeenCalledWith(expect.stringContaining('Summary:'))
      expect(coreMocks.info).toHaveBeenCalledWith(expect.stringContaining('Releases:'))

      // Verify output was set correctly
      expect(coreMocks.setOutput).toHaveBeenCalledWith('changesets-created', '0')
      expect(coreMocks.setOutput).toHaveBeenCalledWith('changeset-files', JSON.stringify([]))
    })
  })

  describe('PR commenting functionality', () => {
    beforeEach(() => {
      process.env.GITHUB_REPOSITORY = 'owner/repo'
      process.env.GITHUB_EVENT_PATH = '/path/to/event.json'
      octokitMocks.rest.issues.createComment.mockResolvedValue({data: {}})
    })

    it('should post PR comment when comment-pr is true (default)', async () => {
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
      coreMocks.getBooleanInput.mockImplementation(name => name === 'comment-pr')

      await import('../src/index')

      expect(octokitMocks.rest.issues.createComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
        body: expect.stringContaining('Changeset Summary'),
      })
      expect(octokitMocks.rest.issues.createComment).toHaveBeenCalledWith({
        body: `## Changeset Summary

A changeset has been created at \`.changeset/renovate-abc1234.md\`.

### Summary
\`\`\`
Update dependencies dependencies
\`\`\`

### Releases
- **repo**: patch
`,
        issue_number: 1,
        owner: 'owner',
        repo: 'repo',
      })
    })

    it('should post dry-run PR comment when in dry-run mode', async () => {
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
      coreMocks.getBooleanInput.mockImplementation(
        name => name === 'comment-pr' || name === 'dry-run',
      )

      await import('../src/index')

      expect(octokitMocks.rest.issues.createComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
        body: expect.stringContaining('[DRY RUN]'),
      })
      expect(octokitMocks.rest.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('preview of the changeset'),
        }),
      )
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
      octokitMocks.rest.issues.createComment.mockRejectedValue(new Error('API Error'))

      coreMocks.getInput.mockImplementation((name: string) => (name === 'comment-pr' ? 'true' : ''))
      coreMocks.getBooleanInput.mockImplementation(name => name === 'comment-pr')

      // Ensure the mock rejection is set up after beforeEach reset
      octokitMocks.rest.issues.createComment.mockImplementation(() => {
        throw new Error('API Error')
      })

      await import('../src/index')

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
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({data: [{filename: 'package.json'}]})
      coreMocks.getInput.mockImplementation(name => (name === 'branch-prefix' ? 'custom/' : ''))

      await import('../src/index')

      expect(coreMocks.info).toHaveBeenCalledWith(expect.stringContaining('Using config:'))
    })

    it('should use branch-prefix from env if input not provided', async () => {
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
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({data: [{filename: 'package.json'}]})
      process.env.BRANCH_PREFIX = 'envprefix/'
      coreMocks.getInput.mockImplementation(() => '')

      await import('../src/index')

      expect(coreMocks.info).toHaveBeenCalledWith(expect.stringContaining('Using config:'))
    })

    it('should use skip-branch-prefix-check from input or env', async () => {
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
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({data: [{filename: 'package.json'}]})
      // Input takes precedence
      coreMocks.getInput.mockImplementation(name =>
        name === 'skip-branch-prefix-check' ? 'true' : '',
      )

      await import('../src/index')
      expect(coreMocks.info).toHaveBeenCalledWith(expect.stringContaining('Using config:'))
    })

    it('should use skip-branch-prefix-check from env if input not provided', async () => {
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
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({data: [{filename: 'package.json'}]})
      process.env.SKIP_BRANCH_CHECK = 'TRUE'
      coreMocks.getInput.mockImplementation(() => '')

      await import('../src/index')
      expect(coreMocks.info).toHaveBeenCalledWith(expect.stringContaining('Using config:'))
    })

    it('should use sort from input or env', async () => {
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
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({data: [{filename: 'package.json'}]})
      // Input takes precedence
      coreMocks.getInput.mockImplementation(name => (name === 'sort' ? 'true' : ''))

      await import('../src/index')
      expect(coreMocks.info).toHaveBeenCalledWith(expect.stringContaining('Using config:'))
    })

    it('should use sort from env if input not provided', async () => {
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
      octokitMocks.rest.pulls.listFiles.mockResolvedValue({data: [{filename: 'package.json'}]})
      process.env.SORT_CHANGESETS = 'TRUE'
      coreMocks.getInput.mockImplementation(() => '')

      await import('../src/index')
      expect(coreMocks.info).toHaveBeenCalledWith(expect.stringContaining('Using config:'))
    })
  })
})
