import {spawnSync} from 'node:child_process'
import {promises as fs} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {run} from '../../src/run.js'
import {authoredReleases, effectiveReleases, runChangesetsOracle} from './changesets-oracle.js'
import {getContractState, getOctokitMocks} from './setup.js'

const fixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/marcusrbrown-infra/repo',
)

let workspace = ''
const contractState = getContractState()
const octokitMocks = getOctokitMocks()

describe('provider update release contract', () => {
  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'renovate-changesets-provider-'))
    await fs.cp(fixtureRoot, workspace, {recursive: true})
    initializeGitRepository(workspace)

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

    await fs.writeFile(
      process.env.GITHUB_EVENT_PATH,
      JSON.stringify({
        pull_request: {
          number: 1120,
          title: 'chore(deps): update dependency yaml to v2.9.0',
          body: 'This PR contains the following updates:\n\n| Package | Type | Update | Change |\n|---|---|---|---|\n| yaml | dependencies | minor | `2.8.0` -> `2.9.0` |',
          user: {login: 'mrbro-bot[bot]'},
          labels: [{name: 'dependencies'}, {name: 'renovate'}],
          head: {ref: 'renovate/yaml-2.x'},
        },
      }),
      'utf8',
    )

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

    octokitMocks.listFiles.mockResolvedValue({
      data: [
        {filename: 'packages/shared/package.json', status: 'modified', additions: 1, deletions: 1},
      ],
    })
    octokitMocks.listCommits.mockResolvedValue({
      data: [{commit: {message: 'chore(deps): update dependency yaml to v2.9.0'}}],
    })
  })

  afterEach(async () => {
    if (workspace.length > 0) await fs.rm(workspace, {recursive: true, force: true})
    workspace = ''
  })

  it('authors the provider and lets Changesets add its dependent', async () => {
    await run()

    const oracle = await runChangesetsOracle('provider-update', workspace, {
      errors: contractState.errors,
      warnings: contractState.warnings,
      outputs: contractState.outputs,
    })
    expect(authoredReleases(oracle.releasePlan).map(({name}) => name)).toEqual([
      '@marcusrbrown/infra-shared',
    ])
    expect(effectiveReleases(oracle.releasePlan).map(({name}) => name)).toEqual([
      '@marcusrbrown/infra-shared',
      '@marcusrbrown/infra-gateway',
    ])
  })
})

function initializeGitRepository(directory: string): void {
  for (const args of [
    ['init', '-b', 'main'],
    ['add', '.'],
    [
      '-c',
      'user.name=contract-test',
      '-c',
      'user.email=contract-test@example.invalid',
      'commit',
      '-m',
      'fixture baseline',
    ],
  ]) {
    const result = spawnSync('git', args, {cwd: directory, encoding: 'utf8'})
    if (result.status !== 0) {
      throw new Error(
        `Failed to initialize fixture git repository: git ${args.join(' ')}\n${result.stderr}`,
      )
    }
  }
}
