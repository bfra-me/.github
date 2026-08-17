import {promises as fs} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {run} from '../../src/run.js'
import {getContractState, getOctokitMocks} from './setup.js'

const fixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/marcusrbrown-infra/repo',
)
const contractState = getContractState()
const octokitMocks = getOctokitMocks()
let workspace = ''

describe('renovate-changesets bot identity contracts', () => {
  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'renovate-changesets-identity-contract-'))
    await fs.cp(fixtureRoot, workspace, {recursive: true})
    expect(await pathExists(path.join(workspace, 'node_modules'))).toBe(false)

    process.env.NODE_ENV = 'production'
    delete process.env.VITEST
    process.env.GITHUB_EVENT_NAME = 'pull_request_target'
    process.env.GITHUB_EVENT_PATH = path.join(workspace, 'event.json')
    process.env.GITHUB_REPOSITORY = 'marcusrbrown/infra'
    process.env.GITHUB_WORKSPACE = workspace
    process.env.GITHUB_TOKEN = 'contract-token'
    delete process.env.BRANCH_PREFIX
    delete process.env.SKIP_BRANCH_CHECK
    delete process.env.SORT_CHANGESETS
    delete process.env.TARGET_PACKAGE

    contractState.inputs = {
      token: 'contract-token',
      'working-directory': workspace,
      'branch-prefix': 'renovate/',
      'config-file': '',
      config: '',
      'default-changeset-type': 'patch',
      'exclude-patterns': '',
      'target-package': '',
      'commit-message-template': 'chore: add changeset for renovate updates',
      'max-retries': '0',
      'retry-delay': '100',
      'max-grouped-prs': '10',
      'grouped-pr-failure-strategy': 'continue',
    }
    contractState.booleanInputs = {
      'skip-branch-prefix-check': false,
      sort: false,
      emoji: false,
      'comment-pr': false,
      'update-pr-description': false,
      'commit-back': false,
      'auto-resolve-conflicts': true,
      'update-grouped-prs': false,
      'skip-current-pr-in-group': true,
    }
    octokitMocks.listFiles.mockResolvedValue({data: []})
    octokitMocks.listCommits.mockResolvedValue({data: []})
  })

  afterEach(async () => {
    if (workspace.length > 0) await fs.rm(workspace, {recursive: true, force: true})
    workspace = ''
  })

  it('fails for an unrecognized Renovate bot identity', async () => {
    await writeEvent({
      number: 1301,
      login: 'new-renovate-app[bot]',
      branch: 'renovate/something',
    })

    await run()

    const failureMessage = contractState.failed.join('\n')
    expect(failureMessage).toContain('1301')
    expect(failureMessage).toContain('new-renovate-app[bot]')
    expect(await listChangesetFiles()).toEqual([])
  })

  it('skips a non-Renovate bot on a non-Renovate branch', async () => {
    await writeEvent({
      number: 1302,
      login: 'dependabot[bot]',
      branch: 'dependabot/npm_and_yarn/foo-1.2.3',
    })

    await run()

    expect(contractState.failed).toEqual([])
    expect(await listChangesetFiles()).toEqual([])
  })
})

async function writeEvent(params: {number: number; login: string; branch: string}): Promise<void> {
  await fs.writeFile(
    process.env.GITHUB_EVENT_PATH ?? '',
    JSON.stringify({
      pull_request: {
        number: params.number,
        title: 'chore(deps): update eceasy/cli-proxy-api Docker tag',
        body: `This PR contains the following updates:\n\n| Package | Update | Change |\n|---|---|---|\n| eceasy/cli-proxy-api | digest | \`old\` -> \`new\` |\n`,
        user: {login: params.login},
        labels: [{name: 'dependencies'}, {name: 'renovate'}],
        head: {ref: params.branch},
      },
    }),
    'utf8',
  )
}

async function listChangesetFiles(): Promise<string[]> {
  const entries = await fs.readdir(path.join(workspace, '.changeset'), {withFileTypes: true})
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name)
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}
