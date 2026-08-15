import {describe, expect, it} from 'vitest'
import {hasChangesetFromThisPullRequest} from '../src/run'
import {mockedFileSystem} from './setup'

describe('hasChangesetFromThisPullRequest', () => {
  // The repository normally holds every unreleased changeset in `.changeset/`, so the directory is
  // never empty between releases. A check that skipped whenever any changeset existed would skip
  // every run and the action would silently stop producing changesets.
  it('ignores unrelated changesets that this pull request did not add', async () => {
    const changedFiles = ['package.json', 'pnpm-lock.yaml']

    await expect(hasChangesetFromThisPullRequest('/tmp/workspace', changedFiles)).resolves.toBe(
      false,
    )
    expect(mockedFileSystem.stat).not.toHaveBeenCalled()
  })

  it('reports an existing changeset that this pull request added and that survives on disk', async () => {
    mockedFileSystem.stat.mockResolvedValue({isFile: () => true})
    const changedFiles = ['.changeset/renovate-abc1234.md', 'package.json']

    await expect(hasChangesetFromThisPullRequest('/tmp/workspace', changedFiles)).resolves.toBe(
      true,
    )
    expect(mockedFileSystem.stat).toHaveBeenCalledWith(
      '/tmp/workspace/.changeset/renovate-abc1234.md',
    )
  })

  // Renovate force-pushes to rebase, which erases a changeset committed by an earlier run while the
  // changed-file list from the API still reports it. Trusting the list alone would skip
  // regeneration and the pull request would merge with no changeset at all.
  it('regenerates when a force-push erased the changeset the API still reports', async () => {
    const missing = Object.assign(new Error('missing'), {code: 'ENOENT'})
    mockedFileSystem.stat.mockRejectedValue(missing)
    const changedFiles = ['.changeset/renovate-abc1234.md']

    await expect(hasChangesetFromThisPullRequest('/tmp/workspace', changedFiles)).resolves.toBe(
      false,
    )
  })

  it('does not treat the changeset README as a changeset', async () => {
    const changedFiles = ['.changeset/README.md']

    await expect(hasChangesetFromThisPullRequest('/tmp/workspace', changedFiles)).resolves.toBe(
      false,
    )
    expect(mockedFileSystem.stat).not.toHaveBeenCalled()
  })
})
