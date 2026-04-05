import {describe, expect, it} from 'vitest'
import {
  setCategorizationOutputs,
  setChangesetOutputs,
  setEmptyOutputs,
  setErrorOutputs,
  setGitOperationErrorOutputs,
  setGitOperationOutputs,
  setGroupedPRErrorOutputs,
  setGroupedPROutputs,
  setMultiPackageOutputs,
  setPRManagementErrorOutputs,
  setPRManagementOutputs,
} from '../src/action-outputs'
import {mockedGitHubActions} from './setup'

describe('action-outputs', () => {
  describe('setEmptyOutputs', () => {
    it('should set changesets-created to 0', () => {
      setEmptyOutputs()
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('changesets-created', '0')
    })

    it('should set changeset-files to empty array', () => {
      setEmptyOutputs()
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith(
        'changeset-files',
        JSON.stringify([]),
      )
    })

    it('should set all categorization outputs to defaults', () => {
      setEmptyOutputs()
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('primary-category', '')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith(
        'all-categories',
        JSON.stringify([]),
      )
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('security-updates', '0')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('breaking-changes', '0')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('high-priority-updates', '0')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('average-risk-level', '0')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith(
        'categorization-confidence',
        'low',
      )
    })
  })

  describe('setChangesetOutputs', () => {
    it('should set changeset count output', () => {
      setChangesetOutputs({
        changesetsCreated: 2,
        changesetFiles: ['file1.md', 'file2.md'],
        updateType: 'npm',
        dependencies: ['lodash', 'react'],
        changesetSummary: 'Updated 2 dependencies',
      })

      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('changesets-created', '2')
    })

    it('should set changeset files as JSON', () => {
      const files = ['file1.md', 'file2.md']
      setChangesetOutputs({
        changesetsCreated: 2,
        changesetFiles: files,
        updateType: 'npm',
        dependencies: [],
        changesetSummary: '',
      })

      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith(
        'changeset-files',
        JSON.stringify(files),
      )
    })

    it('should set update-type output', () => {
      setChangesetOutputs({
        changesetsCreated: 1,
        changesetFiles: [],
        updateType: 'docker',
        dependencies: [],
        changesetSummary: '',
      })

      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('update-type', 'docker')
    })

    it('should set dependencies as JSON array', () => {
      const deps = ['package-a', 'package-b']
      setChangesetOutputs({
        changesetsCreated: 1,
        changesetFiles: [],
        updateType: 'npm',
        dependencies: deps,
        changesetSummary: '',
      })

      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith(
        'dependencies',
        JSON.stringify(deps),
      )
    })

    it('should set changeset-summary output', () => {
      setChangesetOutputs({
        changesetsCreated: 1,
        changesetFiles: [],
        updateType: 'npm',
        dependencies: [],
        changesetSummary: 'Updated lodash to 4.17.21',
      })

      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith(
        'changeset-summary',
        'Updated lodash to 4.17.21',
      )
    })
  })

  describe('setMultiPackageOutputs', () => {
    it('should set multi-package-strategy', () => {
      setMultiPackageOutputs({
        strategy: 'single',
        workspacePackagesCount: 3,
        packageRelationshipsCount: 2,
        affectedPackages: ['pkg-a'],
        reasoning: ['reason1'],
      })

      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith(
        'multi-package-strategy',
        'single',
      )
    })

    it('should set workspace-packages-count as string', () => {
      setMultiPackageOutputs({
        strategy: 'multiple',
        workspacePackagesCount: 5,
        packageRelationshipsCount: 3,
        affectedPackages: [],
        reasoning: [],
      })

      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith(
        'workspace-packages-count',
        '5',
      )
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith(
        'package-relationships-count',
        '3',
      )
    })

    it('should set affected-packages and reasoning as JSON', () => {
      const pkgs = ['@scope/pkg-a', '@scope/pkg-b']
      const reasoning = ['Reason 1', 'Reason 2']
      setMultiPackageOutputs({
        strategy: 'grouped',
        workspacePackagesCount: 0,
        packageRelationshipsCount: 0,
        affectedPackages: pkgs,
        reasoning,
      })

      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith(
        'affected-packages',
        JSON.stringify(pkgs),
      )
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith(
        'multi-package-reasoning',
        JSON.stringify(reasoning),
      )
    })
  })

  describe('setCategorizationOutputs', () => {
    it('should set all categorization outputs', () => {
      setCategorizationOutputs({
        primaryCategory: 'security',
        allCategories: ['security', 'dependencies'],
        summary: {key: 'value'},
        securityUpdates: 2,
        breakingChanges: 1,
        highPriorityUpdates: 3,
        averageRiskLevel: 0.7,
        confidence: 'high',
      })

      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith(
        'primary-category',
        'security',
      )
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('security-updates', '2')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('breaking-changes', '1')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('high-priority-updates', '3')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('average-risk-level', '0.7')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith(
        'categorization-confidence',
        'high',
      )
    })
  })

  describe('setGitOperationOutputs', () => {
    it('should set git operation success outputs', () => {
      setGitOperationOutputs({
        commitSuccess: true,
        commitSha: 'abc123',
        committedFiles: ['file1.md'],
        gitError: '',
        pushSuccess: true,
        pushError: '',
        conflictsResolved: false,
        conflictResolution: '',
        branchUpdated: true,
        retryAttempts: 0,
      })

      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('commit-success', 'true')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('commit-sha', 'abc123')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('push-success', 'true')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('branch-updated', 'true')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('retry-attempts', '0')
    })

    it('should set git operation failure outputs', () => {
      setGitOperationOutputs({
        commitSuccess: false,
        commitSha: '',
        committedFiles: [],
        gitError: 'git error message',
        pushSuccess: false,
        pushError: 'push error',
        conflictsResolved: true,
        conflictResolution: 'manual',
        branchUpdated: false,
        retryAttempts: 3,
      })

      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('commit-success', 'false')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith(
        'git-error',
        'git error message',
      )
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('conflicts-resolved', 'true')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith(
        'conflict-resolution',
        'manual',
      )
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('retry-attempts', '3')
    })
  })

  describe('setGitOperationErrorOutputs', () => {
    it('should set all git error outputs to defaults', () => {
      setGitOperationErrorOutputs()

      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('commit-success', 'false')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('commit-sha', '')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('push-success', 'false')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('conflicts-resolved', 'false')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('branch-updated', 'false')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('retry-attempts', '0')
    })
  })

  describe('setPRManagementOutputs', () => {
    it('should set PR management success outputs', () => {
      setPRManagementOutputs({
        prDescriptionUpdated: true,
        prDescriptionError: '',
        prCommentCreated: true,
        prCommentError: '',
      })

      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith(
        'pr-description-updated',
        'true',
      )
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('pr-comment-created', 'true')
    })

    it('should set PR management error outputs', () => {
      setPRManagementOutputs({
        prDescriptionUpdated: false,
        prDescriptionError: 'API error',
        prCommentCreated: false,
        prCommentError: 'Rate limit',
      })

      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith(
        'pr-description-error',
        'API error',
      )
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith(
        'pr-comment-error',
        'Rate limit',
      )
    })
  })

  describe('setPRManagementErrorOutputs', () => {
    it('should set all PR management outputs to defaults', () => {
      setPRManagementErrorOutputs()

      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith(
        'pr-description-updated',
        'false',
      )
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('pr-comment-created', 'false')
    })
  })

  describe('setGroupedPROutputs', () => {
    it('should set grouped PR outputs', () => {
      setGroupedPROutputs({
        enabled: true,
        found: 3,
        updated: 2,
        failed: 1,
        strategy: 'all-open',
        identifier: 'group-123',
        results: [{id: 1}, {id: 2}],
      })

      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('grouped-prs-enabled', 'true')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('grouped-prs-found', '3')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('grouped-prs-updated', '2')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('grouped-prs-failed', '1')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith(
        'grouped-pr-strategy',
        'all-open',
      )
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith(
        'grouped-pr-identifier',
        'group-123',
      )
    })
  })

  describe('setGroupedPRErrorOutputs', () => {
    it('should set grouped PR error outputs to defaults', () => {
      setGroupedPRErrorOutputs()

      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('grouped-prs-updated', '0')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('grouped-prs-failed', '0')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('grouped-pr-strategy', 'none')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('grouped-pr-identifier', '')
    })
  })

  describe('setErrorOutputs', () => {
    it('should call multiple setOutput with error/empty defaults', () => {
      setErrorOutputs()

      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('changesets-created', '0')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith('commit-success', 'false')
      expect(mockedGitHubActions.core.setOutput).toHaveBeenCalledWith(
        'pr-description-updated',
        'false',
      )
    })
  })
})
