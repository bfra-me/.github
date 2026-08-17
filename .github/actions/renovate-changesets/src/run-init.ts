import type {Octokit} from '@octokit/rest'
import type {Config} from './action-config'
import type {RenovateDependency, RenovatePRContext} from './renovate-parser'
import {promises as fs} from 'node:fs'
import process from 'node:process'
import * as core from '@actions/core'
import {Octokit as OctokitClient} from '@octokit/rest'
import {getConfig} from './action-config'
import {createBranchPatterns, extractPRContext, getBranchType} from './renovate-parser'
import {isValidBranch} from './utils'

interface PullRequestInfo {
  number: number
  title: string
  body?: string | null
  user: {login: string}
  labels?: {name?: string | null}[] | null
  head?: {ref?: string}
}

interface GitHubEventWithPR {
  pull_request: PullRequestInfo
}

// bfra-me and mrbro-bot are self-hosted Renovate app identities; renovate[bot] is the hosted one.
// Unknown identities skip rather than generate, so a missing entry fails visibly instead of silently.
const ACCEPTED_RENOVATE_BOT_LOGINS = new Set(['bfra-me[bot]', 'mrbro-bot[bot]', 'renovate[bot]'])

interface ChangedPRFile {
  filename: string
  status: string
  additions: number
  deletions: number
}

export interface RunInitialization {
  config: Config
  octokit: Octokit
  owner: string
  repo: string
  pr: PullRequestInfo
  files: ChangedPRFile[]
  changedFiles: string[]
  prContext: RenovatePRContext
  enhancedDependencies: RenovateDependency[]
  workingDirectory: string
  branchName: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasPullRequest(data: unknown): data is GitHubEventWithPR {
  if (!isObject(data) || !isObject(data.pull_request)) {
    return false
  }

  const pullRequest = data.pull_request
  if (typeof pullRequest.number !== 'number' || !isObject(pullRequest.user)) {
    return false
  }

  return typeof pullRequest.user.login === 'string'
}

export function isAcceptedRenovateBotLogin(login: string): boolean {
  return ACCEPTED_RENOVATE_BOT_LOGINS.has(login.toLowerCase())
}

export async function initializeRun(): Promise<RunInitialization | null> {
  if (process.env.GITHUB_EVENT_NAME === 'merge_group') {
    core.info(
      'Merge group event detected; no pull request body available, skipping changeset creation',
    )
    return null
  }

  const branchPatterns = createBranchPatterns()
  const repository = process.env.GITHUB_REPOSITORY
  const eventPath = process.env.GITHUB_EVENT_PATH

  if (repository == null || eventPath == null) {
    core.info('Missing repository or event information, skipping')
    return null
  }

  let eventData: unknown = {}
  try {
    eventData = JSON.parse(await fs.readFile(eventPath, 'utf8'))
  } catch {
    core.warning('Unable to parse event data, continuing without some validations')
  }

  if (!hasPullRequest(eventData)) {
    core.info('Not a pull request, skipping')
    return null
  }

  const pr = eventData.pull_request
  const config = await getConfig()
  const isRenovatePR = isAcceptedRenovateBotLogin(pr.user.login)
  const branchName = pr.head?.ref
  if (branchName == null || branchName.length === 0) {
    core.info(
      isRenovatePR ? 'Unable to determine branch name, skipping' : 'Not a Renovate PR, skipping',
    )
    return null
  }

  const branchPrefix = config.branchPrefix || 'renovate/'
  const branchMatchesExpected = isValidBranch(
    branchName,
    branchPrefix,
    config.skipBranchPrefixCheck || false,
    branchPatterns,
  )
  const isDependabotBranch = getBranchType(branchName, branchPatterns) === 'dependabot'
  const isRenovateShapedBranch =
    branchMatchesExpected && (!isDependabotBranch || branchName.startsWith(branchPrefix))

  if (!isRenovatePR) {
    if (isRenovateShapedBranch) {
      core.setFailed(
        `PR #${pr.number} is from unrecognized Renovate bot identity ${pr.user.login}. Add this login to ACCEPTED_RENOVATE_BOT_LOGINS in run-init.ts.`,
      )
    } else {
      core.info('Not a Renovate PR, skipping')
    }
    return null
  }

  if (!branchMatchesExpected) {
    core.info(`Branch ${branchName} does not match expected prefix ${branchPrefix}, skipping`)
    return null
  }

  const [owner, repo] = repository.split('/')
  if (owner == null || owner.length === 0 || repo == null || repo.length === 0) {
    core.setFailed('Could not determine repository owner or name.')
    return null
  }

  const token = core.getInput('token')
  const workingDirectory = core.getInput('working-directory')
  if (token.length === 0) {
    throw new Error('GitHub token is required')
  }
  if (workingDirectory.length === 0) {
    throw new Error('Working directory is required')
  }

  try {
    await fs.access(workingDirectory)
  } catch {
    throw new Error(`Working directory does not exist: ${workingDirectory}`)
  }

  const octokit = new OctokitClient({auth: token})
  const {data} = await octokit.rest.pulls.listFiles({owner, repo, pull_number: pr.number})
  const files: ChangedPRFile[] = data.map(file => ({
    filename: file.filename,
    status: file.status,
    additions: file.additions ?? 0,
    deletions: file.deletions ?? 0,
  }))
  const changedFiles = files.map(file => file.filename)

  core.info(`Changed files: ${changedFiles.join(', ')}`)
  core.info(`Using config: ${JSON.stringify(config, null, 2)}`)

  const prContext = await extractPRContext(octokit, owner, repo, pr.number, pr)
  const enhancedDependencies = prContext.dependencies

  core.info(
    `Parsed PR context: ${JSON.stringify(
      {
        isRenovateBot: prContext.isRenovateBot,
        isGroupedUpdate: prContext.isGroupedUpdate,
        isSecurityUpdate: prContext.isSecurityUpdate,
        manager: prContext.manager,
        updateType: prContext.updateType,
        dependencyCount: prContext.dependencies.length,
      },
      null,
      2,
    )}`,
  )

  return {
    config,
    octokit,
    owner,
    repo,
    pr,
    files,
    changedFiles,
    prContext,
    enhancedDependencies,
    workingDirectory,
    branchName,
  }
}
