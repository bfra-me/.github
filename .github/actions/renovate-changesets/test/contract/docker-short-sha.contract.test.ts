import {spawnSync} from 'node:child_process'
import {promises as fs} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {run} from '../../src/run.js'
import {listGeneratedChangesets, runChangesetsOracle} from './changesets-oracle.js'
import {getContractState, getExecMocks, getOctokitMocks} from './setup.js'

const fixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/marcusrbrown-infra/repo',
)

let workspace = ''
const contractState = getContractState()
const execMocks = getExecMocks()
const octokitMocks = getOctokitMocks()

describe('renovate-changesets consumer contract', () => {
  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'renovate-changesets-contract-'))
    await fs.cp(fixtureRoot, workspace, {recursive: true})

    expect(await pathExists(path.join(workspace, 'node_modules'))).toBe(false)
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
          number: 1103,
          title: 'chore(deps): update eceasy/cli-proxy-api Docker tag',
          body: `This PR contains the following updates:\n\n| Package | Update | Change |\n|---|---|---|\n| eceasy/cli-proxy-api | digest | \`0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\` -> \`abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789\` |\n`,
          user: {login: 'mrbro-bot[bot]'},
          labels: [{name: 'dependencies'}, {name: 'renovate'}],
          head: {ref: 'renovate/eceasy-cli-proxy-api-7.x'},
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
        {
          filename: 'apps/gateway/Dockerfile',
          status: 'modified',
          additions: 1,
          deletions: 1,
          patch:
            '-FROM eceasy/cli-proxy-api:v7.2.134@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\n+FROM eceasy/cli-proxy-api:v7.2.134@sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        },
      ],
    })
    octokitMocks.listCommits.mockResolvedValue({
      data: [{commit: {message: 'chore(deps): update eceasy/cli-proxy-api Docker tag'}}],
    })
    execMocks.getExecOutput.mockResolvedValue({stdout: 'contract1\n', stderr: '', exitCode: 0})
  })

  afterEach(async () => {
    if (workspace.length > 0) await fs.rm(workspace, {recursive: true, force: true})
    workspace = ''
  })

  it('generates a Changesets-valid Docker changeset with a short SHA', async () => {
    await run()

    expect(contractState.failed).toEqual([])
    expect(contractState.warnings).toContainEqual(
      expect.stringContaining('@changesets/write failed'),
    )
    const filenames = await listGeneratedChangesets(workspace)
    expect(contractState.outputs.get('changesets-created')).toBe(String(filenames.length))
    expect(JSON.parse(contractState.outputs.get('changeset-files') ?? 'null')).toEqual(filenames)
    expect(filenames.length).toBeGreaterThan(0)

    for (const filename of filenames) {
      const stat = await fs.stat(path.join(workspace, filename))
      expect(stat.isFile()).toBe(true)
    }

    const reportedFiles = JSON.parse(
      contractState.outputs.get('changeset-files') ?? '[]',
    ) as string[]
    expect(filenames).toEqual(reportedFiles)

    const oracle = await runChangesetsOracle('docker-short-sha', workspace, {
      errors: contractState.errors,
      warnings: contractState.warnings,
      outputs: contractState.outputs,
    })
    expect(oracle.releasePlan.releases.map(({name, type}) => ({name, type}))).toEqual([
      {name: '@marcusrbrown/infra-gateway', type: 'patch'},
      {name: '@marcusrbrown/infra-shared', type: 'patch'},
      {name: '@marcusrbrown/infra-cliproxy', type: 'none'},
      {name: '@marcusrbrown/infra-vpn', type: 'none'},
    ])
  })
})

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

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
