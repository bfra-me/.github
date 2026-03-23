import type {Octokit} from '@octokit/rest'
import type {ActionReference, GitHubActionsDependencyChange} from './gha-types.js'
import {Buffer} from 'node:buffer'
import {promises as fs} from 'node:fs'
import path from 'node:path'
import {
  calculateSemverImpact,
  determineUpdateType,
  isReusableWorkflow,
  isSecurityRelatedAction,
} from './gha-version-comparator.js'
import {parseActionReferences} from './gha-workflow-parser.js'

export async function analyzeFileChanges(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  file: {filename: string; status: string; additions: number; deletions: number},
): Promise<GitHubActionsDependencyChange[]> {
  const changes: GitHubActionsDependencyChange[] = []

  try {
    const prData = await octokit.rest.pulls.get({owner, repo, pull_number: prNumber})

    const baseContent = await getFileContent(
      octokit,
      owner,
      repo,
      file.filename,
      prData.data.base.sha,
    )
    const headContent = await getFileContent(
      octokit,
      owner,
      repo,
      file.filename,
      prData.data.head.sha,
    )

    if (!baseContent && !headContent) {
      return changes
    }

    const baseActions = baseContent ? await parseActionReferences(baseContent, file.filename) : []
    const headActions = headContent ? await parseActionReferences(headContent, file.filename) : []

    const actionChanges = compareActionReferences(baseActions, headActions, file.filename)
    changes.push(...actionChanges)
  } catch (error) {
    console.warn(`Failed to analyze GitHub Actions file ${file.filename}:`, error)
  }

  return changes
}

export async function analyzeLocalFileChanges(
  workingDirectory: string,
  filename: string,
): Promise<GitHubActionsDependencyChange[]> {
  const changes: GitHubActionsDependencyChange[] = []

  try {
    const fullPath = path.join(workingDirectory, filename)
    const content = await fs.readFile(fullPath, 'utf8')
    const actions = await parseActionReferences(content, filename)

    for (const action of actions) {
      changes.push({
        name: action.name,
        workflowFile: filename,
        newRef: action.ref,
        manager: 'github-actions',
        updateType: determineUpdateType(undefined, action.ref),
        semverImpact: calculateSemverImpact(undefined, action.ref),
        isSecurityUpdate: isSecurityRelatedAction(action.name),
        stepName: action.stepName,
        line: action.line,
        isReusableWorkflow: isReusableWorkflow(action.uses),
        inlineVersionComment: action.inlineVersion,
      })
    }
  } catch (error) {
    console.warn(`Failed to analyze local GitHub Actions file ${filename}:`, error)
  }

  return changes
}

export function compareActionReferences(
  baseActions: ActionReference[],
  headActions: ActionReference[],
  filename: string,
): GitHubActionsDependencyChange[] {
  const changes: GitHubActionsDependencyChange[] = []
  const baseMap = new Map<string, ActionReference>()
  const headMap = new Map<string, ActionReference>()

  for (const action of baseActions) {
    const key = `${action.name}:${action.stepName || 'unknown'}`
    baseMap.set(key, action)
  }

  for (const action of headActions) {
    const key = `${action.name}:${action.stepName || 'unknown'}`
    headMap.set(key, action)
  }

  for (const [key, headAction] of headMap) {
    const baseAction = baseMap.get(key)

    if (!baseAction) {
      changes.push({
        name: headAction.name,
        workflowFile: filename,
        newRef: headAction.ref,
        manager: 'github-actions',
        updateType: 'minor',
        semverImpact: 'minor',
        isSecurityUpdate: isSecurityRelatedAction(headAction.name),
        stepName: headAction.stepName,
        line: headAction.line,
        isReusableWorkflow: isReusableWorkflow(headAction.uses),
        inlineVersionComment: headAction.inlineVersion,
      })
    } else if (baseAction.ref !== headAction.ref) {
      const baseVersion = baseAction.inlineVersion ?? baseAction.ref
      const headVersion = headAction.inlineVersion ?? headAction.ref
      changes.push({
        name: headAction.name,
        workflowFile: filename,
        currentRef: baseAction.ref,
        newRef: headAction.ref,
        manager: 'github-actions',
        updateType: determineUpdateType(baseVersion, headVersion),
        semverImpact: calculateSemverImpact(baseVersion, headVersion),
        isSecurityUpdate: isSecurityRelatedAction(headAction.name),
        stepName: headAction.stepName,
        line: headAction.line,
        isReusableWorkflow: isReusableWorkflow(headAction.uses),
        inlineVersionComment: headAction.inlineVersion,
        baseInlineVersionComment: baseAction.inlineVersion,
      })
    }
  }

  return changes
}

export async function getFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  filePath: string,
  ref: string,
): Promise<string | null> {
  try {
    const response = await octokit.rest.repos.getContent({owner, repo, path: filePath, ref})
    if ('content' in response.data && response.data.content) {
      return Buffer.from(response.data.content, 'base64').toString('utf8')
    }
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      (error as {status?: unknown}).status === 404
    ) {
      return null
    }
    throw error
  }

  return null
}

export function deduplicateChanges(
  changes: GitHubActionsDependencyChange[],
): GitHubActionsDependencyChange[] {
  const seen = new Set<string>()
  const deduplicated: GitHubActionsDependencyChange[] = []

  for (const change of changes) {
    const key = `${change.name}:${change.workflowFile}:${change.stepName}:${change.currentRef}:${change.newRef}`
    if (!seen.has(key)) {
      seen.add(key)
      deduplicated.push(change)
    }
  }

  return deduplicated
}
