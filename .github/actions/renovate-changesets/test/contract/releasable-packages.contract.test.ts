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

interface Scenario {
  name: string
  title: string
  branch: string
  body: string
  files: {
    filename: string
    patch: string
  }[]
  expected: {name: string; type: string}[]
}

const scenarios: Scenario[] = [
  {
    name: 'cliproxy-versionless',
    title: 'chore(deps): update eceasy/cli-proxy-api Docker tag',
    branch: 'renovate/eceasy-cli-proxy-api-7.x',
    body: dockerBody(
      'eceasy/cli-proxy-api',
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    ),
    files: [
      {
        filename: 'apps/cliproxy/docker-compose.yaml',
        patch: dockerPatch(
          'eceasy/cli-proxy-api',
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        ),
      },
    ],
    expected: [{name: '@marcusrbrown/infra', type: 'patch'}],
  },
  {
    name: 'ignored-vpn',
    title: 'chore(deps): update alpine Docker tag',
    branch: 'renovate/alpine-3.x',
    body: dockerBody('alpine', '3.22', '3.23', 'patch'),
    files: [
      {
        filename: 'apps/vpn/Dockerfile',
        patch: '-FROM alpine:3.22\n+FROM alpine:3.23',
      },
    ],
    // This remains minor from the uncapped classifier; whether fallback should honor capChangesetType is separate.
    expected: [{name: '@marcusrbrown/infra', type: 'minor'}],
  },
  {
    name: 'mixed-releasable-and-versionless',
    title: 'chore(deps): update eceasy/cli-proxy-api Docker tag',
    branch: 'renovate/eceasy-cli-proxy-api-7.x',
    body: dockerBody(
      'eceasy/cli-proxy-api',
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    ),
    files: [
      {
        filename: 'apps/gateway/Dockerfile',
        patch: dockerPatch(
          'eceasy/cli-proxy-api',
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        ),
      },
      {
        filename: 'apps/cliproxy/docker-compose.yaml',
        patch: dockerPatch(
          'eceasy/cli-proxy-api',
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        ),
      },
    ],
    expected: [{name: '@marcusrbrown/infra-gateway', type: 'patch'}],
  },
  {
    name: 'workspace-glob-libs',
    title: 'chore(deps): update alpine Docker tag',
    branch: 'renovate/alpine-3.x',
    body: dockerBody('alpine', '3.22', '3.23', 'minor'),
    files: [
      {
        filename: 'libs/edge/Dockerfile',
        patch: '-FROM alpine:3.22\n+FROM alpine:3.23',
      },
    ],
    expected: [{name: '@marcusrbrown/infra-edge', type: 'minor'}],
  },
]

const contractState = getContractState()
const octokitMocks = getOctokitMocks()
let workspace = ''

describe('renovate-changesets releasable package contracts', () => {
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
    process.env.TARGET_PACKAGE = '@marcusrbrown/infra'

    contractState.inputs = {
      token: 'contract-token',
      'working-directory': workspace,
      'branch-prefix': 'renovate/',
      'config-file': '',
      config: '',
      'default-changeset-type': 'patch',
      'exclude-patterns': '',
      'target-package': '@marcusrbrown/infra',
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

  for (const scenario of scenarios) {
    it(`${scenario.name} produces a Changesets-valid release set`, async () => {
      await fs.writeFile(
        process.env.GITHUB_EVENT_PATH ?? '',
        JSON.stringify({
          pull_request: {
            number: 1200,
            title: scenario.title,
            body: scenario.body,
            user: {login: 'mrbro-bot[bot]'},
            labels: [{name: 'dependencies'}, {name: 'renovate'}],
            head: {ref: scenario.branch},
          },
        }),
        'utf8',
      )
      octokitMocks.listFiles.mockResolvedValue({
        data: scenario.files.map(file => ({
          ...file,
          status: 'modified',
          additions: 1,
          deletions: 1,
        })),
      })
      octokitMocks.listCommits.mockResolvedValue({
        data: [{commit: {message: scenario.title}}],
      })

      await run()

      expect(contractState.failed).toEqual([])
      const oracle = await runChangesetsOracle(scenario.name, workspace, {
        errors: contractState.errors,
        warnings: contractState.warnings,
        outputs: contractState.outputs,
      })
      expect(authoredReleases(oracle.releasePlan).map(({name, type}) => ({name, type}))).toEqual(
        scenario.expected,
      )
      expect(effectiveReleases(oracle.releasePlan).map(({name, type}) => ({name, type}))).toEqual(
        scenario.expected,
      )
    })
  }
})

function dockerBody(packageName: string, current: string, next: string, update = 'digest'): string {
  return `This PR contains the following updates:

| Package | Update | Change |
|---|---|---|
| ${packageName} | ${update} | \`${current}\` -> \`${next}\` |
`
}

function dockerPatch(packageName: string, current: string, next: string): string {
  return `-FROM ${packageName}:v7.2.134@sha256:${current}
+FROM ${packageName}:v7.2.134@sha256:${next}`
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

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}
