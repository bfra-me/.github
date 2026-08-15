import {describe, expect, it} from 'vitest'
import {hasChangesetOnDisk} from '../src/run'
import {mockedFileSystem} from './setup'

describe('hasChangesetOnDisk', () => {
  it('checks the checkout instead of trusting the changed-file API list', async () => {
    mockedFileSystem.readdir.mockResolvedValue([
      {name: 'README.md', isFile: () => true},
      {name: 'renovate-existing.md', isFile: () => true},
    ])

    await expect(hasChangesetOnDisk('/tmp/workspace')).resolves.toBe(true)
    expect(mockedFileSystem.readdir).toHaveBeenCalledWith('/tmp/workspace/.changeset', {
      withFileTypes: true,
    })
  })

  it('treats a missing changeset directory as no existing changeset', async () => {
    const missing = Object.assign(new Error('missing'), {code: 'ENOENT'})
    mockedFileSystem.readdir.mockRejectedValue(missing)

    await expect(hasChangesetOnDisk('/tmp/workspace')).resolves.toBe(false)
  })
})
