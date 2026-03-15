import type {Octokit} from '@octokit/rest'
import type {Config} from './action-config'
import type {CategorizationInfo, ReleaseEntry} from './changeset-info-formatter'
import type {MultiPackageChangesetResult} from './multi-package-changeset-generator'
import type {createPRComment} from './pr-comment-creator'
import type {updatePRDescription} from './pr-description-updater'
import type {RenovatePRContext} from './renovate-parser'
import * as core from '@actions/core'
import {
  setGitOperationOutputs,
  setGroupedPRErrorOutputs,
  setGroupedPROutputs,
  setPRManagementOutputs,
} from './action-outputs'
import {createGitOperations} from './git-operations'
import {createGroupedPRManager} from './grouped-pr-manager'
import {createPRComment as createPRCommentImpl} from './pr-comment-creator'
import {updatePRDescription as updatePRDescriptionImpl} from './pr-description-updater'

interface PullRequestRef {
  number: number
}

export async function runPostGenerationOperations(params: {
  config: Config
  octokit: Octokit
  owner: string
  repo: string
  branchName: string
  workingDirectory: string
  pr: PullRequestRef
  prContext: RenovatePRContext
  changesetContent: string
  releases: ReleaseEntry[]
  dependencyNames: string[]
  changesetPath: string
  categorizationResult: CategorizationInfo
  multiPackageResult: MultiPackageChangesetResult
}): Promise<void> {
  try {
    const gitOps = createGitOperations(
      params.workingDirectory,
      params.owner,
      params.repo,
      params.branchName,
    )
    const commitResult = await gitOps.commitChangesetFiles()
    setGitOperationOutputs({
      commitSuccess: commitResult.success,
      commitSha: commitResult.commitSha || '',
      committedFiles: commitResult.committedFiles,
      gitError: commitResult.error || '',
      pushSuccess: commitResult.pushSuccess || false,
      pushError: commitResult.pushError || '',
      conflictsResolved: commitResult.conflictsResolved || false,
      conflictResolution: commitResult.conflictResolution || '',
      branchUpdated: commitResult.branchUpdated || false,
      retryAttempts: commitResult.retryAttempts || 0,
    })
  } catch (gitError) {
    const gitErrorMessage = gitError instanceof Error ? gitError.message : String(gitError)
    core.warning(`Git operations encountered an error: ${gitErrorMessage}`)
    setGitOperationOutputs({
      commitSuccess: false,
      commitSha: '',
      committedFiles: [],
      gitError: gitErrorMessage,
      pushSuccess: false,
      pushError: '',
      conflictsResolved: false,
      conflictResolution: '',
      branchUpdated: false,
      retryAttempts: 0,
    })
  }

  if (params.config.updatePRDescription) {
    try {
      await updatePRDescriptionImpl(
        params.octokit,
        params.owner,
        params.repo,
        params.pr.number,
        params.changesetContent,
        params.releases,
        params.dependencyNames,
        params.categorizationResult,
        params.multiPackageResult,
      )
      setPRManagementOutputs({
        prDescriptionUpdated: true,
        prDescriptionError: '',
        prCommentCreated: false,
        prCommentError: '',
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      setPRManagementOutputs({
        prDescriptionUpdated: false,
        prDescriptionError: errorMessage,
        prCommentCreated: false,
        prCommentError: '',
      })
    }
  }

  if (params.config.commentPR) {
    try {
      await createPRCommentImpl(
        params.octokit,
        params.owner,
        params.repo,
        params.pr.number,
        params.changesetContent,
        params.releases,
        params.changesetPath,
        params.dependencyNames,
        params.categorizationResult,
        params.multiPackageResult,
      )
      setPRManagementOutputs({
        prDescriptionUpdated: false,
        prDescriptionError: '',
        prCommentCreated: true,
        prCommentError: '',
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      setPRManagementOutputs({
        prDescriptionUpdated: false,
        prDescriptionError: '',
        prCommentCreated: false,
        prCommentError: errorMessage,
      })
    }
  }

  const groupedPRManager = createGroupedPRManager(params.octokit, params.owner, params.repo)
  try {
    const groupedPRs = await groupedPRManager.detectGroupedPRs(params.pr.number, params.prContext)
    const groupedPRsEnabled = core.getBooleanInput('update-grouped-prs')

    if (groupedPRs.length > 1) {
      const groupedResult = await groupedPRManager.updateGroupedPRs(
        groupedPRs,
        params.changesetContent,
        params.releases,
        params.dependencyNames,
        params.categorizationResult,
        params.multiPackageResult,
        updatePRDescriptionImpl as typeof updatePRDescription,
        createPRCommentImpl as typeof createPRComment,
        params.changesetPath,
      )
      setGroupedPROutputs({
        enabled: groupedPRsEnabled,
        found: groupedPRs.length,
        updated: groupedResult.updatedPRs,
        failed: groupedResult.failedPRs,
        strategy: groupedResult.groupingStrategy,
        identifier: groupedResult.groupIdentifier || '',
        results: groupedResult.prResults,
      })
      if (groupedResult.failedPRs > 0) {
        core.warning(`${groupedResult.failedPRs} PRs failed to update in grouped operation`)
      }
      return
    }

    setGroupedPROutputs({
      enabled: groupedPRsEnabled,
      found: groupedPRs.length,
      updated: 0,
      failed: 0,
      strategy: 'none',
      identifier: '',
      results: [],
    })
  } catch (groupedPRError) {
    const errorMessage =
      groupedPRError instanceof Error ? groupedPRError.message : String(groupedPRError)
    core.warning(`Grouped PR operations failed: ${errorMessage}`)
    setGroupedPRErrorOutputs()
  }
}
