import type {Octokit} from '@octokit/rest'

import type {RenovatePRContext} from './renovate-parser-types.js'
import {extractDependenciesFromPR} from './renovate-dependency-extractor.js'
import {detectManagerFromFiles} from './renovate-manager-detector.js'
import {parseCommitMessage} from './renovate-title-parser.js'

export interface PullRequestData {
  title: string
  body?: string | null
  user: {login: string}
  head?: {ref?: string | null} | null
}

export async function extractPRContext(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  prData: PullRequestData,
): Promise<RenovatePRContext> {
  const {data: files} = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
  })

  const {data: commits} = await octokit.rest.pulls.listCommits({
    owner,
    repo,
    pull_number: prNumber,
  })

  const commitMessages = commits.map(commit => commit.commit.message)
  const dependencies = [] as RenovatePRContext['dependencies']
  let isGroupedUpdate = false
  let isSecurityUpdate = false
  let detectedManager: RenovatePRContext['manager'] = 'unknown'
  let detectedUpdateType: RenovatePRContext['updateType'] = 'patch'

  for (const commitMessage of commitMessages) {
    const parsedCommit = parseCommitMessage(commitMessage)
    if (parsedCommit.renovateInfo != null) {
      dependencies.push(
        ...extractDependenciesFromPR(
          prData.title,
          prData.body ?? '',
          commitMessage,
          parsedCommit.renovateInfo.manager,
        ),
      )

      if (parsedCommit.renovateInfo.manager !== 'unknown') {
        detectedManager = parsedCommit.renovateInfo.manager
      }

      detectedUpdateType = parsedCommit.renovateInfo.updateType
    }

    const commitMessageLower = commitMessage.toLowerCase()
    if (
      commitMessageLower.includes('security') ||
      commitMessageLower.includes('vulnerability') ||
      commitMessageLower.includes('cve-')
    ) {
      isSecurityUpdate = true
    }

    if (
      commitMessageLower.includes('group') ||
      prData.title.toLowerCase().includes('group') ||
      dependencies.length > 1
    ) {
      isGroupedUpdate = true
    }
  }

  if (detectedManager === 'unknown') {
    detectedManager = detectManagerFromFiles(files)
  }

  if (dependencies.length === 0) {
    dependencies.push(
      ...extractDependenciesFromPR(prData.title, prData.body ?? '', '', detectedManager),
    )
  }

  return {
    dependencies,
    isRenovateBot: ['renovate[bot]', 'bfra-me[bot]', 'dependabot[bot]'].includes(prData.user.login),
    branchName: prData.head?.ref ?? '',
    prTitle: prData.title,
    prBody: prData.body ?? '',
    commitMessages,
    isGroupedUpdate,
    isSecurityUpdate,
    updateType: detectedUpdateType,
    manager: detectedManager,
    files: files.map(file => ({
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
    })),
  }
}
