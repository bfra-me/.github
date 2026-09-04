import type {RetryOptions} from '@octokit/plugin-retry'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {run} from '../index.js'

const {mockGetInput, mockSetFailed, mockInfo, mockLoadConfig, mockApplySettings, MockOctokit} =
  vi.hoisted(() => {
    const mockGetInput = vi.fn<(name: string, options?: {required?: boolean}) => string>(
      (name: string) => {
        if (name === 'token') {
          return 'test-token'
        }

        if (name === 'settings') {
          return ''
        }

        return ''
      },
    )
    const mockSetFailed = vi.fn()
    const mockInfo = vi.fn()
    const mockLoadConfig = vi.fn().mockResolvedValue({repository: {description: 'test'}})
    const mockApplySettings = vi.fn().mockResolvedValue(undefined)

    // Octokit.plugin(retry) is called at module scope in `src/index.ts`. The mocked
    // constructor needs a static `plugin()` passthrough so composing the client doesn't
    // throw; it returns the same mock constructor so existing assertions against
    // `MockOctokit` (calls, results) keep working unchanged. It also needs a `retry.retryRequest`
    // stub because `createOctokitClient` unconditionally wraps that function for R10 per-attempt
    // logging -- these `run`-describe-block tests never issue a real request that retries, so the
    // stub is never actually invoked, but it must exist or the wrap itself throws.
    const MockOctokitConstructor = vi.fn(function (
      this: {retry: {retryRequest: unknown}},
      _options: {auth: string},
    ) {
      this.retry = {retryRequest: (error: unknown) => error}
      return this
    })
    const MockOctokit = Object.assign(MockOctokitConstructor, {
      plugin: vi.fn(() => MockOctokitConstructor),
    })

    return {mockGetInput, mockSetFailed, mockInfo, mockLoadConfig, mockApplySettings, MockOctokit}
  })

vi.mock('@actions/core', () => ({
  getInput: mockGetInput,
  setFailed: mockSetFailed,
  info: mockInfo,
}))

vi.mock('@actions/github', () => ({
  context: {
    repo: {owner: 'test-owner', repo: 'test-repo'},
  },
}))

vi.mock('@octokit/rest', () => ({
  Octokit: MockOctokit,
}))

vi.mock('../config.js', () => ({
  loadConfig: mockLoadConfig,
}))

vi.mock('../plugins/index.js', () => ({
  applySettings: mockApplySettings,
}))

async function runWithEntrypointCatch(): Promise<void> {
  await run().catch(error => {
    mockSetFailed(error instanceof Error ? error.message : String(error))
  })
}

describe('run', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockGetInput.mockImplementation((name: string) => {
      if (name === 'token') {
        return 'test-token'
      }

      if (name === 'settings') {
        return ''
      }

      return ''
    })

    mockLoadConfig.mockResolvedValue({repository: {description: 'test'}})
    mockApplySettings.mockResolvedValue(undefined)
  })

  it('wires token, default settings path, loadConfig, and applySettings', async () => {
    const config = {repository: {name: 'example-repo'}}
    mockLoadConfig.mockResolvedValueOnce(config)

    await run()

    expect(mockGetInput).toHaveBeenCalledWith('token', {required: true})
    expect(mockGetInput).toHaveBeenCalledWith('settings')
    expect(MockOctokit).toHaveBeenCalledWith({auth: 'test-token'})

    const octokitInstance = MockOctokit.mock.results[0]?.value
    expect(mockLoadConfig).toHaveBeenCalledWith(
      octokitInstance,
      'test-owner',
      'test-repo',
      '.github/settings.yml',
    )
    expect(mockApplySettings).toHaveBeenCalledWith(
      octokitInstance,
      'test-owner',
      'test-repo',
      config,
    )
    expect(mockSetFailed).not.toHaveBeenCalled()
  })

  it('uses custom settings path when provided', async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === 'token') {
        return 'test-token'
      }

      if (name === 'settings') {
        return '.github/custom-settings.yml'
      }

      return ''
    })

    await run()

    const octokitInstance = MockOctokit.mock.results[0]?.value
    expect(mockLoadConfig).toHaveBeenCalledWith(
      octokitInstance,
      'test-owner',
      'test-repo',
      '.github/custom-settings.yml',
    )
  })

  it('falls back to default settings path when settings input is empty string', async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === 'token') {
        return 'test-token'
      }

      if (name === 'settings') {
        return ''
      }

      return ''
    })

    await run()

    const octokitInstance = MockOctokit.mock.results[0]?.value
    expect(mockLoadConfig).toHaveBeenCalledWith(
      octokitInstance,
      'test-owner',
      'test-repo',
      '.github/settings.yml',
    )
  })

  it('calls setFailed with error message when loadConfig throws', async () => {
    mockLoadConfig.mockRejectedValueOnce(new Error('load failed'))

    await runWithEntrypointCatch()

    expect(mockSetFailed).toHaveBeenCalledWith('load failed')
  })

  it('calls setFailed with error message when applySettings throws', async () => {
    mockApplySettings.mockRejectedValueOnce(new Error('apply failed'))

    await runWithEntrypointCatch()

    expect(mockSetFailed).toHaveBeenCalledWith('apply failed')
  })

  it('logs loading, applying, and success messages', async () => {
    await run()

    expect(mockInfo).toHaveBeenCalledWith('Loading repository settings...')
    expect(mockInfo).toHaveBeenCalledWith('Applying repository settings...')
    expect(mockInfo).toHaveBeenCalledWith('Repository settings applied successfully')
  })
})

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json'},
  })
}

