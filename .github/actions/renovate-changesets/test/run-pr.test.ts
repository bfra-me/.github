import type {Config} from '../src/action-config'
import {describe, expect, it, vi} from 'vitest'
import {runPostGenerationOperations} from '../src/run-pr'
import {mockedGitHubActions, mockedOctokit} from './setup'

const gitMocks = vi.hoisted(() => ({
  createGitOperations: vi.fn(),
}))
const groupedMocks = vi.hoisted(() => ({
  createGroupedPRManager: vi.fn(),
}))

vi.mock('../src/git-operations', () => gitMocks)
vi.mock('../src/grouped-pr-manager', () => groupedMocks)

const config: Config = {
  updateTypes: {},
  defaultChangesetType: 'patch',
  emoji: false,
  commentPR: true,
  updatePRDescription: true,
}

describe('runPostGenerationOperations compatibility adapter inputs', () => {
  it('posts comments and updates descriptions using classified output structures', async () => {
    const commitChangesetFiles = vi.fn().mockResolvedValue({
      success: true,
      commitSha: 'abc1234',
      committedFiles: ['.changeset/renovate-abc1234.md'],
      error: null,
      pushSuccess: false,
      pushError: '',
      conflictsResolved: false,
      conflictResolution: '',
      branchUpdated: false,
      retryAttempts: 0,
    })
    gitMocks.createGitOperations.mockReturnValue({commitChangesetFiles})
    groupedMocks.createGroupedPRManager.mockReturnValue({
      detectGroupedPRs: vi.fn().mockResolvedValue([]),
    })
    mockedGitHubActions.core.getBooleanInput.mockReturnValue(false)
    mockedOctokit.rest.pulls.get.mockResolvedValue({data: {body: 'Original description'}})
    mockedOctokit.rest.pulls.update.mockResolvedValue({data: {}})
    mockedOctokit.rest.issues.createComment.mockResolvedValue({data: {}})

    await runPostGenerationOperations({
      config,
      octokit: mockedOctokit as never,
      owner: 'owner',
      repo: 'repo',
      branchName: 'renovate/test',
      workingDirectory: '/tmp/workspace',
      pr: {number: 42},
      prContext: {
        dependencies: [],
        isRenovateBot: true,
        branchName: 'renovate/test',
        prTitle: 'Update package',
        prBody: '',
        commitMessages: [],
        isGroupedUpdate: false,
        isSecurityUpdate: false,
        updateType: 'patch',
        manager: 'npm',
        files: [],
      },
      changesetContent: 'Update npm dependency `package`',
      releases: [{name: '@consumer/root', type: 'patch'}],
      dependencyNames: ['package'],
      changesetPath: '.changeset/renovate-abc1234.md',
      categorizationResult: {
        primaryCategory: 'patch',
        allCategories: ['patch'],
        summary: {
          securityUpdates: 0,
          breakingChanges: 0,
          highPriorityUpdates: 0,
          averageRiskLevel: 20,
        },
        confidence: 'high',
      },
      multiPackageResult: {
        changesets: [],
        strategy: 'single',
        totalPackagesAffected: 1,
        filesCreated: [],
        reasoning: [],
        warnings: [],
      },
    })

    expect(mockedOctokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({body: expect.stringContaining('Update npm dependency `package`')}),
    )
    expect(mockedOctokit.rest.pulls.update).toHaveBeenCalledWith(
      expect.objectContaining({body: expect.stringContaining('Update npm dependency `package`')}),
    )
  })
})
