import {spawnSync} from 'node:child_process'
import {promises as fs} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {run} from '../../src/run.js'
import {getContractState, getOctokitMocks} from './setup.js'

const fixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/marcusrbrown-infra/repo',
)
const contractState = getContractState()
const octokitMocks = getOctokitMocks()
let workspace = ''

describe('renovate-changesets writer contracts', () => {
  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'renovate-changesets-writer-contract-'))
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
    vi.restoreAllMocks()
    if (workspace.length > 0) await fs.rm(workspace, {recursive: true, force: true})
    workspace = ''
  })

  it('fails when every generated changeset write fails', async () => {
    await configureScenario({
      title: 'chore(deps): update eceasy/cli-proxy-api Docker tag',
      branch: 'renovate/eceasy-cli-proxy-api-7.x',
      body: dockerBody(
        'eceasy/cli-proxy-api',
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      ),
      files: [
        dockerFile(
          'apps/gateway/Dockerfile',
          'eceasy/cli-proxy-api',
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        ),
        dockerFile(
          'apps/cliproxy/docker-compose.yaml',
          'eceasy/cli-proxy-api',
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        ),
      ],
    })
    rejectChangesetWrites()

    await run()

    const failureMessage = contractState.failed.join('\n')
    expect(failureMessage).toContain('renovate-contract1-0.md')
    expect(failureMessage).toContain('contract changeset write blocked')
    expect(contractState.outputs.get('changesets-created')).toBe('0')
    expect(JSON.parse(contractState.outputs.get('changeset-files') ?? 'null')).toEqual([])
    expect(await listChangesetFiles()).toEqual([])
  })

  it('succeeds when a second run skips the existing changeset', async () => {
    await configureScenario({
      title: 'chore(deps): update eceasy/cli-proxy-api Docker tag',
      branch: 'renovate/eceasy-cli-proxy-api-7.x',
      body: dockerBody(
        'eceasy/cli-proxy-api',
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      ),
      files: [
        dockerFile(
          'apps/cliproxy/docker-compose.yaml',
          'eceasy/cli-proxy-api',
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        ),
      ],
    })

    await run()
    expect(contractState.failed).toEqual([])
    expect(contractState.outputs.get('changesets-created')).toBe('1')
    expect(await listChangesetFiles()).toHaveLength(1)

    await run()

    expect(contractState.failed).toEqual([])
    expect(contractState.outputs.get('changesets-created')).toBe('0')
    expect(JSON.parse(contractState.outputs.get('changeset-files') ?? 'null')).toEqual([])
    expect(await listChangesetFiles()).toHaveLength(1)
  })
})

async function configureScenario(params: {
  title: string
  branch: string
  body: string
  files: {filename: string; patch: string}[]
}): Promise<void> {
  await fs.writeFile(
    process.env.GITHUB_EVENT_PATH ?? '',
    JSON.stringify({
      pull_request: {
        number: 1201,
        title: params.title,
        body: params.body,
        user: {login: 'mrbro-bot[bot]'},
        labels: [{name: 'dependencies'}, {name: 'renovate'}],
        head: {ref: params.branch},
      },
    }),
    'utf8',
  )
  octokitMocks.listFiles.mockResolvedValue({
    data: params.files.map(file => ({
      ...file,
      status: 'modified',
      additions: 1,
      deletions: 1,
    })),
  })
  octokitMocks.listCommits.mockResolvedValue({data: [{commit: {message: params.title}}]})
}

function rejectChangesetWrites(): void {
  const originalWriteFile = fs.writeFile.bind(fs)
  const changesetDirectory = `${path.join(workspace, '.changeset')}${path.sep}`

  vi.spyOn(fs, 'writeFile').mockImplementation(async (filePath, data, options) => {
    const resolvedPath = path.resolve(String(filePath))
    if (resolvedPath.startsWith(changesetDirectory) && resolvedPath.endsWith('.md')) {
      throw new Error('contract changeset write blocked')
    }
    return originalWriteFile(filePath, data, options)
  })
}

function dockerBody(packageName: string, current: string, next: string): string {
  return `This PR contains the following updates:

| Package | Update | Change |
|---|---|---|
| ${packageName} | digest | \`${current}\` -> \`${next}\` |
`
}

function dockerFile(filename: string, packageName: string, current: string, next: string) {
  return {
    filename,
    patch: `-FROM ${packageName}:v7.2.134@sha256:${current}\n+FROM ${packageName}:v7.2.134@sha256:${next}`,
  }
}

async function listChangesetFiles(): Promise<string[]> {
  const entries = await fs.readdir(path.join(workspace, '.changeset'), {withFileTypes: true})
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name)
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
