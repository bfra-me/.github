import type {GitConfig} from '../src/git-operations'
import {describe, expect, it, vi} from 'vitest'
import {createGitOperations, GitOperations} from '../src/git-operations'
import {mockedGitHubActions} from './setup'

const execMock = mockedGitHubActions.exec.getExecOutput

function createConfig(overrides: Partial<GitConfig> = {}): GitConfig {
  return {
    token: 'test-token',
    commitBack: true,
    commitMessageTemplate: 'chore: add {{count}} changeset(s): {{files}} ({{file}})',
    workingDirectory: '/tmp/test-workspace',
    owner: 'test-owner',
    repo: 'test-repo',
    branchName: 'renovate/test-branch',
    autoResolveConflicts: true,
    maxRetries: 1,
    retryDelay: 0,
    ...overrides,
  }
}

function commandNames(): string[] {
  return execMock.mock.calls.map(([, args]) => (args as string[]).join(' '))
}

describe('GitOperations', () => {
  it('renders commit messages for single and multiple changesets', () => {
    const operations = new GitOperations(createConfig())

    expect(operations.generateCommitMessage(['.changeset/one.md'])).toBe(
      'chore: add 1 changeset(s): .changeset/one.md (.changeset/one.md)',
    )
    expect(operations.generateCommitMessage(['.changeset/one.md', '.changeset/two.md'])).toBe(
      'chore: add 2 changeset(s): .changeset/one.md, .changeset/two.md (2 files)',
    )
  })

  it('configures the commit identity with the expected git commands', async () => {
    execMock.mockResolvedValue({stdout: ''})

    await new GitOperations(createConfig()).configureGitUser()

    expect(commandNames()).toEqual([
      'config user.email 118100583+bfra-me[bot]@users.noreply.github.com',
      'config user.name bfra-me[bot]',
    ])
  })

  it('surfaces git user configuration failures', async () => {
    execMock.mockRejectedValueOnce(new Error('config failed'))

    await expect(new GitOperations(createConfig()).configureGitUser()).rejects.toThrow(
      'Git user configuration failed: config failed',
    )
    expect(mockedGitHubActions.core.error).toHaveBeenCalledWith(
      'Failed to configure git user: config failed',
    )
  })

  it('reports changed status and fails closed when status cannot be read', async () => {
    const operations = new GitOperations(createConfig())

    execMock.mockResolvedValueOnce({stdout: ' M package.json\n'})
    expect(await operations.hasChanges()).toBe(true)

    execMock.mockResolvedValueOnce({stdout: '   \n'})
    expect(await operations.hasChanges()).toBe(false)

    execMock.mockRejectedValueOnce(new Error('status failed'))
    expect(await operations.hasChanges()).toBe(false)
  })

  it('extracts only changed changeset markdown files from git status', async () => {
    const operations = new GitOperations(createConfig())
    execMock.mockResolvedValueOnce({
      stdout:
        'A  .changeset/one.md\n M package.json\n?? .changeset/README.md\nA  .changeset/two.txt\n',
    })

    expect(await operations.getChangedChangesetFiles()).toEqual([
      '.changeset/one.md',
      '.changeset/README.md',
    ])
  })

  it('returns no changed files when git status fails', async () => {
    const operations = new GitOperations(createConfig())
    execMock.mockRejectedValueOnce(new Error('status failed'))

    await expect(operations.getChangedChangesetFiles()).resolves.toEqual([])
  })

  it('stages each changeset file in order and does nothing for an empty list', async () => {
    const operations = new GitOperations(createConfig())
    execMock.mockResolvedValue({stdout: ''})

    await operations.stageChangesetFiles([])
    expect(execMock).not.toHaveBeenCalled()

    await operations.stageChangesetFiles(['.changeset/one.md', '.changeset/two.md'])
    expect(commandNames()).toEqual(['add .changeset/one.md', 'add .changeset/two.md'])
  })

  it('surfaces failures while staging changesets', async () => {
    const operations = new GitOperations(createConfig())
    execMock.mockRejectedValueOnce(new Error('add failed'))

    await expect(operations.stageChangesetFiles(['.changeset/one.md'])).rejects.toThrow(
      'Git staging failed: add failed',
    )
  })

  it('commits staged changesets and returns the commit SHA', async () => {
    const operations = new GitOperations(createConfig())
    execMock.mockResolvedValueOnce({stdout: ''}).mockResolvedValueOnce({stdout: 'abc1234\n'})

    await expect(operations.commitChanges(['.changeset/one.md'])).resolves.toMatchObject({
      success: true,
      commitSha: 'abc1234',
      committedFiles: ['.changeset/one.md'],
    })
    expect(commandNames()).toEqual([
      'commit -m chore: add 1 changeset(s): .changeset/one.md (.changeset/one.md)',
      'rev-parse HEAD',
    ])
  })

  it('returns a useful failure result when committing fails', async () => {
    const operations = new GitOperations(createConfig())
    execMock.mockRejectedValueOnce(new Error('commit rejected'))

    await expect(operations.commitChanges(['.changeset/one.md'])).resolves.toMatchObject({
      success: false,
      error: 'commit rejected',
      committedFiles: [],
    })
  })

  it('rejects an empty commit request without invoking git', async () => {
    const operations = new GitOperations(createConfig())

    await expect(operations.commitChanges([])).resolves.toEqual({
      success: false,
      error: 'No changeset files to commit',
      committedFiles: [],
    })
    expect(execMock).not.toHaveBeenCalled()
  })

  it('configures an unauthenticated origin URL with the action token', async () => {
    const operations = new GitOperations(createConfig())
    execMock
      .mockResolvedValueOnce({stdout: 'git@github.com:test-owner/test-repo.git'})
      .mockResolvedValueOnce({stdout: ''})

    await operations.setupRemoteWithAuth()

    expect(commandNames()).toEqual([
      'remote get-url origin',
      'remote set-url origin https://x-access-token:test-token@github.com/test-owner/test-repo.git',
    ])
  })

  it('leaves an already authenticated origin unchanged', async () => {
    const operations = new GitOperations(createConfig())
    execMock.mockResolvedValueOnce({stdout: 'https://x-access-token:token@github.com/repo.git'})

    await operations.setupRemoteWithAuth()

    expect(commandNames()).toEqual(['remote get-url origin'])
  })

  it('surfaces remote authentication failures', async () => {
    const operations = new GitOperations(createConfig())
    execMock.mockRejectedValueOnce(new Error('remote unavailable'))

    await expect(operations.setupRemoteWithAuth()).rejects.toThrow(
      'Remote authentication setup failed: remote unavailable',
    )
  })

  it('detects a remote branch that is behind the local branch', async () => {
    const operations = new GitOperations(createConfig())
    execMock
      .mockResolvedValueOnce({stdout: ''})
      .mockResolvedValueOnce({stdout: '2\n'})
      .mockResolvedValueOnce({stdout: '1\n'})

    await expect(operations.hasRemoteBranchDiverged()).resolves.toEqual({
      diverged: true,
      behind: 2,
      ahead: 1,
    })
  })

  it('fails closed when remote branch status cannot be checked', async () => {
    const operations = new GitOperations(createConfig())
    execMock.mockRejectedValueOnce(new Error('fetch failed'))

    await expect(operations.hasRemoteBranchDiverged()).resolves.toEqual({
      diverged: false,
      behind: 0,
      ahead: 0,
    })
  })

  it('reports no changeset conflict when the status is clean', async () => {
    const operations = new GitOperations(createConfig())
    execMock.mockResolvedValueOnce({stdout: ''})

    await expect(operations.handleChangesetConflicts()).resolves.toEqual({
      resolved: true,
      strategy: 'no-conflicts',
    })
  })

  it('does not resolve conflicts when auto-resolve is disabled', async () => {
    const operations = new GitOperations(createConfig({autoResolveConflicts: false}))
    execMock.mockResolvedValueOnce({stdout: 'UU .changeset/conflicted.md\n'})

    await expect(operations.handleChangesetConflicts()).resolves.toEqual({
      resolved: false,
      strategy: 'manual-resolution-required',
    })
    expect(commandNames()).toEqual(['status --porcelain .changeset'])
  })

  it('resolves conflicted changesets with checkout-theirs and git add', async () => {
    const operations = new GitOperations(createConfig())
    execMock.mockResolvedValueOnce({stdout: 'UU .changeset/conflicted.md\n'})

    await expect(operations.handleChangesetConflicts()).resolves.toEqual({
      resolved: true,
      strategy: 'prefer-working-tree',
    })
    expect(commandNames()).toEqual([
      'status --porcelain .changeset',
      'checkout --theirs .changeset/conflicted.md',
      'add .changeset/conflicted.md',
    ])
  })

  it('returns an error result when conflict status cannot be read', async () => {
    const operations = new GitOperations(createConfig())
    execMock.mockRejectedValueOnce(new Error('conflict status failed'))

    await expect(operations.handleChangesetConflicts()).resolves.toEqual({
      resolved: false,
      strategy: 'error: conflict status failed',
    })
  })

  it('rebases cleanly without conflict resolution', async () => {
    const operations = new GitOperations(createConfig())
    execMock.mockResolvedValueOnce({stdout: ''})

    await expect(operations.rebaseOntoRemote()).resolves.toEqual({success: true})
    expect(commandNames()).toEqual(['rebase origin/renovate/test-branch'])
  })

  it('rebases through a conflicted changeset using checkout-theirs', async () => {
    const operations = new GitOperations(createConfig())
    execMock.mockImplementation(async (_tool, args) => {
      const command = (args as string[]).join(' ')
      if (command === 'rebase origin/renovate/test-branch') {
        throw new Error('conflict')
      }
      if (command === 'status --porcelain') {
        return {stdout: 'UU .changeset/conflicted.md\n'}
      }
      if (command === 'status --porcelain .changeset') {
        return {stdout: 'UU .changeset/conflicted.md\n'}
      }
      return {stdout: ''}
    })

    await expect(operations.rebaseOntoRemote()).resolves.toEqual({success: true})
    expect(commandNames()).toEqual([
      'rebase origin/renovate/test-branch',
      'status --porcelain',
      'status --porcelain .changeset',
      'checkout --theirs .changeset/conflicted.md',
      'add .changeset/conflicted.md',
      'rebase --continue',
    ])
  })

  it('aborts a rebase when conflicted changesets cannot be resolved', async () => {
    const operations = new GitOperations(createConfig({autoResolveConflicts: false}))
    execMock.mockImplementation(async (_tool, args) => {
      const command = (args as string[]).join(' ')
      if (command === 'rebase origin/renovate/test-branch') throw new Error('conflict')
      if (command === 'status --porcelain') return {stdout: 'UU .changeset/conflicted.md\n'}
      if (command === 'status --porcelain .changeset')
        return {stdout: 'UU .changeset/conflicted.md\n'}
      return {stdout: ''}
    })

    await expect(operations.rebaseOntoRemote()).resolves.toEqual({
      success: false,
      error: 'Conflict resolution failed: manual-resolution-required',
    })
    expect(commandNames()).toContain('rebase --abort')
  })

  it('returns the original rebase error when no conflicts are present', async () => {
    const operations = new GitOperations(createConfig())
    execMock.mockImplementation(async (_tool, args) => {
      const command = (args as string[]).join(' ')
      if (command === 'rebase origin/renovate/test-branch') throw new Error('rebase failed')
      return {stdout: ''}
    })

    await expect(operations.rebaseOntoRemote()).resolves.toEqual({
      success: false,
      error: 'rebase failed',
    })
  })

  it('retries a transient operation and returns the successful attempt count', async () => {
    const operations = new GitOperations(createConfig({maxRetries: 2}))
    let attempts = 0

    const result = await operations.executeWithRetry(async () => {
      attempts++
      if (attempts < 3) throw new Error('temporary failure')
      return 'done'
    }, 'characterisation retry')

    expect(result).toEqual({result: 'done', success: true, attempts: 3})
    expect(mockedGitHubActions.core.warning).toHaveBeenCalledTimes(2)
  })

  it('returns failure after exhausting retry attempts', async () => {
    const operations = new GitOperations(createConfig({maxRetries: 1}))

    const result = await operations.executeWithRetry(async () => {
      throw new Error('permanent failure')
    }, 'characterisation failure')

    expect(result).toEqual({
      success: false,
      attempts: 2,
      error: 'permanent failure',
    })
  })

  it('retries a non-fast-forward push and reports the retry count', async () => {
    const operations = new GitOperations(createConfig({maxRetries: 1}))
    let pushAttempts = 0
    execMock.mockImplementation(async (_tool, args) => {
      const command = (args as string[]).join(' ')
      if (command === 'remote get-url origin') return {stdout: 'x-access-token'}
      if (command.startsWith('rev-list --count')) return {stdout: '0'}
      if (command === 'branch --show-current') return {stdout: 'renovate/test-branch\n'}
      if (command.startsWith('push origin')) {
        pushAttempts++
        if (pushAttempts === 1) throw new Error('non-fast-forward')
      }
      return {stdout: ''}
    })

    await expect(operations.pushToRemoteBranch()).resolves.toMatchObject({
      success: true,
      retryAttempts: 2,
      branchUpdated: false,
      conflictsResolved: false,
    })
    expect(pushAttempts).toBe(2)
  })

  it('rebases a diverged branch before pushing', async () => {
    const operations = new GitOperations(createConfig({maxRetries: 0}))
    execMock.mockImplementation(async (_tool, args) => {
      const command = (args as string[]).join(' ')
      if (command === 'remote get-url origin') return {stdout: 'x-access-token'}
      if (command === 'rev-list --count HEAD..origin/renovate/test-branch') return {stdout: '1'}
      if (command === 'rev-list --count origin/renovate/test-branch..HEAD') return {stdout: '1'}
      if (command === 'branch --show-current') return {stdout: 'renovate/test-branch'}
      return {stdout: ''}
    })

    await expect(operations.pushToRemoteBranch()).resolves.toMatchObject({
      success: true,
      conflictsResolved: true,
      branchUpdated: true,
    })
    expect(commandNames()).toContain('rebase origin/renovate/test-branch')
  })

  it('reports a failed rebase through the push result', async () => {
    const operations = new GitOperations(createConfig({maxRetries: 0}))
    execMock.mockImplementation(async (_tool, args) => {
      const command = (args as string[]).join(' ')
      if (command === 'remote get-url origin') return {stdout: 'x-access-token'}
      if (command === 'rev-list --count HEAD..origin/renovate/test-branch') return {stdout: '1'}
      if (command === 'rev-list --count origin/renovate/test-branch..HEAD') return {stdout: '1'}
      if (command === 'rebase origin/renovate/test-branch') throw new Error('rebase failed')
      return {stdout: ''}
    })

    await expect(operations.pushToRemoteBranch()).resolves.toMatchObject({
      success: false,
      retryAttempts: 1,
      error: 'Rebase failed: rebase failed',
    })
    expect(commandNames()).not.toContain('push origin HEAD:renovate/test-branch')
  })

  it('commits and pushes changesets through the expected command sequence', async () => {
    const operations = new GitOperations(createConfig())
    execMock.mockImplementation(async (_tool, args) => {
      const command = (args as string[]).join(' ')
      if (command === 'status --porcelain') return {stdout: 'A  .changeset/one.md\n'}
      if (command === 'remote get-url origin') return {stdout: 'x-access-token'}
      if (command.startsWith('rev-list --count')) return {stdout: '0'}
      if (command === 'branch --show-current') return {stdout: 'renovate/test-branch\n'}
      if (command === 'rev-parse HEAD') return {stdout: 'abc1234\n'}
      return {stdout: ''}
    })

    await expect(operations.commitChangesetFiles()).resolves.toMatchObject({
      success: true,
      commitSha: 'abc1234',
      committedFiles: ['.changeset/one.md'],
      pushSuccess: true,
      retryAttempts: 1,
    })
    expect(commandNames()).toEqual([
      'config user.email 118100583+bfra-me[bot]@users.noreply.github.com',
      'config user.name bfra-me[bot]',
      'status --porcelain',
      'status --porcelain',
      'add .changeset/one.md',
      'commit -m chore: add 1 changeset(s): .changeset/one.md (.changeset/one.md)',
      'rev-parse HEAD',
      'remote get-url origin',
      'fetch origin renovate/test-branch',
      'rev-list --count HEAD..origin/renovate/test-branch',
      'rev-list --count origin/renovate/test-branch..HEAD',
      'branch --show-current',
      'push origin HEAD:renovate/test-branch',
    ])
  })

  it('returns success without git work when commit-back is disabled', async () => {
    const operations = new GitOperations(createConfig({commitBack: false}))

    await expect(operations.commitChangesetFiles()).resolves.toEqual({
      success: true,
      committedFiles: [],
      error: 'Commit back disabled',
    })
    expect(execMock).not.toHaveBeenCalled()
  })

  it('skips commit-back when the working tree has no changes', async () => {
    const operations = new GitOperations(createConfig())
    execMock.mockImplementation(async (_tool, args) => {
      const command = (args as string[]).join(' ')
      if (command.startsWith('config')) return {stdout: ''}
      if (command === 'status --porcelain') return {stdout: ''}
      return {stdout: ''}
    })

    await expect(operations.commitChangesetFiles()).resolves.toMatchObject({
      success: true,
      committedFiles: [],
    })
    expect(commandNames()).toEqual([
      'config user.email 118100583+bfra-me[bot]@users.noreply.github.com',
      'config user.name bfra-me[bot]',
      'status --porcelain',
    ])
  })

  it('skips commit-back when no changed changeset files are present', async () => {
    const operations = new GitOperations(createConfig())
    let statusCalls = 0
    execMock.mockImplementation(async (_tool, args) => {
      const command = (args as string[]).join(' ')
      if (command.startsWith('config')) return {stdout: ''}
      if (command === 'status --porcelain') {
        statusCalls++
        return {stdout: statusCalls === 1 ? ' M package.json' : ' M package.json'}
      }
      return {stdout: ''}
    })

    await expect(operations.commitChangesetFiles()).resolves.toMatchObject({
      success: true,
      committedFiles: [],
    })
    expect(commandNames()).toHaveLength(4)
  })

  it('keeps a successful local commit successful when pushing fails', async () => {
    const operations = new GitOperations(createConfig({maxRetries: 0}))
    execMock.mockImplementation(async (_tool, args) => {
      const command = (args as string[]).join(' ')
      if (command.startsWith('config')) return {stdout: ''}
      if (command === 'status --porcelain') return {stdout: 'A  .changeset/one.md'}
      if (command === 'rev-parse HEAD') return {stdout: 'abc1234'}
      if (command === 'remote get-url origin') return {stdout: 'x-access-token'}
      if (command.startsWith('rev-list --count')) return {stdout: '0'}
      if (command === 'branch --show-current') return {stdout: 'renovate/test-branch'}
      if (command.startsWith('push origin')) throw new Error('push failed')
      return {stdout: ''}
    })

    await expect(operations.commitChangesetFiles()).resolves.toMatchObject({
      success: true,
      pushSuccess: false,
      pushError: 'push failed',
    })
  })

  it('validates a usable git checkout and reports invalid setup', async () => {
    const operations = new GitOperations(createConfig())
    execMock
      .mockResolvedValueOnce({stdout: '.git'})
      .mockResolvedValueOnce({stdout: 'renovate/test-branch'})
    await expect(operations.validateGitSetup()).resolves.toBe(true)

    execMock.mockRejectedValueOnce(new Error('not a repository'))
    await expect(operations.validateGitSetup()).resolves.toBe(false)
  })

  it('validates action inputs when creating GitOperations', async () => {
    mockedGitHubActions.core.getInput.mockImplementation((name: string) => {
      const values: Record<string, string> = {
        token: 'test-token',
        'max-retries': '2',
        'retry-delay': '100',
      }
      return values[name] ?? ''
    })
    mockedGitHubActions.core.getBooleanInput.mockReturnValue(false)

    expect(
      createGitOperations('/tmp/test-workspace', 'owner', 'repo', 'renovate/test'),
    ).toBeInstanceOf(GitOperations)

    mockedGitHubActions.core.getInput.mockImplementation((name: string) =>
      name === 'max-retries' ? '11' : name === 'retry-delay' ? '100' : 'test-token',
    )
    expect(() =>
      createGitOperations('/tmp/test-workspace', 'owner', 'repo', 'renovate/test'),
    ).toThrow('max-retries must be between 0 and 10')

    mockedGitHubActions.core.getInput.mockImplementation((name: string) =>
      name === 'retry-delay' ? '99' : 'test-token',
    )
    expect(() =>
      createGitOperations('/tmp/test-workspace', 'owner', 'repo', 'renovate/test'),
    ).toThrow('retry-delay must be between 100 and 10000 milliseconds')
  })

  it('requires a token when commit-back is enabled', () => {
    mockedGitHubActions.core.getInput.mockReturnValue('')
    mockedGitHubActions.core.getBooleanInput.mockReturnValue(true)
    vi.stubEnv('GITHUB_TOKEN', '')

    expect(() =>
      createGitOperations('/tmp/test-workspace', 'owner', 'repo', 'renovate/test'),
    ).toThrow('GitHub token is required when commit-back is enabled')
    vi.unstubAllEnvs()
  })
})
