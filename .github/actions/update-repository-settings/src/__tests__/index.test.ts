import {beforeEach, describe, expect, it, vi} from 'vitest'
import {run} from '../index.js'

const {mockGetInput, mockSetFailed, mockInfo, mockLoadConfig, mockApplySettings, MockOctokit} =
  vi.hoisted(() => ({
    mockGetInput: vi.fn<(name: string, options?: {required?: boolean}) => string>(
      (name: string) => {
        if (name === 'token') {
          return 'test-token'
        }

        if (name === 'settings') {
          return ''
        }

        return ''
      },
    ),
    mockSetFailed: vi.fn(),
    mockInfo: vi.fn(),
    mockLoadConfig: vi.fn().mockResolvedValue({repository: {description: 'test'}}),
    mockApplySettings: vi.fn().mockResolvedValue(undefined),
    MockOctokit: vi.fn((_options: {auth: string}) => {}),
  }))

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
