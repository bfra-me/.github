import {describe, expect, it, vi} from 'vitest'
import {writeChangesetFiles, writeRenovateChangeset} from '../src/changeset-writer'
import {mockedChangesets, mockedFileSystem, mockedGitHubActions} from './setup'

describe('changeset writer', () => {
  it('writes one changeset with release frontmatter', async () => {
    mockedGitHubActions.exec.getExecOutput.mockResolvedValue({
      stdout: 'abc1234\n',
      stderr: '',
      exitCode: 0,
    })
    mockedFileSystem.access.mockRejectedValue(new Error('missing'))

    const file = await writeRenovateChangeset(
      {
        releases: [{name: '@scope/package', type: 'minor'}],
        summary: 'Update npm dependency `package`',
      },
      '/tmp/workspace',
    )

    expect(file).toBe('renovate-abc1234.md')
    expect(mockedFileSystem.writeFile).toHaveBeenCalledWith(
      '/tmp/workspace/.changeset/renovate-abc1234.md',
      expect.stringContaining("'@scope/package': minor"),
      'utf8',
    )
  })

  it('writes one grouped changeset naming every release', async () => {
    mockedFileSystem.access.mockRejectedValue(new Error('missing'))

    const files = await writeChangesetFiles(
      [
        {
          id: 'renovate-group',
          filename: 'renovate-group.md',
          packages: ['eslint', 'prettier'],
          summary: 'Group update for npm dependencies: `eslint`, `prettier`',
          releases: [
            {name: 'eslint', type: 'major'},
            {name: 'prettier', type: 'major'},
          ],
          relationships: [],
          metadata: {
            isGrouped: true,
            isSecurityUpdate: false,
            hasBreakingChanges: true,
            affectedDependencies: ['eslint', 'prettier'],
            reasoning: [],
          },
        },
      ],
      {
        workingDirectory: '/tmp/workspace',
        useOfficialChangesets: false,
        createSeparateChangesets: false,
        respectPackageRelationships: true,
        groupRelatedPackages: true,
        packageNameTemplate: 'renovate-{sha}',
        includeRelationshipInfo: true,
        maxChangesetsPerPR: 10,
        enableDeduplication: false,
      },
    )

    expect(files).toEqual(['.changeset/renovate-group.md'])
    expect(mockedFileSystem.writeFile).toHaveBeenCalledWith(
      '/tmp/workspace/.changeset/renovate-group.md',
      expect.stringContaining("'eslint': major\n'prettier': major"),
      'utf8',
    )
  })

  it('skips a changeset already present on disk', async () => {
    mockedFileSystem.access.mockResolvedValue(undefined)

    const file = await writeRenovateChangeset(
      {releases: [{name: 'package', type: 'patch'}], summary: 'Update package'},
      '/tmp/workspace',
    )

    expect(file).toBe('existing')
    expect(mockedFileSystem.writeFile).not.toHaveBeenCalled()
  })

  it('dispatches to @changesets/write outside the Vitest environment', async () => {
    vi.stubEnv('VITEST', '')
    vi.stubEnv('NODE_ENV', 'production')
    mockedFileSystem.access.mockRejectedValue(new Error('missing'))
    mockedChangesets.write.mockResolvedValue('official-id')
    mockedFileSystem.readFile.mockResolvedValue('---\npackage: patch\n---\n\nUpdate package\n')

    try {
      const files = await writeChangesetFiles(
        [
          {
            id: 'official',
            filename: 'official.md',
            packages: ['package'],
            summary: 'Update package',
            releases: [{name: 'package', type: 'patch'}],
            relationships: [],
            metadata: {
              isGrouped: false,
              isSecurityUpdate: false,
              hasBreakingChanges: false,
              affectedDependencies: ['package'],
              reasoning: [],
            },
          },
        ],
        {
          workingDirectory: '/tmp/workspace',
          useOfficialChangesets: true,
          createSeparateChangesets: false,
          respectPackageRelationships: true,
          groupRelatedPackages: true,
          packageNameTemplate: 'renovate-{sha}',
          includeRelationshipInfo: true,
          maxChangesetsPerPR: 10,
          enableDeduplication: false,
        },
      )

      expect(files).toEqual(['.changeset/official.md'])
      expect(mockedChangesets.write).toHaveBeenCalledWith(
        {summary: 'Update package', releases: [{name: 'package', type: 'patch'}]},
        '/tmp/workspace',
      )
      expect(mockedFileSystem.readFile).toHaveBeenCalledWith(
        '/tmp/workspace/.changeset/official-id.md',
        'utf8',
      )
      expect(mockedFileSystem.unlink).toHaveBeenCalledWith(
        '/tmp/workspace/.changeset/official-id.md',
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
