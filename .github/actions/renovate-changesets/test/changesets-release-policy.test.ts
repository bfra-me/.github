import type {WorkspacePackage} from '../src/multi-package/types'
import {describe, expect, it} from 'vitest'
import {isPackageReleasable, readChangesetsReleasePolicy} from '../src/changesets-release-policy'
import {mockedFileSystem} from './setup'

const workspaceRoot = '/tmp/workspace'

function makePackage(overrides: Partial<WorkspacePackage> = {}): WorkspacePackage {
  return {
    name: '@scope/package',
    path: 'packages/package',
    packageJsonPath: `${workspaceRoot}/packages/package/package.json`,
    version: '1.0.0',
    dependencies: {},
    devDependencies: {},
    peerDependencies: {},
    optionalDependencies: {},
    private: false,
    ...overrides,
  }
}

describe('Changesets release policy', () => {
  it('uses Changesets defaults when config is absent', async () => {
    mockedFileSystem.readFile.mockRejectedValue(
      Object.assign(new Error('missing'), {code: 'ENOENT'}),
    )

    await expect(readChangesetsReleasePolicy(workspaceRoot)).resolves.toEqual({
      ignorePatterns: [],
      allowPrivatePackages: true,
    })
  })

  it('rejects malformed JSON', async () => {
    mockedFileSystem.readFile.mockResolvedValue('{')

    await expect(readChangesetsReleasePolicy(workspaceRoot)).rejects.toThrow(
      'Invalid Changesets release policy at .changeset/config.json: config.json is not valid JSON',
    )
  })

  it('rejects a non-string ignore entry', async () => {
    mockedFileSystem.readFile.mockResolvedValue(JSON.stringify({ignore: ['@scope/*', 42]}))

    await expect(readChangesetsReleasePolicy(workspaceRoot)).rejects.toThrow(
      'Invalid Changesets release policy at .changeset/config.json: ignore must be an array of strings',
    )
  })

  it('matches an exact ignored package name', async () => {
    mockedFileSystem.readFile.mockResolvedValue(JSON.stringify({ignore: ['@scope/package']}))
    const policy = await readChangesetsReleasePolicy(workspaceRoot)

    expect(isPackageReleasable(makePackage(), policy)).toBe(false)
    expect(isPackageReleasable(makePackage({name: '@scope/other'}), policy)).toBe(true)
  })

  it('matches ignored package globs', async () => {
    mockedFileSystem.readFile.mockResolvedValue(JSON.stringify({ignore: ['@scope/*']}))
    const policy = await readChangesetsReleasePolicy(workspaceRoot)

    expect(isPackageReleasable(makePackage(), policy)).toBe(false)
  })

  it('treats 0.0.0 as releasable', () => {
    expect(
      isPackageReleasable(makePackage({version: '0.0.0'}), {
        ignorePatterns: [],
        allowPrivatePackages: true,
      }),
    ).toBe(true)
  })

  it('treats a missing version as unreleasable', () => {
    expect(
      isPackageReleasable(makePackage({version: undefined}), {
        ignorePatterns: [],
        allowPrivatePackages: true,
      }),
    ).toBe(false)
  })

  it('allows private packages when privatePackages.version is true', async () => {
    mockedFileSystem.readFile.mockResolvedValue(JSON.stringify({privatePackages: {version: true}}))
    const policy = await readChangesetsReleasePolicy(workspaceRoot)

    expect(isPackageReleasable(makePackage({private: true}), policy)).toBe(true)
  })

  it('rejects private packages when privatePackages.version is false', async () => {
    mockedFileSystem.readFile.mockResolvedValue(JSON.stringify({privatePackages: {version: false}}))
    const policy = await readChangesetsReleasePolicy(workspaceRoot)

    expect(isPackageReleasable(makePackage({private: true}), policy)).toBe(false)
  })

  it('rejects private packages when privatePackages is false', async () => {
    mockedFileSystem.readFile.mockResolvedValue(JSON.stringify({privatePackages: false}))
    const policy = await readChangesetsReleasePolicy(workspaceRoot)

    expect(isPackageReleasable(makePackage({private: true}), policy)).toBe(false)
  })
})
