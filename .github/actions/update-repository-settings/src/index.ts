import * as core from '@actions/core'
import * as github from '@actions/github'
import {retry, type RetryOptions} from '@octokit/plugin-retry'
import {Octokit} from '@octokit/rest'
import {loadConfig} from './config.js'
import {applySettings} from './plugins/index.js'

/**
 * `@octokit/plugin-retry@8.1.1` computes each attempt's backoff in `dist-src/error-request.js` as
 * `retryAfter = Math.pow((options.request.retryCount || 0) + 1, 2)` -- a fixed quadratic in the
 * 1-indexed attempt number -- and hands only that computed `retryAfter` (never the attempt number
 * itself) to `octokit.retry.retryRequest`. The plugin does not log anything internally: there is
 * no call to `octokit.log` anywhere in its source. Recovering the attempt number for R10 logging
 * therefore means inverting this exact, version-pinned formula rather than reading it off a seam
 * the library doesn't expose.
 */
function attemptNumberFromRetryAfter(retryAfter: number): number {
  return Math.round(Math.sqrt(retryAfter))
}

/**
 * Retries are bounded at the `@octokit/plugin-retry` default of 3 retries (4 attempts total),
 * scoped to the whole client rather than a single request type. That scope is intentional: it
 * covers branch-protection writes and read-backs symmetrically, plus every other plugin's
 * requests, without a hand-rolled status predicate (the plugin's own `doNotRetry` list already
 * excludes 4xx contract errors such as 422).
 *
 * The ceiling is deliberately small because each failing attempt against the observed endpoint
 * costs roughly 8 seconds, and backoff is quadratic (1s + 4s + 9s = 14s across 3 retries). A
 * persistently failing branch-protection call therefore adds at most roughly (3 * 8s) + 14s ~= 38s
 * before the aggregate error surfaces -- well within a GitHub Actions job's timeout budget, and
 * proportionate to a failure that is, by definition, not going to resolve on its own.
 *
 * `retryOptions` is an optional escape hatch for tests that need a faster-than-production backoff
 * (e.g. a lower `retryAfterBaseValue`) without changing the real client's timing; `run()` below
 * never passes one, so production behavior is exactly the defaults described above.
 *
 * Per-attempt visibility (R10) is wired by overriding `client.retry.retryRequest` -- the one
 * function the plugin calls on every retryable failure (see `attemptNumberFromRetryAfter` above)
 * -- rather than a `log` option, since the plugin never calls `octokit.log`.
 *
 * The composed client's instance type is annotated as the plain `Octokit` it structurally
 * extends -- `loadConfig` and `applySettings` only need `Octokit`'s surface, and the composed
 * type otherwise pulls in package-internal generics that TypeScript can't name portably across
 * the workspace's declaration output (TS2883).
 */
export function createOctokitClient(token: string, retryOptions?: RetryOptions): Octokit {
  const RetryOctokit = Octokit.plugin(retry)
  const client = new RetryOctokit({auth: token, retry: retryOptions})

  const originalRetryRequest = client.retry.retryRequest
  client.retry.retryRequest = (error, retries, retryAfter) => {
    const attempt = attemptNumberFromRetryAfter(retryAfter)
    core.info(
      `Retrying GitHub API request (attempt ${attempt} of ${retries} max) after error: ` +
        `${error.message || 'no error message'} (status ${error.status})`,
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