/**
 * Builds a client through the *actual* `createOctokitClient` in `src/index.ts` -- not a
 * reimplementation of its composition -- so these tests pin production wiring rather than only
 * proving the retry library works in isolation. `@octokit/rest` is mocked for the whole file (see
 * the `run` describe block above), so this temporarily unmocks it and forces a fresh module
 * evaluation via `vi.resetModules()` before dynamically importing `../index.js`; `afterEach`
 * restores the mock so it doesn't leak into other tests. The transport is a stubbed global
 * `fetch`, since `createOctokitClient` takes only a token and has no seam for injecting one
 * directly. `retryAfterBaseValue` is lowered from the library's 1000ms default so the quadratic
 * backoff (normally 1s + 4s + 9s) doesn't slow the suite; it does not change the retry *count*
 * bound, which is what these tests verify.
 *
 * Uses `vi.doUnmock` rather than `vi.unmock`: the latter is hoisted to the top of the module by
 * Vitest's static analysis even when called from inside a function body, which would permanently
 * cancel the top-level `vi.mock('@octokit/rest', ...)` for the *entire* file before any test runs
 * -- silently swapping every `run`-describe-block test onto a real, unmocked Octokit. `doUnmock`
 * is the non-hoisted, call-site-scoped counterpart and only takes effect when this function
 * actually executes.
 *
 * Re-importing `../index.js` re-runs its module-level `run().catch(...)` side effect, but that is
 * harmless here: `loadConfig`/`applySettings` remain mocked no-ops that never call `.request()` on
 * the octokit instance they're given, so the side-effect run never touches `fetchMock`.
 */
async function createProductionOctokitClient(
  fetchImpl: typeof fetch,
  retryOptions: RetryOptions = {retryAfterBaseValue: 1},
) {
  vi.stubGlobal('fetch', fetchImpl)
  vi.doUnmock('@octokit/rest')
  vi.resetModules()
  const {createOctokitClient} = await import('../index.js')
  return createOctokitClient('test-token', retryOptions)
}

describe('octokit client retry behavior (R9)', () => {
  beforeEach(() => {
    mockInfo.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doMock('@octokit/rest', () => ({Octokit: MockOctokit}))
    vi.resetModules()
  })

  it('resolves after a transient 500 is followed by a successful attempt', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(500, {message: 'Internal Server Error'}))
      .mockResolvedValueOnce(jsonResponse(200, {rate: {limit: 5000}}))

    const octokit = await createProductionOctokitClient(fetchMock)
    const response = await octokit.request('GET /rate_limit')

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stops retrying after the configured ceiling for a persistently failing request', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(500, {message: 'Internal Server Error'}))

    const octokit = await createProductionOctokitClient(fetchMock)

    await expect(octokit.request('GET /rate_limit')).rejects.toMatchObject({status: 500})
    // 1 initial attempt + 3 retries (the library's default bound) = 4 total attempts.
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('does not retry a 422 client error', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(422, {message: 'Unprocessable Entity'}))

    const octokit = await createProductionOctokitClient(fetchMock)

    await expect(octokit.request('GET /rate_limit')).rejects.toMatchObject({status: 422})
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries a non-branches request too, proving the retry scope is client-wide', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(500, {message: 'Internal Server Error'}))
      .mockResolvedValueOnce(jsonResponse(200, []))

    const octokit = await createProductionOctokitClient(fetchMock)
    const response = await octokit.request('GET /repos/{owner}/{repo}/labels', {
      owner: 'bfra-me',
      repo: 'example-repo',
    })

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('logs each retry attempt with its attempt number and the triggering error (R10)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(500, {message: 'Internal Server Error'}))
      .mockResolvedValueOnce(jsonResponse(502, {message: 'Bad Gateway'}))
      .mockResolvedValueOnce(jsonResponse(200, {rate: {limit: 5000}}))

    const octokit = await createProductionOctokitClient(fetchMock)
    const response = await octokit.request('GET /rate_limit')

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(mockInfo).toHaveBeenCalledWith(expect.stringMatching(/attempt 1 of 3 max.*status 500/))
    expect(mockInfo).toHaveBeenCalledWith(expect.stringMatching(/attempt 2 of 3 max.*status 502/))
  })

  it('logs no retry noise when the first attempt succeeds (R10)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, {rate: {limit: 5000}}))

    const octokit = await createProductionOctokitClient(fetchMock)
    const response = await octokit.request('GET /rate_limit')

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mockInfo).not.toHaveBeenCalledWith(
      expect.stringContaining('Retrying GitHub API request'),
    )
  })
})
