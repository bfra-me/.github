import {readFileSync} from 'node:fs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const fsMocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({default: fsMocks}))

const execMocks = vi.hoisted(() => ({
  exec: vi.fn(),
  getExecOutput: vi.fn(),
}))

vi.mock('@actions/exec', () => execMocks)

interface ReleasePackage {
  pkg: {
    packageJson: {
      name: string
      version: string
    }
  }
  tagName: string
}

interface ReleaseModule {
  updateInternalWorkflowPins: (
    releasedPackages: ReleasePackage[],
    releaseSha: string,
    cwd: string,
  ) => Promise<void>
}

const packageRelease: ReleasePackage = {
  pkg: {
    packageJson: {
      name: '@bfra.me/.github',
      version: '4.24.1',
    },
  },
  tagName: 'v4.24.1',
}
const cwd = '/tmp/release-test'
const oldPin =
  'uses: bfra-me/.github/.github/workflows/renovate-changeset.yaml@abcdef1234567890 # v4.24.0'
const stableBranch = 'chore/update-action-pins'

async function loadReleaseModule() {
  return (await import('./release.js')) as unknown as ReleaseModule
}

async function updatePins(existingPr = '') {
  fsMocks.readFile.mockResolvedValue(oldPin)
  fsMocks.writeFile.mockResolvedValue(undefined)
  execMocks.exec.mockResolvedValue(undefined)
  execMocks.getExecOutput.mockResolvedValue({stdout: existingPr, stderr: '', exitCode: 0})

  const release = await loadReleaseModule()
  await release.updateInternalWorkflowPins([packageRelease], '1234567890abcdef', cwd)
}

function execCalls(command: string, subcommand: string) {
  return execMocks.exec.mock.calls.filter(
    ([calledCommand, args]) => calledCommand === command && args[1] === subcommand,
  )
}

function bodyFromCall(call: unknown[]) {
  const args = call[1] as string[]
  return args[args.indexOf('--body') + 1]
}

describe('updateInternalWorkflowPins', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('does not perform side effects when no files are updated', async () => {
    fsMocks.readFile.mockResolvedValue('no internal action pins')

    const release = await loadReleaseModule()
    await release.updateInternalWorkflowPins([packageRelease], '1234567890abcdef', cwd)

    expect(execMocks.exec).not.toHaveBeenCalled()
    expect(execMocks.getExecOutput).not.toHaveBeenCalled()
    expect(fsMocks.writeFile).not.toHaveBeenCalled()
  })

  it('creates a PR when no open PR exists', async () => {
    await updatePins()

    expect(execMocks.exec).toHaveBeenCalledWith('git', ['checkout', '-B', stableBranch], {cwd})
    expect(execMocks.exec).toHaveBeenCalledWith(
      'git',
      ['push', '--force', '-u', 'origin', stableBranch],
      {cwd},
    )
    expect(execMocks.getExecOutput).toHaveBeenCalledWith(
      'gh',
      [
        'pr',
        'list',
        '--head',
        stableBranch,
        '--state',
        'open',
        '--json',
        'number',
        '--jq',
        '.[0].number // empty',
      ],
      {cwd},
    )
    expect(execCalls('gh', 'create')).toHaveLength(1)
    expect(execMocks.exec).not.toHaveBeenCalledWith('gh', expect.arrayContaining(['edit']), {cwd})

    const createArgs = execCalls('gh', 'create')[0]?.[1] as string[]
    expect(createArgs).toEqual([
      'pr',
      'create',
      '--title',
      'chore: update internal action SHA pins',
      '--body',
      expect.any(String),
      '--base',
      'main',
      '--head',
      stableBranch,
    ])
    expect(execMocks.exec).toHaveBeenCalledWith(
      'gh',
      ['pr', 'merge', stableBranch, '--auto', '--squash'],
      {cwd},
    )
  })

  it('edits an existing PR instead of creating one', async () => {
    await updatePins('2640\n')

    expect(execCalls('gh', 'create')).toHaveLength(0)
    expect(execMocks.exec).toHaveBeenCalledWith(
      'gh',
      ['pr', 'edit', '2640', '--body', expect.any(String)],
      {cwd},
    )
    expect(execMocks.exec).toHaveBeenCalledWith(
      'gh',
      ['pr', 'merge', stableBranch, '--auto', '--squash'],
      {cwd},
    )
  })

  it('uses the same PR body for create and edit paths', async () => {
    await updatePins()
    const createBody = bodyFromCall(execCalls('gh', 'create')[0] ?? [])

    vi.clearAllMocks()
    vi.resetModules()
    await updatePins('2640\n')
    const editBody = bodyFromCall(execCalls('gh', 'edit')[0] ?? [])

    expect(createBody).toBe(editBody)
  })

  it('uses a branch name covered by the renovate changeset workflow guard', async () => {
    await updatePins()

    const workflow = readFileSync(
      new URL('../.github/workflows/renovate-changeset.yaml', import.meta.url),
      'utf8',
    )
    const prefixMatch = workflow.match(/!startsWith\(github\.head_ref, '([^']+)'\)/)
    if (prefixMatch === null) throw new Error('Could not find the workflow branch guard')

    const checkoutCall = execMocks.exec.mock.calls.find(
      ([command, args]) => command === 'git' && args[0] === 'checkout',
    )
    const branch = (checkoutCall?.[1] as string[] | undefined)?.[2]
    expect(branch).toBeDefined()
    expect(branch?.startsWith(prefixMatch[1])).toBe(true)
  })
})
