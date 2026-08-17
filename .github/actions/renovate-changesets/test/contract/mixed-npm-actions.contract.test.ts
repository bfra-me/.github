import {spawnSync} from 'node:child_process'
import {promises as fs} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {run} from '../../src/run.js'
import {listGeneratedChangesets, runChangesetsOracle} from './changesets-oracle.js'
import {getContractState, getOctokitMocks} from './setup.js'

const fixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/marcusrbrown-infra/repo',
)

let workspace = ''
const contractState = getContractState()
const octokitMocks = getOctokitMocks()

describe('mixed npm and GitHub Actions manager contract', () => {
  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'renovate-changesets-mixed-contract-'))
    await fs.cp(fixtureRoot, workspace, {recursive: true})
    await fs.mkdir(path.join(workspace, 'apps/agent'), {recursive: true})
    await fs.writeFile(
      path.join(workspace, 'apps/agent/package.json'),
      '{"name":"@marcusrbrown/infra-agent","private":true,"dependencies":{"@marcusrbrown/infra-shared":"workspace:*"}}',
      'utf8',
    )
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
          number: 1119,
          title: 'chore(deps): update dependencies',
          body: `This PR contains the following updates:\n\n| Package | Change | Age | Confidence | OpenSSF | Code Search | Type | Update | Pending |\n|---|---|---|---|---|---|---|---|---|\n| @aws-sdk/client-iam | \`3.500.0\` -> \`3.501.0\` | 1 year | high | passing | passing | dependencies | minor | |\n| @aws-sdk/client-lightsail | \`3.500.0\` -> \`3.501.0\` | 1 year | high | passing | passing | dependencies | minor | |\n| @aws-sdk/client-s3 | \`3.500.0\` -> \`3.501.0\` | 1 year | high | passing | passing | dependencies | minor | |\n| fro-bot/agent | \`v1.0.0\` -> \`v1.0.1\` | 1 year | high | passing | passing | action | patch | |\n`,
          user: {login: 'mrbro-bot[bot]'},
          labels: [{name: 'dependencies'}, {name: 'renovate'}],
          head: {ref: 'renovate/all-non-major'},
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
        ...['apps/agent/package.json', 'apps/gateway/package.json', 'apps/vpn/package.json'].map(
          filename => ({filename, status: 'modified', additions: 1, deletions: 1}),
        ),
        {
          filename: '.github/workflows/fro-bot.yaml',
          status: 'modified',
          additions: 1,
          deletions: 1,
        },
        {filename: 'bun.lock', status: 'modified', additions: 1, deletions: 1},
      ],
    })
    octokitMocks.listCommits.mockResolvedValue({
      data: [{commit: {message: 'chore(deps): update dependencies'}}],
    })
  })

  afterEach(async () => {
    if (workspace.length > 0) await fs.rm(workspace, {recursive: true, force: true})
    workspace = ''
  })

  it('keeps per-row managers in the summary while preserving the release set', async () => {
    await run()

    const filenames = await listGeneratedChangesets(workspace)
    expect(filenames).toHaveLength(1)

    const oracle = await runChangesetsOracle('mixed-npm-actions', workspace, {
      errors: contractState.errors,
      warnings: contractState.warnings,
      outputs: contractState.outputs,
    })
    const expectedSummary =
      'Group update across managers: npm dependencies: `@aws-sdk/client-iam`, `@aws-sdk/client-lightsail`, `@aws-sdk/client-s3`; GitHub Actions workflow dependency: `fro-bot/agent`'
    expect(contractState.failed).toEqual([])
    expect(contractState.outputs.get('update-type')).toBe('mixed')
    expect(contractState.outputs.get('changeset-summary')).toBe(expectedSummary)
    expect(await fs.readFile(path.join(workspace, filenames[0] ?? ''), 'utf8')).toContain(
      expectedSummary,
    )

    expect(
      oracle.releasePlan.releases
        .filter(({type}) => type !== 'none')
        .map(({name, type}) => ({name, type})),
    ).toEqual([{name: '@marcusrbrown/infra-gateway', type: 'minor'}])
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
