import process from 'node:process'
import {describe, expect, it} from 'vitest'
import {initializeRun, isAcceptedRenovateBotLogin} from '../src/run-init'
import {mockedFileSystem, mockedGitHubActions} from './setup'

describe('initializeRun live guards', () => {
  it('skips merge_group events before reading event data', async () => {
    process.env.GITHUB_EVENT_NAME = 'merge_group'
    process.env.GITHUB_REPOSITORY = 'owner/repo'
    process.env.GITHUB_EVENT_PATH = '/tmp/event.json'

    await expect(initializeRun()).resolves.toBeNull()
    expect(mockedFileSystem.readFile).not.toHaveBeenCalled()
    expect(mockedGitHubActions.core.info).toHaveBeenCalledWith(
      'Merge group event detected; no pull request body available, skipping changeset creation',
    )
  })

  it('skips a bot-authored PR that is not from an accepted Renovate identity', async () => {
    process.env.GITHUB_EVENT_NAME = 'pull_request'
    process.env.GITHUB_REPOSITORY = 'owner/repo'
    process.env.GITHUB_EVENT_PATH = '/tmp/event.json'
    mockedFileSystem.readFile.mockResolvedValue(
      JSON.stringify({
        pull_request: {
          number: 1011,
          user: {login: 'other-bot[bot]'},
          head: {ref: 'dependabot/npm/react-18.x'},
        },
      }),
    )

    await expect(initializeRun()).resolves.toBeNull()
    expect(mockedGitHubActions.core.info).toHaveBeenCalledWith('Not a Renovate PR, skipping')
    expect(mockedGitHubActions.core.getInput).toHaveBeenCalledWith('config-file')
  })

  // These logins are the identities that actually open Renovate PRs today: bfra-me[bot] in
  // bfra-me/.github and bfra-me/works, mrbro-bot[bot] in marcusrbrown/infra. Both orgs self-host
  // Renovate, so neither uses the hosted renovate[bot] identity. Dropping one silently stops
  // changeset generation for that repo, so assert them explicitly.
  it('accepts every Renovate identity in use across consumer repositories', () => {
    expect(isAcceptedRenovateBotLogin('bfra-me[bot]')).toBe(true)
    expect(isAcceptedRenovateBotLogin('mrbro-bot[bot]')).toBe(true)
    expect(isAcceptedRenovateBotLogin('renovate[bot]')).toBe(true)
  })

  it('rejects unrelated bot identities', () => {
    expect(isAcceptedRenovateBotLogin('other-bot[bot]')).toBe(false)
    expect(isAcceptedRenovateBotLogin('fro-bot[bot]')).toBe(false)
  })
})
