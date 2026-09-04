import * as core from '@actions/core'
import * as github from '@actions/github'
import {retry, type RetryOptions} from '@octokit/plugin-retry'
import {Octokit} from '@octokit/rest'
import {loadConfig} from './config.js'
import {applySettings} from './plugins/index.js'

/**
 * Retries are configured on the whole client so branch-protection writes, read-backs, and other
 * GitHub API requests receive consistent retry behavior. `retryOptions` exists for tests that
 * need to override the production retry timing.
 */
export function createOctokitClient(token: string, retryOptions?: RetryOptions): Octokit {
  const RetryOctokit = Octokit.plugin(retry)
  const client = new RetryOctokit({auth: token, retry: retryOptions})

  const originalRetryRequest = client.retry.retryRequest
  client.retry.retryRequest = (error, retries, retryAfter) => {
    core.info(
      `Retrying GitHub API request after error: ${error.message || 'no error message'} ` +
        `(status ${error.status})`,
    )
    return originalRetryRequest(error, retries, retryAfter)
  }

  return client
}

export async function run(): Promise<void> {
  const token = core.getInput('token', {required: true})
  const settingsPath = core.getInput('settings') || '.github/settings.yml'
  const octokit = createOctokitClient(token)
  const {owner, repo} = github.context.repo

  core.info('Loading repository settings...')
  const config = await loadConfig(octokit, owner, repo, settingsPath)

  core.info('Applying repository settings...')
  await applySettings(octokit, owner, repo, config)

  core.info('Repository settings applied successfully')
}

run().catch(error => {
  core.setFailed(error instanceof Error ? error.message : String(error))
})
