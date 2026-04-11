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
  let detectedManager: RenovatePRContext['manager'] = 'unknown'
  let detectedUpdateType: RenovatePRContext['updateType'] = 'patch'

  const titleBodyDeps = extractDependenciesFromPR(prData.title, prData.body ?? '', '', 'unknown')

  const commitOnlyDeps: RenovatePRContext['dependencies'] = []
  let hasSecuritySignal = false

  for (const commitMessage of commitMessages) {
    const parsedCommit = parseCommitMessage(commitMessage)
    if (parsedCommit.renovateInfo != null) {
      const commitDeps = extractDependenciesFromPR(
        '',
        '',
        commitMessage,
        parsedCommit.renovateInfo.manager,
      )
      commitOnlyDeps.push(...commitDeps)

      if (parsedCommit.renovateInfo.manager !== 'unknown') {
        detectedManager = parsedCommit.renovateInfo.manager
      }

      detectedUpdateType = parsedCommit.renovateInfo.updateType
    }

    const lower = commitMessage.toLowerCase()
    if (lower.includes('security') || lower.includes('vulnerability') || lower.includes('cve-')) {
      hasSecuritySignal = true
    }
  }

  if (detectedManager === 'unknown') {
    detectedManager = detectManagerFromFiles(files)
  }

  const mergedDeps = deduplicateDependencies([...titleBodyDeps, ...commitOnlyDeps])
  const canonicalDeps =
    mergedDeps.length > 0
      ? mergedDeps
      : extractDependenciesFromPR(prData.title, prData.body ?? '', '', detectedManager)

  const validatedDeps = filterPhantomDependencies(canonicalDeps, files, prData.title)

  const isSecurityUpdate = hasSecuritySignal || validatedDeps.some(d => d.isSecurityUpdate)
  const hasGroupSignal =
    commitMessages.some(m => m.toLowerCase().includes('group')) ||
    prData.title.toLowerCase().includes('group')
  const isGroupedUpdate = hasGroupSignal || validatedDeps.length > 1

  return {
    dependencies: validatedDeps,
    isRenovateBot: prData.user.login.endsWith('[bot]'),
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

function deduplicateDependencies(
  deps: RenovatePRContext['dependencies'],
): RenovatePRContext['dependencies'] {
  return deps.reduce<RenovatePRContext['dependencies']>((acc, dep) => {
    const existing = acc.find(d => d.name === dep.name)
    if (existing == null) {
      acc.push(dep)
    } else {
      if (dep.currentVersion != null && existing.currentVersion == null) {
        existing.currentVersion = dep.currentVersion
      }
      if (dep.newVersion != null && existing.newVersion == null) {
        existing.newVersion = dep.newVersion
      }
      if (existing.manager === 'unknown' && dep.manager !== 'unknown') {
        existing.manager = dep.manager
      }
      if (existing.updateType === 'patch' && dep.updateType !== 'patch') {
        existing.updateType = dep.updateType
      }
      existing.packageFile = existing.packageFile || dep.packageFile
      existing.scope = existing.scope || dep.scope
      if (dep.isSecurityUpdate) existing.isSecurityUpdate = true
      if (dep.isGrouped) existing.isGrouped = true
      existing.groupName = existing.groupName ?? dep.groupName
      existing.securitySeverity = existing.securitySeverity ?? dep.securitySeverity
    }
    return acc
  }, [])
}

function filterPhantomDependencies(
  dependencies: RenovatePRContext['dependencies'],
  files: {filename: string; patch?: string}[],
  prTitle: string,
): RenovatePRContext['dependencies'] {
  const hasAnyMissingPatch = files.some(f => f.patch == null || f.patch.length === 0)
  const allPatches = files.map(f => f.patch ?? '').join('\n')
  if (allPatches.length === 0 || hasAnyMissingPatch) return dependencies

  const titleLower = prTitle.toLowerCase()
  const patchesLower = allPatches.toLowerCase()

  return dependencies.filter(dep => {
    const nameLower = dep.name.toLowerCase()
    if (titleLower.includes(nameLower)) return true
    if (patchesLower.includes(nameLower)) return true
    return false
  })
}
