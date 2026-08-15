import type {GroupedPR, GroupedPRConfig} from '../src/grouped-pr-manager'
import {describe, expect, it, vi} from 'vitest'
import {GroupedPRManager} from '../src/grouped-pr-manager'
import {mockedOctokit} from './setup'

function createConfig(overrides: Partial<GroupedPRConfig> = {}): GroupedPRConfig {
  return {
    enabled: true,
    maxPRs: 10,
    updateDescriptions: true,
    createComments: true,
    failureStrategy: 'continue',
    skipCurrentPR: true,
    ...overrides,
  }
}

function currentPR(number = 1, head = 'renovate/npm-group-one') {
  return {number, title: 'Update group', head: {ref: head}}
}

function relatedPR(number: number, title: string, head: string) {
  return {number, title, head: {ref: head}}
}

const renovateContext = {
  dependencies: [
    {name: 'react', groupName: 'react ecosystem'},
    {name: 'react-dom', groupName: 'react ecosystem'},
  ],
} as never

const plainContext = {
  dependencies: [{name: 'react'}, {name: 'react-dom'}],
} as never

describe('GroupedPRManager', () => {
  it('skips grouped detection when disabled', async () => {
    const manager = new GroupedPRManager(
      mockedOctokit as never,
      'owner',
      'repo',
      createConfig({enabled: false}),
    )

    await expect(manager.detectGroupedPRs(1, renovateContext)).resolves.toEqual([])
    expect(mockedOctokit.rest.pulls.get).not.toHaveBeenCalled()
  })

  it('finds group-name PRs, deduplicates them, and respects maxPRs', async () => {
    const manager = new GroupedPRManager(
      mockedOctokit as never,
      'owner',
      'repo',
      createConfig({maxPRs: 2}),
    )
    mockedOctokit.rest.pulls.get
      .mockResolvedValueOnce({data: currentPR()})
      .mockResolvedValueOnce({data: relatedPR(2, 'Update lodash to v4.17.21', 'renovate/lodash')})
      .mockResolvedValueOnce({data: relatedPR(1, 'Duplicate current', 'renovate/npm-group-one')})
    mockedOctokit.rest.search.issuesAndPullRequests.mockResolvedValueOnce({
      data: {
        items: [
          {number: 2, pull_request: {}},
          {number: 1, pull_request: {}},
        ],
      },
    })

    await expect(manager.detectGroupedPRs(1, renovateContext)).resolves.toEqual([
      expect.objectContaining({number: 1, isCurrent: true, groupName: 'react ecosystem'}),
      expect.objectContaining({number: 2, isCurrent: false, dependencies: ['lodash']}),
    ])
  })

  it('falls back to branch-pattern discovery when group-name search is unavailable', async () => {
    const manager = new GroupedPRManager(mockedOctokit as never, 'owner', 'repo', createConfig())
    mockedOctokit.rest.pulls.get
      .mockResolvedValueOnce({data: currentPR(1, 'renovate/npm-group-one')})
      .mockResolvedValueOnce({
        data: relatedPR(2, 'Update lodash to v4.17.21', 'renovate/npm-group-two'),
      })
    mockedOctokit.rest.search.issuesAndPullRequests.mockResolvedValueOnce({
      data: {items: [{number: 2, pull_request: {}}]},
    })

    const result = await manager.detectGroupedPRs(1, plainContext)

    expect(result).toEqual([
      expect.objectContaining({number: 1}),
      expect.objectContaining({number: 2, dependencies: ['lodash']}),
    ])
    expect(mockedOctokit.rest.search.issuesAndPullRequests).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({q: expect.stringContaining('head:renovate/npm-group-*')}),
    )
  })

  it('falls back to dependency discovery and filters non-Renovate PRs', async () => {
    const manager = new GroupedPRManager(mockedOctokit as never, 'owner', 'repo', createConfig())
    mockedOctokit.rest.pulls.get
      .mockResolvedValueOnce({data: currentPR(1, 'renovate/npm')})
      .mockResolvedValueOnce({data: relatedPR(2, 'Update lodash to v4.17.21', 'renovate/lodash')})
      .mockResolvedValueOnce({data: relatedPR(3, 'Fix unrelated issue', 'feature/unrelated')})
    mockedOctokit.rest.search.issuesAndPullRequests
      .mockResolvedValueOnce({data: {items: [{number: 2, pull_request: {}}]}})
      .mockResolvedValueOnce({data: {items: [{number: 3, pull_request: {}}]}})
      .mockResolvedValueOnce({data: {items: []}})

    const result = await manager.detectGroupedPRs(1, plainContext)

    expect(result.map(pr => pr.number)).toEqual([1, 2])
    expect(mockedOctokit.rest.search.issuesAndPullRequests).toHaveBeenCalledTimes(2)
  })

  it('continues through a failed discovery strategy', async () => {
    const manager = new GroupedPRManager(mockedOctokit as never, 'owner', 'repo', createConfig())
    mockedOctokit.rest.pulls.get.mockResolvedValueOnce({data: currentPR(1, 'renovate/npm')})
    mockedOctokit.rest.search.issuesAndPullRequests
      .mockRejectedValueOnce(new Error('search unavailable'))
      .mockResolvedValueOnce({data: {items: []}})
      .mockResolvedValueOnce({data: {items: []}})

    await expect(manager.detectGroupedPRs(1, plainContext)).resolves.toEqual([
      expect.objectContaining({number: 1}),
    ])
    expect(mockedOctokit.rest.search.issuesAndPullRequests).toHaveBeenCalledTimes(2)
  })

  it('updates descriptions and comments while skipping the current PR by default', async () => {
    const manager = new GroupedPRManager(mockedOctokit as never, 'owner', 'repo', createConfig())
    const updateDescription = vi.fn().mockResolvedValue(undefined)
    const createComment = vi.fn().mockResolvedValue(undefined)
    const prs: GroupedPR[] = [
      {number: 1, title: 'Current', head: 'renovate/current', isCurrent: true, dependencies: []},
      {
        number: 2,
        title: 'Related',
        head: 'renovate/related',
        isCurrent: false,
        dependencies: ['lodash'],
      },
    ]

    const result = await manager.updateGroupedPRs(
      prs,
      'Update summary',
      [{name: 'pkg', type: 'patch'}],
      ['lodash'],
      {
        primaryCategory: 'patch',
        allCategories: ['patch'],
        summary: {
          securityUpdates: 0,
          breakingChanges: 0,
          highPriorityUpdates: 0,
          averageRiskLevel: 20,
        },
        confidence: 'high',
      },
      {strategy: 'single', reasoning: []},
      updateDescription,
      createComment,
      '.changeset/one.md',
    )

    expect(result).toMatchObject({totalPRs: 2, updatedPRs: 1, failedPRs: 0})
    expect(result.prResults).toEqual([expect.objectContaining({prNumber: 2, success: true})])
    expect(updateDescription).toHaveBeenCalledTimes(1)
    expect(createComment).toHaveBeenCalledTimes(1)
  })

  it('includes the current PR when skip-current-pr-in-group is false', async () => {
    const manager = new GroupedPRManager(
      mockedOctokit as never,
      'owner',
      'repo',
      createConfig({skipCurrentPR: false, createComments: false}),
    )
    const updateDescription = vi.fn().mockResolvedValue(undefined)
    const createComment = vi.fn().mockResolvedValue(undefined)
    const prs: GroupedPR[] = [
      {number: 1, title: 'Current', head: 'renovate/current', isCurrent: true, dependencies: []},
    ]

    const result = await manager.updateGroupedPRs(
      prs,
      'Update summary',
      [{name: 'pkg', type: 'patch'}],
      [],
      {
        primaryCategory: 'patch',
        allCategories: ['patch'],
        summary: {
          securityUpdates: 0,
          breakingChanges: 0,
          highPriorityUpdates: 0,
          averageRiskLevel: 20,
        },
        confidence: 'high',
      },
      {strategy: 'single', reasoning: []},
      updateDescription,
      createComment,
      '.changeset/one.md',
    )

    expect(result).toMatchObject({totalPRs: 1, updatedPRs: 1, failedPRs: 0})
    expect(updateDescription).toHaveBeenCalledOnce()
    expect(createComment).not.toHaveBeenCalled()
  })

  it('continues after an update failure when configured to continue', async () => {
    const manager = new GroupedPRManager(
      mockedOctokit as never,
      'owner',
      'repo',
      createConfig({createComments: false, failureStrategy: 'continue', skipCurrentPR: false}),
    )
    const updateDescription = vi
      .fn()
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValueOnce(undefined)
    const prs: GroupedPR[] = [
      {number: 1, title: 'First', head: 'renovate/one', isCurrent: true, dependencies: []},
      {number: 2, title: 'Second', head: 'renovate/two', isCurrent: false, dependencies: []},
    ]

    const result = await manager.updateGroupedPRs(
      prs,
      'Update summary',
      [],
      [],
      {
        primaryCategory: 'patch',
        allCategories: ['patch'],
        summary: {
          securityUpdates: 0,
          breakingChanges: 0,
          highPriorityUpdates: 0,
          averageRiskLevel: 20,
        },
        confidence: 'high',
      },
      {strategy: 'single', reasoning: []},
      updateDescription,
      vi.fn(),
      '.changeset/one.md',
    )

    expect(result).toMatchObject({updatedPRs: 2, failedPRs: 0})
    expect(result.prResults).toHaveLength(2)
  })

  it('stops after the first update failure when configured to stop', async () => {
    const manager = new GroupedPRManager(
      mockedOctokit as never,
      'owner',
      'repo',
      createConfig({createComments: false, failureStrategy: 'stop', skipCurrentPR: false}),
    )
    const updateDescription = vi.fn().mockRejectedValue(new Error('stop here'))
    const prs: GroupedPR[] = [
      {number: 1, title: 'First', head: 'renovate/one', isCurrent: true, dependencies: []},
      {number: 2, title: 'Second', head: 'renovate/two', isCurrent: false, dependencies: []},
    ]

    const result = await manager.updateGroupedPRs(
      prs,
      'Update summary',
      [],
      [],
      {
        primaryCategory: 'patch',
        allCategories: ['patch'],
        summary: {
          securityUpdates: 0,
          breakingChanges: 0,
          highPriorityUpdates: 0,
          averageRiskLevel: 20,
        },
        confidence: 'high',
      },
      {strategy: 'single', reasoning: []},
      updateDescription,
      vi.fn(),
      '.changeset/one.md',
    )

    expect(result).toMatchObject({updatedPRs: 0, failedPRs: 1})
    expect(result.prResults).toHaveLength(0)
  })

  it('records grouping metadata for group-name, branch-pattern, dependency, and none strategies', async () => {
    const manager = new GroupedPRManager(mockedOctokit as never, 'owner', 'repo', createConfig())
    const update = (prs: GroupedPR[]) =>
      manager.updateGroupedPRs(
        prs,
        'summary',
        [],
        [],
        {
          primaryCategory: 'patch',
          allCategories: ['patch'],
          summary: {
            securityUpdates: 0,
            breakingChanges: 0,
            highPriorityUpdates: 0,
            averageRiskLevel: 20,
          },
          confidence: 'high',
        },
        {strategy: 'single', reasoning: []},
        vi.fn().mockResolvedValue(undefined),
        vi.fn().mockResolvedValue(undefined),
        '.changeset/one.md',
      )

    const groupNameResult = await update([
      {
        number: 1,
        title: 'one',
        head: 'renovate/one',
        isCurrent: false,
        groupName: 'group',
        dependencies: [],
      },
      {number: 2, title: 'two', head: 'renovate/two', isCurrent: false, dependencies: []},
    ])
    expect(groupNameResult.groupingStrategy).toBe('group-name')
    expect(groupNameResult.groupIdentifier).toBe('group')

    const branchResult = await update([
      {number: 1, title: 'one', head: 'renovate/group-one', isCurrent: false, dependencies: []},
      {number: 2, title: 'two', head: 'renovate/group-two', isCurrent: false, dependencies: []},
    ])
    expect(branchResult.groupingStrategy).toBe('branch-pattern')
    expect(branchResult.groupIdentifier).toBe('renovate/group-')

    const dependencyResult = await update([
      {number: 1, title: 'one', head: 'renovate/one', isCurrent: false, dependencies: []},
      {number: 2, title: 'two', head: 'feature/two', isCurrent: false, dependencies: []},
    ])
    expect(dependencyResult.groupingStrategy).toBe('dependencies')

    const noneResult = await update([
      {number: 1, title: 'one', head: 'feature/one', isCurrent: false, dependencies: []},
    ])
    expect(noneResult.groupingStrategy).toBe('none')
    expect(noneResult.groupIdentifier).toBe('feature/one')
  })
})
