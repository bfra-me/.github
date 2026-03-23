import type {Octokit} from '@octokit/rest'
import type {GitHubActionsDependencyChange} from './detectors/gha-types.js'
import {
  analyzeFileChanges,
  analyzeLocalFileChanges,
  deduplicateChanges,
} from './detectors/gha-change-analyzer.js'
import {
  calculateSemverImpact,
  determineUpdateType,
  isReusableWorkflow,
  isSecurityRelatedAction,
  parseActionVersion,
} from './detectors/gha-version-comparator.js'
import {
  extractInlineVersions,
  isGitHubActionsFile,
  parseActionReferences,
  parseActionUses,
} from './detectors/gha-workflow-parser.js'

export type {
  ActionReference,
  GitHubActionsDependencyChange,
  WorkflowFile,
  WorkflowJob,
  WorkflowStep,
} from './detectors/gha-types.js'

export async function detectGHAChangesFromPR(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  files: {filename: string; status: string; additions: number; deletions: number}[],
): Promise<GitHubActionsDependencyChange[]> {
  const changes: GitHubActionsDependencyChange[] = []
  const workflowFiles = files.filter(file => isGitHubActionsFile(file.filename))

  for (const file of workflowFiles) {
    const fileChanges = await analyzeFileChanges(octokit, owner, repo, prNumber, file)
    changes.push(...fileChanges)
  }

  return deduplicateChanges(changes)
}

export async function detectGHAChangesFromFiles(
  workingDirectory: string,
  changedFiles: string[],
): Promise<GitHubActionsDependencyChange[]> {
  const changes: GitHubActionsDependencyChange[] = []
  const workflowFiles = changedFiles.filter(file => isGitHubActionsFile(file))

  for (const file of workflowFiles) {
    const fileChanges = await analyzeLocalFileChanges(workingDirectory, file)
    changes.push(...fileChanges)
  }

  return deduplicateChanges(changes)
}

export const ghaInternals = {
  isGitHubActionsFile,
  parseActionUses,
  parseActionVersion,
  calculateSemverImpact,
  determineUpdateType,
  isSecurityRelatedAction,
  isReusableWorkflow,
  parseActionReferences,
  extractInlineVersions,
}

export type {ActionVersion} from './detectors/gha-types.js'
