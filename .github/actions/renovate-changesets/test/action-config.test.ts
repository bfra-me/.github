import process from 'node:process'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {DEFAULT_CONFIG, getConfig} from '../src/action-config'
import {createGitOperations} from '../src/git-operations'
import {createGroupedPRManager} from '../src/grouped-pr-manager'
import {mockedFileSystem, mockedGitHubActions, mockedOctokit} from './setup'

describe('action-config', () => {
  describe('DEFAULT_CONFIG', () => {
    it('should have default patch type for all update types', () => {
      for (const [, value] of Object.entries(DEFAULT_CONFIG.updateTypes)) {
        expect(value.changesetType).toBe('patch')
      }
    })

    it('should include github-actions update type with correct file patterns', () => {
      expect(DEFAULT_CONFIG.updateTypes['github-actions']).toBeDefined()
      expect(DEFAULT_CONFIG.updateTypes['github-actions'].filePatterns).toContain(
        '.github/workflows/**/*.yaml',
      )
    })

    it('should include npm update type with package.json pattern', () => {
      expect(DEFAULT_CONFIG.updateTypes.npm).toBeDefined()
      expect(DEFAULT_CONFIG.updateTypes.npm.filePatterns).toContain('**/package.json')
    })

    it('should include docker update type', () => {
      expect(DEFAULT_CONFIG.updateTypes.docker).toBeDefined()
      expect(DEFAULT_CONFIG.updateTypes.docker.filePatterns).toContain('**/Dockerfile')
    })

    it('should have defaultChangesetType of patch', () => {
      expect(DEFAULT_CONFIG.defaultChangesetType).toBe('patch')
    })
  })

  describe('getConfig', () => {
    beforeEach(() => {
      mockedGitHubActions.core.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'branch-prefix': 'renovate/',
          'default-changeset-type': 'patch',
        }
        return inputs[name] ?? ''
      })
      mockedGitHubActions.core.getBooleanInput.mockImplementation(() => false)
    })

    it('should return default config when no file or inline config provided', async () => {
      const config = await getConfig()

      expect(config.defaultChangesetType).toBe('patch')
      expect(config.branchPrefix).toBe('renovate/')
      expect(config.emoji).toBe(false)
      expect(config.updateTypes).toBeDefined()
      expect(config.updateTypes.npm).toBeDefined()
    })

    it('should honor an enabled emoji input', async () => {
      mockedGitHubActions.core.getBooleanInput.mockImplementation(
        (name: string) => name === 'emoji',
      )

      const config = await getConfig()

      expect(config.emoji).toBe(true)
    })

    it('should apply branch prefix from input', async () => {
      mockedGitHubActions.core.getInput.mockImplementation((name: string) => {
        if (name === 'branch-prefix') return 'deps/'
        if (name === 'default-changeset-type') return 'patch'
        return ''
      })

      const config = await getConfig()

      expect(config.branchPrefix).toBe('deps/')
    })

    it('should use env var for branch prefix when no input provided', async () => {
      mockedGitHubActions.core.getInput.mockImplementation((name: string) => {
        if (name === 'default-changeset-type') return 'patch'
        return ''
      })
      process.env.BRANCH_PREFIX = 'custom-prefix/'

      const config = await getConfig()

      expect(config.branchPrefix).toBe('custom-prefix/')
      delete process.env.BRANCH_PREFIX
    })

    it('should apply skipBranchPrefixCheck from getBooleanInput', async () => {
      mockedGitHubActions.core.getBooleanInput.mockImplementation((name: string) => {
        if (name === 'skip-branch-prefix-check') return true
        return false
      })

      const config = await getConfig()

      expect(config.skipBranchPrefixCheck).toBe(true)
    })

    it('should use env var SKIP_BRANCH_CHECK=TRUE when input is false', async () => {
      process.env.SKIP_BRANCH_CHECK = 'TRUE'

      const config = await getConfig()

      expect(config.skipBranchPrefixCheck).toBe(true)
      delete process.env.SKIP_BRANCH_CHECK
    })

    it('should apply default-changeset-type input', async () => {
      mockedGitHubActions.core.getInput.mockImplementation((name: string) => {
        if (name === 'default-changeset-type') return 'minor'
        if (name === 'branch-prefix') return 'renovate/'
        return ''
      })

      const config = await getConfig()

      expect(config.defaultChangesetType).toBe('minor')
    })

    it('should throw for invalid default-changeset-type', async () => {
      mockedGitHubActions.core.getInput.mockImplementation((name: string) => {
        if (name === 'default-changeset-type') return 'invalid'
        return ''
      })

      await expect(getConfig()).rejects.toThrow('Invalid default-changeset-type: invalid')
    })

    it('should parse exclude patterns from input', async () => {
      mockedGitHubActions.core.getInput.mockImplementation((name: string) => {
        if (name === 'exclude-patterns') return 'node_modules/**,dist/**'
        if (name === 'default-changeset-type') return 'patch'
        return ''
      })

      const config = await getConfig()

      expect(config.excludePatterns).toEqual(['node_modules/**', 'dist/**'])
    })

    it('should load config from file when config-file input is provided', async () => {
      mockedGitHubActions.core.getInput.mockImplementation((name: string) => {
        if (name === 'config-file') return '/path/to/config.yaml'
        if (name === 'default-changeset-type') return 'patch'
        return ''
      })
      mockedFileSystem.readFile.mockResolvedValue(
        'defaultChangesetType: minor\nbranchPrefix: custom/',
      )

      const config = await getConfig()

      expect(config.defaultChangesetType).toBe('minor')
      expect(config.branchPrefix).toBe('custom/')
      expect(mockedGitHubActions.core.info).toHaveBeenCalledWith(
        expect.stringContaining('/path/to/config.yaml'),
      )
    })

    it('should warn when config file has invalid format', async () => {
      mockedGitHubActions.core.getInput.mockImplementation((name: string) => {
        if (name === 'config-file') return '/path/to/config.yaml'
        if (name === 'default-changeset-type') return 'patch'
        return ''
      })
      mockedFileSystem.readFile.mockResolvedValue('null')

      await getConfig()

      expect(mockedGitHubActions.core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Invalid configuration format'),
      )
    })

    it('should warn when config file fails to read', async () => {
      mockedGitHubActions.core.getInput.mockImplementation((name: string) => {
        if (name === 'config-file') return '/path/to/config.yaml'
        if (name === 'default-changeset-type') return 'patch'
        return ''
      })
      mockedFileSystem.readFile.mockRejectedValue(new Error('File not found'))

      await getConfig()

      expect(mockedGitHubActions.core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read config file'),
      )
    })

    it('should load inline config when config input is provided', async () => {
      mockedGitHubActions.core.getInput.mockImplementation((name: string) => {
        if (name === 'config') return 'defaultChangesetType: major\nbranchPrefix: inline/'
        if (name === 'default-changeset-type') return 'patch'
        return ''
      })

      const config = await getConfig()

      expect(config.defaultChangesetType).toBe('major')
      expect(config.branchPrefix).toBe('inline/')
      expect(mockedGitHubActions.core.info).toHaveBeenCalledWith(
        expect.stringContaining('inline configuration'),
      )
    })

    it('should warn when inline config has invalid format', async () => {
      mockedGitHubActions.core.getInput.mockImplementation((name: string) => {
        if (name === 'config') return 'null'
        if (name === 'default-changeset-type') return 'patch'
        return ''
      })

      await getConfig()

      expect(mockedGitHubActions.core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Invalid inline configuration'),
      )
    })

    it('should warn when inline config fails to parse', async () => {
      mockedGitHubActions.core.getInput.mockImplementation((name: string) => {
        if (name === 'config') return ': invalid: yaml: content'
        if (name === 'default-changeset-type') return 'patch'
        return ''
      })

      await getConfig()

      expect(mockedGitHubActions.core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse inline config'),
      )
    })

    it('should include sort and commentPR flags from getBooleanInput', async () => {
      mockedGitHubActions.core.getBooleanInput.mockImplementation((name: string) => {
        if (name === 'sort') return true
        if (name === 'comment-pr') return true
        if (name === 'update-pr-description') return true
        return false
      })

      const config = await getConfig()

      expect(config.sort).toBe(true)
      expect(config.commentPR).toBe(true)
      expect(config.updatePRDescription).toBe(true)
    })

    it('should leave targetPackage undefined when no input or env var is set', async () => {
      const config = await getConfig()

      expect(config.targetPackage).toBeUndefined()
    })

    it('should set targetPackage from the target-package input', async () => {
      mockedGitHubActions.core.getInput.mockImplementation((name: string) => {
        if (name === 'target-package') return '@scope/published'
        if (name === 'default-changeset-type') return 'patch'
        return ''
      })

      const config = await getConfig()

      expect(config.targetPackage).toBe('@scope/published')
    })

    it('should fall back to TARGET_PACKAGE env var when input is empty', async () => {
      process.env.TARGET_PACKAGE = '@scope/from-env'

      try {
        const config = await getConfig()
        expect(config.targetPackage).toBe('@scope/from-env')
      } finally {
        delete process.env.TARGET_PACKAGE
      }
    })

    it('should prefer the target-package input over the env var', async () => {
      mockedGitHubActions.core.getInput.mockImplementation((name: string) => {
        if (name === 'target-package') return '@scope/from-input'
        if (name === 'default-changeset-type') return 'patch'
        return ''
      })
      process.env.TARGET_PACKAGE = '@scope/from-env'

      try {
        const config = await getConfig()
        expect(config.targetPackage).toBe('@scope/from-input')
      } finally {
        delete process.env.TARGET_PACKAGE
      }
    })

    it('should trim surrounding whitespace on the TARGET_PACKAGE env var', async () => {
      process.env.TARGET_PACKAGE = '  @scope/from-env  '

      try {
        const config = await getConfig()
        expect(config.targetPackage).toBe('@scope/from-env')
      } finally {
        delete process.env.TARGET_PACKAGE
      }
    })

    it('should treat a whitespace-only TARGET_PACKAGE env var as unset', async () => {
      process.env.TARGET_PACKAGE = '   \n'

      try {
        const config = await getConfig()
        expect(config.targetPackage).toBeUndefined()
      } finally {
        delete process.env.TARGET_PACKAGE
      }
    })

    it('should normalize targetPackage coming from an inline config', async () => {
      mockedGitHubActions.core.getInput.mockImplementation((name: string) => {
        if (name === 'config') return 'targetPackage: "  @scope/from-inline  "'
        if (name === 'default-changeset-type') return 'patch'
        return ''
      })

      const config = await getConfig()

      expect(config.targetPackage).toBe('@scope/from-inline')
    })
  })

  describe('boolean input handling', () => {
    const createOperations = () =>
      createGitOperations('/tmp/test-workspace', 'owner', 'repo', 'renovate/test-branch')

    const groupedPR = {
      number: 1,
      title: 'Update dependency test-package to v2.0.0',
      head: 'renovate/test-branch',
      isCurrent: true,
      dependencies: ['test-package'],
    }

    const categorizationResult = {
      primaryCategory: 'dependencies',
      allCategories: ['dependencies'],
      summary: {
        securityUpdates: 0,
        breakingChanges: 0,
        highPriorityUpdates: 0,
        averageRiskLevel: 0,
      },
      confidence: 'high',
    }

    const multiPackageResult = {
      strategy: 'single',
      reasoning: [],
    }

    it('should not attempt conflict resolution when auto-resolve-conflicts is false', async () => {
      mockedGitHubActions.core.getBooleanInput.mockImplementation(name => name === 'commit-back')
      mockedGitHubActions.exec.getExecOutput.mockResolvedValue({
        exitCode: 0,
        stdout: 'UU .changeset/conflict.md\n',
        stderr: '',
      })

      const result = await createOperations().handleChangesetConflicts()

      expect(result).toEqual({resolved: false, strategy: 'manual-resolution-required'})
      expect(mockedGitHubActions.exec.getExecOutput).toHaveBeenCalledTimes(1)
    })

    it('should include the current PR when skip-current-pr-in-group is false', async () => {
      mockedGitHubActions.core.getBooleanInput.mockImplementation(
        name => name === 'update-grouped-prs' || name === 'update-pr-description',
      )
      const updatePRDescription = vi.fn().mockResolvedValue(undefined)

      const result = await createGroupedPRManager(
        mockedOctokit as unknown as Parameters<typeof createGroupedPRManager>[0],
        'owner',
        'repo',
      ).updateGroupedPRs(
        [groupedPR],
        'changeset',
        [],
        ['test-package'],
        categorizationResult,
        multiPackageResult,
        updatePRDescription,
        vi.fn().mockResolvedValue(undefined),
        '.changeset/test.md',
      )

      expect(result.updatedPRs).toBe(1)
      expect(result.prResults).toHaveLength(1)
      expect(updatePRDescription).toHaveBeenCalledOnce()
    })

    it('should honor the documented defaults when boolean inputs are unset', async () => {
      mockedGitHubActions.core.getBooleanInput.mockImplementation(
        name => name === 'auto-resolve-conflicts' || name === 'skip-current-pr-in-group',
      )
      mockedGitHubActions.exec.getExecOutput.mockResolvedValue({
        exitCode: 0,
        stdout: 'UU .changeset/conflict.md\n',
        stderr: '',
      })

      const conflictResult = await createOperations().handleChangesetConflicts()

      expect(conflictResult).toEqual({resolved: true, strategy: 'prefer-working-tree'})
      expect(mockedGitHubActions.exec.getExecOutput).toHaveBeenCalledTimes(3)

      const updatePRDescription = vi.fn().mockResolvedValue(undefined)
      const groupedResult = await createGroupedPRManager(
        mockedOctokit as unknown as Parameters<typeof createGroupedPRManager>[0],
        'owner',
        'repo',
      ).updateGroupedPRs(
        [groupedPR],
        'changeset',
        [],
        ['test-package'],
        categorizationResult,
        multiPackageResult,
        updatePRDescription,
        vi.fn().mockResolvedValue(undefined),
        '.changeset/test.md',
      )

      expect(groupedResult.updatedPRs).toBe(0)
      expect(updatePRDescription).not.toHaveBeenCalled()
    })
  })
})
