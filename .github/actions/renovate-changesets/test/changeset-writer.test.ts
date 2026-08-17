import {describe, expect, it, vi} from 'vitest'
import {writeChangesetFiles, writeRenovateChangeset} from '../src/changeset-writer'
import {mockedChangesets, mockedFileSystem, mockedGitHubActions} from './setup'

describe('changeset writer', () => {
  const groupedConfig = {
    workingDirectory: '/tmp/workspace',
    useOfficialChangesets: true,
    createSeparateChangesets: false,
    respectPackageRelationships: true,
    groupRelatedPackages: true,
    packageNameTemplate: 'renovate-{sha}',
    includeRelationshipInfo: true,
    maxChangesetsPerPR: 10,
    enableDeduplication: false,
  }

  const changeset = (filename: string, packageName: string) => ({
    id: filename,
    filename,
    packages: [packageName],
    summary: 'Update Docker image `postgres`',
    releases: [{name: packageName, type: 'patch' as const}],
    relationships: [],
    metadata: {
      isGrouped: true,
      isSecurityUpdate: false,
      hasBreakingChanges: false,
      affectedDependencies: [packageName],
      reasoning: [],
    },
  })

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

    const result = await writeChangesetFiles(
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

    expect(result.filesCreated).toEqual(['.changeset/renovate-group.md'])
    expect(mockedFileSystem.writeFile).toHaveBeenCalledWith(
      '/tmp/workspace/.changeset/renovate-group.md',
      expect.stringContaining("'eslint': major\n'prettier': major"),
      'utf8',
    )
  })

  it('falls back to manual creation for every grouped changeset when official writing fails', async () => {
    vi.stubEnv('VITEST', '')
    vi.stubEnv('NODE_ENV', 'production')
    mockedFileSystem.access.mockRejectedValue(new Error('missing'))
    mockedChangesets.write.mockRejectedValue(
      new Error("Cannot find module '@bfra.me/prettier-config/120-proof'"),
    )

    try {
      const result = await writeChangesetFiles(
        [
          changeset('umami.md', '@marcusrbrown/infra-umami'),
          changeset('shared.md', '@marcusrbrown/infra-shared'),
        ],
        groupedConfig,
      )
      expect(result.filesCreated).toEqual(['.changeset/umami.md', '.changeset/shared.md'])
      expect(mockedFileSystem.writeFile).toHaveBeenCalledTimes(2)
      expect(mockedFileSystem.writeFile).toHaveBeenNthCalledWith(
        1,
        '/tmp/workspace/.changeset/umami.md',
        expect.stringContaining("'@marcusrbrown/infra-umami': patch"),
        'utf8',
      )
      expect(mockedFileSystem.writeFile).toHaveBeenNthCalledWith(
        2,
        '/tmp/workspace/.changeset/shared.md',
        expect.stringContaining("'@marcusrbrown/infra-shared': patch"),
        'utf8',
      )
      expect(mockedFileSystem.writeFile.mock.calls[0]?.[1]).toContain(
        'Update Docker image `postgres`',
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('writes both releases in the production grouped Docker failure case', async () => {
    vi.stubEnv('VITEST', '')
    vi.stubEnv('NODE_ENV', 'production')
    mockedFileSystem.access.mockRejectedValue(new Error('missing'))
    mockedChangesets.write.mockRejectedValue(
      new Error("Cannot find module '@bfra.me/prettier-config/120-proof'"),
    )

    try {
      const result = await writeChangesetFiles(
        [
          {
            ...changeset('infra-group.md', '@marcusrbrown/infra-umami'),
            packages: ['@marcusrbrown/infra-umami', '@marcusrbrown/infra-shared'],
            metadata: {
              ...changeset('infra-group.md', '@marcusrbrown/infra-umami').metadata,
              affectedDependencies: ['@marcusrbrown/infra-umami', '@marcusrbrown/infra-shared'],
            },
            releases: [
              {name: '@marcusrbrown/infra-umami', type: 'patch' as const},
              {name: '@marcusrbrown/infra-shared', type: 'patch' as const},
            ],
          },
        ],
        groupedConfig,
      )

      expect(result.filesCreated).toEqual(['.changeset/infra-group.md'])
      expect(mockedFileSystem.writeFile).toHaveBeenCalledWith(
        '/tmp/workspace/.changeset/infra-group.md',
        expect.stringContaining(
          "'@marcusrbrown/infra-umami': patch\n'@marcusrbrown/infra-shared': patch",
        ),
        'utf8',
      )
      expect(mockedFileSystem.writeFile.mock.calls[0]?.[1]).toContain(
        'Update Docker image `postgres`',
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('uses the official writer for grouped changesets when it succeeds', async () => {
    vi.stubEnv('VITEST', '')
    vi.stubEnv('NODE_ENV', 'production')
    mockedFileSystem.access.mockRejectedValue(new Error('missing'))
    mockedChangesets.write
      .mockResolvedValueOnce('umami-official')
      .mockResolvedValueOnce('shared-official')
    mockedFileSystem.readFile
      .mockResolvedValueOnce('---\n@marcusrbrown/infra-umami: patch\n---\n')
      .mockResolvedValueOnce('---\n@marcusrbrown/infra-shared: patch\n---\n')

    try {
      const result = await writeChangesetFiles(
        [
          changeset('umami.md', '@marcusrbrown/infra-umami'),
          changeset('shared.md', '@marcusrbrown/infra-shared'),
        ],
        groupedConfig,
      )

      expect(result.filesCreated).toEqual(['.changeset/umami.md', '.changeset/shared.md'])
      expect(mockedChangesets.write).toHaveBeenCalledTimes(2)
      expect(mockedFileSystem.unlink).toHaveBeenCalledWith(
        '/tmp/workspace/.changeset/umami-official.md',
      )
      expect(mockedFileSystem.unlink).toHaveBeenCalledWith(
        '/tmp/workspace/.changeset/shared-official.md',
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('skips only the grouped changeset whose manual fallback fails', async () => {
    vi.stubEnv('VITEST', '')
    vi.stubEnv('NODE_ENV', 'production')
    mockedFileSystem.access.mockRejectedValue(new Error('missing'))
    mockedChangesets.write.mockRejectedValue(new Error('official writer failed'))
    mockedFileSystem.writeFile
      .mockRejectedValueOnce(new Error('manual write failed'))
      .mockResolvedValueOnce(undefined)

    try {
      const result = await writeChangesetFiles(
        [
          changeset('failed.md', '@marcusrbrown/infra-umami'),
          changeset('ok.md', '@marcusrbrown/infra-shared'),
        ],
        groupedConfig,
      )

      expect(result.filesCreated).toEqual(['.changeset/ok.md'])
      expect(result.failed).toEqual([{file: '.changeset/failed.md', reason: 'manual write failed'}])
      expect(mockedFileSystem.writeFile).toHaveBeenCalledTimes(2)
    } finally {
      vi.unstubAllEnvs()
    }
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
      const result = await writeChangesetFiles(
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

      expect(result.filesCreated).toEqual(['.changeset/official.md'])
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

  it('falls back to manual creation for a single changeset when official writing fails', async () => {
    vi.stubEnv('VITEST', '')
    vi.stubEnv('NODE_ENV', 'production')
    mockedGitHubActions.exec.getExecOutput.mockResolvedValue({
      stdout: 'fallback123\n',
      stderr: '',
      exitCode: 0,
    })
    mockedFileSystem.access.mockRejectedValue(new Error('missing'))
    mockedChangesets.write.mockRejectedValue(new Error('prettier config unavailable'))

    try {
      const file = await writeRenovateChangeset(
        {releases: [{name: '@scope/package', type: 'patch'}], summary: 'Update package'},
        '/tmp/workspace',
      )

      expect(file).toBe('renovate-fallback123.md')
      expect(mockedFileSystem.writeFile).toHaveBeenCalledWith(
        '/tmp/workspace/.changeset/renovate-fallback123.md',
        expect.stringContaining("'@scope/package': patch"),
        'utf8',
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
