import {describe, expect, it} from 'vitest'
import {GitHubActionsChangeDetector} from '../src/github-actions-change-detector.js'

describe('GitHubActionsChangeDetector', () => {
  const detector = new GitHubActionsChangeDetector()
  // Type assertion to access private methods for testing
  const detectorPrivate = detector as any

  describe('file detection', () => {
    it('should identify GitHub Actions workflow files', () => {
      const workflowFiles = [
        '.github/workflows/ci.yaml',
        '.github/workflows/release.yml',
        '.github/actions/custom-action/action.yaml',
        '.github/actions/custom-action/action.yml',
      ]

      const nonWorkflowFiles = [
        'package.json',
        'README.md',
        '.github/renovate.json',
        'src/index.ts',
      ]

      for (const file of workflowFiles) {
        expect(detectorPrivate.isGitHubActionsFile(file)).toBe(true)
      }

      for (const file of nonWorkflowFiles) {
        expect(detectorPrivate.isGitHubActionsFile(file)).toBe(false)
      }
    })
  })

  describe('action reference parsing', () => {
    it('should parse action uses statement correctly', () => {
      const testCases = [
        {
          uses: 'actions/checkout@v5.0.0',
          expected: {
            name: 'actions/checkout',
            ref: 'v5.0.0',
            uses: 'actions/checkout@v5.0.0',
            stepName: 'test-step',
            inlineVersion: undefined,
          },
        },
        {
          uses: 'actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0',
          expected: {
            name: 'actions/checkout',
            ref: '08c6903cd8c0fde910a37f88322edcfb5dd907a8',
            uses: 'actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0',
            stepName: 'test-step',
            inlineVersion: 'v5.0.0',
          },
        },
        {
          uses: 'ossf/scorecard-action@main',
          expected: {
            name: 'ossf/scorecard-action',
            ref: 'main',
            uses: 'ossf/scorecard-action@main',
            stepName: 'test-step',
            inlineVersion: undefined,
          },
        },
      ]

      for (const testCase of testCases) {
        const result = detectorPrivate.parseActionUses(testCase.uses, 'test-step')
        expect(result).toEqual(testCase.expected)
      }
    })

    it('should skip local actions', () => {
      const localAction = './local-action'
      const result = detectorPrivate.parseActionUses(localAction, 'test-step')
      expect(result).toBeNull()
    })
  })

  describe('version analysis', () => {
    it('should parse semver versions correctly', () => {
      const testCases = [
        {
          ref: 'v1.2.3',
          expected: {
            original: 'v1.2.3',
            isCommitSha: false,
            isBranch: false,
            isTag: true,
            major: 1,
            minor: 2,
            patch: 3,
          },
        },
        {
          ref: '1.0.0-alpha.1',
          expected: {
            original: '1.0.0-alpha.1',
            isCommitSha: false,
            isBranch: false,
            isTag: true,
            major: 1,
            minor: 0,
            patch: 0,
            prerelease: 'alpha.1',
          },
        },
        {
          ref: '08c6903cd8c0fde910a37f88322edcfb5dd907a8',
          expected: {
            original: '08c6903cd8c0fde910a37f88322edcfb5dd907a8',
            isCommitSha: true,
            isBranch: false,
            isTag: false,
          },
        },
        {
          ref: 'main',
          expected: {
            original: 'main',
            isCommitSha: false,
            isBranch: true,
            isTag: false,
          },
        },
      ]

      for (const testCase of testCases) {
        const result = detectorPrivate.parseActionVersion(testCase.ref)
        expect(result).toMatchObject(testCase.expected)
      }
    })

    it('should calculate semver impact correctly', () => {
      const testCases = [
        {current: 'v1.0.0', new: 'v2.0.0', expected: 'major'},
        {current: 'v1.0.0', new: 'v1.1.0', expected: 'minor'},
        {current: 'v1.0.0', new: 'v1.0.1', expected: 'patch'},
        {current: 'v1.0.0', new: 'v1.0.0-alpha.1', expected: 'prerelease'},
        {
          current: '1234567890abcdef1234567890abcdef12345678',
          new: 'abcdef1234567890abcdef1234567890abcdef12',
          expected: 'patch',
        }, // commit SHAs
        {current: 'main', new: 'develop', expected: 'minor'}, // branches
        {current: undefined, new: 'v1.0.0', expected: 'patch'}, // new action
      ]

      for (const testCase of testCases) {
        const result = detectorPrivate.calculateSemverImpact(testCase.current, testCase.new)
        expect(result).toBe(testCase.expected)
      }
    })

    it('should handle prerelease changes correctly', () => {
      // Test prerelease changes separately
      const result = detectorPrivate.calculateSemverImpact('v1.0.0', 'v1.0.0-alpha.1')
      expect(result).toBe('prerelease')
    })

    it('should handle branch changes correctly', () => {
      // Test branch changes separately
      const result = detectorPrivate.calculateSemverImpact('main', 'develop')
      expect(result).toBe('minor')
    })
  })

  describe('security detection', () => {
    it('should identify security-related actions', () => {
      const securityActions = [
        'ossf/scorecard-action',
        'github/codeql-action/init',
        'actions/dependency-review-action',
        'step-security/harden-runner',
      ]

      const regularActions = ['actions/checkout', 'actions/setup-node', 'actions/upload-artifact']

      for (const action of securityActions) {
        expect(detectorPrivate.isSecurityRelatedAction(action)).toBe(true)
      }

      for (const action of regularActions) {
        expect(detectorPrivate.isSecurityRelatedAction(action)).toBe(false)
      }
    })
  })

  describe('workflow detection', () => {
    it('should detect reusable workflows', () => {
      const reusableWorkflows = [
        'bfra-me/.github/.github/workflows/scorecard.yaml@v2.3.5',
        'organization/repo/.github/workflows/ci.yml@main',
      ]

      const regularActions = ['actions/checkout@v5.0.0', 'ossf/scorecard-action@main']

      for (const workflow of reusableWorkflows) {
        expect(detectorPrivate.isReusableWorkflow(workflow)).toBe(true)
      }

      for (const action of regularActions) {
        expect(detectorPrivate.isReusableWorkflow(action)).toBe(false)
      }
    })
  })

  describe('local file analysis', () => {
    it('should handle local file analysis gracefully', async () => {
      // This test ensures the method exists and doesn't throw
      const result = await detector.detectChangesFromFiles('/tmp', [])
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(0)
    })
  })
})
