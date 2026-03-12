import type {Octokit as OctokitType} from '@octokit/rest'
import {Octokit} from '@octokit/rest'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {milestonesPlugin} from '../milestones.js'

const mockListMilestones = vi.hoisted(() => vi.fn())
const mockCreateMilestone = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockUpdateMilestone = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockDeleteMilestone = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockInfo = vi.hoisted(() => vi.fn())
const mockWarning = vi.hoisted(() => vi.fn())

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    rest = {
      issues: {
        listMilestones: mockListMilestones,
        createMilestone: mockCreateMilestone,
        updateMilestone: mockUpdateMilestone,
        deleteMilestone: mockDeleteMilestone,
      },
    }
  },
}))

vi.mock('@actions/core', () => ({
  info: mockInfo,
  warning: mockWarning,
}))

interface MockMilestone {
  title: string
  number: number
  description?: string | null
  due_on?: string | null
  state: 'open' | 'closed'
}

function createOctokit(): OctokitType {
  return new Octokit({auth: 'test-token'}) as unknown as OctokitType
}

function mockMilestones(milestones: MockMilestone[]): void {
  mockListMilestones.mockResolvedValue({data: milestones})
}

describe('milestonesPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMilestones([])
  })

  it('creates new milestones not in the current state', async () => {
    await milestonesPlugin(createOctokit(), 'bfra-me', 'repo', [
      {title: 'v1.0', description: 'Release 1.0', state: 'open'},
    ])

    expect(mockCreateMilestone).toHaveBeenCalledTimes(1)
    expect(mockCreateMilestone).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      title: 'v1.0',
      description: 'Release 1.0',
      due_on: undefined,
      state: 'open',
    })
    expect(mockUpdateMilestone).not.toHaveBeenCalled()
    expect(mockDeleteMilestone).not.toHaveBeenCalled()
  })

  it('updates existing milestones when fields change', async () => {
    mockMilestones([
      {
        title: 'v1.0',
        number: 1,
        description: 'Old release',
        due_on: null,
        state: 'open',
      },
    ])

    await milestonesPlugin(createOctokit(), 'bfra-me', 'repo', [
      {title: 'v1.0', description: 'New release', state: 'closed'},
    ])

    expect(mockUpdateMilestone).toHaveBeenCalledTimes(1)
    expect(mockUpdateMilestone).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      milestone_number: 1,
      title: 'v1.0',
      description: 'New release',
      due_on: undefined,
      state: 'closed',
    })
    expect(mockCreateMilestone).not.toHaveBeenCalled()
    expect(mockDeleteMilestone).not.toHaveBeenCalled()
  })

  it('hard deletes milestones not present in the desired config', async () => {
    mockMilestones([
      {title: 'v1.0', number: 1, description: 'Release 1.0', due_on: null, state: 'open'},
      {title: 'v0.9', number: 2, description: 'Release 0.9', due_on: null, state: 'closed'},
    ])

    await milestonesPlugin(createOctokit(), 'bfra-me', 'repo', [
      {title: 'v1.0', description: 'Release 1.0', state: 'open'},
    ])

    expect(mockDeleteMilestone).toHaveBeenCalledTimes(1)
    expect(mockDeleteMilestone).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      milestone_number: 2,
    })
  })

  it('does not use updateMilestone to close absent milestones', async () => {
    mockMilestones([
      {title: 'v0.9', number: 2, description: 'Release 0.9', due_on: null, state: 'open'},
    ])

    await milestonesPlugin(createOctokit(), 'bfra-me', 'repo', [])

    expect(mockDeleteMilestone).not.toHaveBeenCalled()
    expect(mockUpdateMilestone).not.toHaveBeenCalledWith(
      expect.objectContaining({milestone_number: 2, state: 'closed'}),
    )
  })

  it('handles an empty config as a no-op', async () => {
    await milestonesPlugin(createOctokit(), 'bfra-me', 'repo', [])

    expect(mockListMilestones).not.toHaveBeenCalled()
    expect(mockCreateMilestone).not.toHaveBeenCalled()
    expect(mockUpdateMilestone).not.toHaveBeenCalled()
    expect(mockDeleteMilestone).not.toHaveBeenCalled()
  })

  it('skips non-array config with a warning', async () => {
    await milestonesPlugin(createOctokit(), 'bfra-me', 'repo', {title: 'v1.0'})

    expect(mockWarning).toHaveBeenCalledWith('milestones config must be an array, skipping')
    expect(mockListMilestones).not.toHaveBeenCalled()
    expect(mockCreateMilestone).not.toHaveBeenCalled()
    expect(mockUpdateMilestone).not.toHaveBeenCalled()
    expect(mockDeleteMilestone).not.toHaveBeenCalled()
  })

  it('handles add, update, and remove in a single sync', async () => {
    mockMilestones([
      {title: 'v1.0', number: 1, description: 'Old 1.0', due_on: null, state: 'open'},
      {title: 'v0.9', number: 2, description: 'Legacy', due_on: null, state: 'closed'},
      {title: 'v0.8', number: 3, description: 'Older', due_on: null, state: 'open'},
    ])

    await milestonesPlugin(createOctokit(), 'bfra-me', 'repo', [
      {title: 'v1.0', description: 'Release 1.0', state: 'closed'},
      {
        title: 'v2.0',
        description: 'Release 2.0',
        due_on: '2026-06-01T00:00:00Z',
        state: 'open',
      },
    ])

    expect(mockCreateMilestone).toHaveBeenCalledTimes(1)
    expect(mockCreateMilestone).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      title: 'v2.0',
      description: 'Release 2.0',
      due_on: '2026-06-01T00:00:00Z',
      state: 'open',
    })
    expect(mockUpdateMilestone).toHaveBeenCalledTimes(1)
    expect(mockUpdateMilestone).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      milestone_number: 1,
      title: 'v1.0',
      description: 'Release 1.0',
      due_on: undefined,
      state: 'closed',
    })
    expect(mockDeleteMilestone).toHaveBeenCalledTimes(2)
    expect(mockDeleteMilestone).toHaveBeenNthCalledWith(1, {
      owner: 'bfra-me',
      repo: 'repo',
      milestone_number: 2,
    })
    expect(mockDeleteMilestone).toHaveBeenNthCalledWith(2, {
      owner: 'bfra-me',
      repo: 'repo',
      milestone_number: 3,
    })
  })

  it('matches milestones case-insensitively by title', async () => {
    mockMilestones([
      {title: 'V1.0', number: 1, description: 'Release 1.0', due_on: null, state: 'open'},
    ])

    await milestonesPlugin(createOctokit(), 'bfra-me', 'repo', [
      {title: 'v1.0', description: 'Release 1.0', state: 'open'},
    ])

    expect(mockCreateMilestone).not.toHaveBeenCalled()
    expect(mockUpdateMilestone).not.toHaveBeenCalled()
    expect(mockDeleteMilestone).not.toHaveBeenCalled()
  })
})
