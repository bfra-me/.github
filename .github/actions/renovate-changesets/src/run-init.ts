import type {Octokit} from '@octokit/rest'
import type {Config} from './action-config'
import type {RenovateDependency, RenovatePRContext} from './renovate-parser'
import {promises as fs} from 'node:fs'
import process from 'node:process'
import * as core from '@actions/core'
import {Octokit as OctokitClient} from '@octokit/rest'
import {getConfig} from './action-config'
import {runDetectors} from './detector-runner'
import {RenovateParser} from './renovate-parser'
import {isValidBranch} from './utils'

interface PullRequestInfo {
  number: number
  title?: string
  user: {login: string}
  head?: {ref?: string}
}

interface GitHubEventWithPR {
  pull_request: PullRequestInfo
}

interface ChangedPRFile {
  filename: string
  status: string
  additions: number
  deletions: number
}

export interface RunInitialization {
  parser: RenovateParser
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

export async function initializeRun(): Promise<RunInitialization | null> {
  const parser = new RenovateParser()
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
  const isRenovatePR = ['renovate[bot]', 'bfra-me[bot]'].includes(pr.user.login)
  if (!isRenovatePR) {
    core.info('Not a Renovate PR, skipping')
    return null
  }

  const config = await getConfig()
  const branchName = pr.head?.ref
  if (branchName == null || branchName.length === 0) {
    core.info('Unable to determine branch name, skipping')
    return null
  }

  if (
    !isValidBranch(
      branchName,
      config.branchPrefix || 'renovate/',
      config.skipBranchPrefixCheck || false,
      parser,
    )
  ) {
    core.info(
      `Branch ${branchName} does not match expected prefix ${config.branchPrefix || 'renovate/'}, skipping`,
    )
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

  const prContext = await parser.extractPRContext(octokit, owner, repo, pr.number, pr)
  const {enhancedDependencies} = await runDetectors({
    octokit,
    owner,
    repo,
    prNumber: pr.number,
    files,
    prContext,
  })

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
    parser,
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
