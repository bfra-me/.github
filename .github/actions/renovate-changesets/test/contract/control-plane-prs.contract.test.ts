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
  'fixtures/bfra-github',
)
const configMigrationBody = 'The Renovate config in this repository needs migrating.'
const onboardingBody = 'Welcome to Renovate.\n\n<!-- renovate-config-hash: abc123 -->'

let workspace = ''
const contractState = getContractState()
const octokitMocks = getOctokitMocks()

describe('Renovate control-plane PR contracts', () => {
  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'renovate-changesets-control-plane-'))
    await fs.cp(fixtureRoot, workspace, {recursive: true})

    process.env.NODE_ENV = 'production'
    delete process.env.VITEST
    process.env.GITHUB_EVENT_NAME = 'pull_request_target'
    process.env.GITHUB_EVENT_PATH = path.join(workspace, 'event.json')
    process.env.GITHUB_REPOSITORY = 'bfra-me/.github'
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
  })

  afterEach(async () => {
    if (workspace.length > 0) await fs.rm(workspace, {recursive: true, force: true})
    workspace = ''
  })

  it('skips recognized config migration PRs with complete zero outputs', async () => {
    await runScenario(
      2586,
      'renovate/config-migration',
      configMigrationBody,
      '.github/renovate.json5',
    )

    expect(contractState.failed).toEqual([])
    expect(contractState.outputs.get('changesets-created')).toBe('0')
    expect(contractState.outputs.get('changeset-files')).toBe('[]')
    expect(contractState.outputs.get('dependencies')).toBe('[]')
    expect(contractState.info).toContainEqual(expect.stringContaining('config-migration'))
    expect(await generatedChangesets()).toEqual([])
  })

  it('fails unrecognized no-package-table PRs instead of catching them all', async () => {
    await runScenario(
      2587,
      'renovate/unrelated-operation',
      '| Status | Details |\n|---|---|\n| maintenance | complete |',
      '.github/renovate.json5',
    )

    expect(contractState.failed).toHaveLength(1)
    expect(contractState.failed[0]).toContain('PR #2587')
    expect(await generatedChangesets()).toEqual([])
  })

  it('skips recognized onboarding PRs with both markers', async () => {
    await runScenario(2588, 'renovate/configure', onboardingBody, '.github/renovate.json5')

    expect(contractState.failed).toEqual([])
    expect(contractState.outputs.get('changesets-created')).toBe('0')
    expect(contractState.outputs.get('changeset-files')).toBe('[]')
    expect(contractState.info).toContainEqual(expect.stringContaining('onboarding'))
    expect(await generatedChangesets()).toEqual([])
  })
})

async function runScenario(
  number: number,
  branch: string,
  body: string,
  filename: string,
): Promise<void> {
  await fs.writeFile(
    process.env.GITHUB_EVENT_PATH ?? '',
    JSON.stringify({
      pull_request: {
        number,
        title: 'chore: Renovate control-plane operation',
        body,
        user: {login: 'renovate[bot]'},
        labels: [{name: 'renovate'}],
        head: {ref: branch},
      },
    }),
    'utf8',
  )
  octokitMocks.listFiles.mockResolvedValue({
    data: [{filename, status: 'modified', additions: 1, deletions: 1}],
  })
  octokitMocks.listCommits.mockResolvedValue({data: []})
  await run()
}

async function generatedChangesets(): Promise<string[]> {
  const entries = await fs.readdir(path.join(workspace, '.changeset'))
  return entries.filter(entry => entry.endsWith('.md')).sort()
}
