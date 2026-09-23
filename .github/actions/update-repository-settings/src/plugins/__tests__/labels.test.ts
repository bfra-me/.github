import type {Octokit as OctokitType} from '@octokit/rest'
import {Octokit} from '@octokit/rest'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {labelsPlugin} from '../labels.js'

const mockPaginateIterator = vi.hoisted(() => vi.fn())
const mockCreateLabel = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockUpdateLabel = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockDeleteLabel = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockInfo = vi.hoisted(() => vi.fn())
const mockWarning = vi.hoisted(() => vi.fn())
const mockSummaryWrite = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockSummaryAddRaw = vi.hoisted(() => vi.fn(() => ({write: mockSummaryWrite})))
const mockSummaryAddHeading = vi.hoisted(() => vi.fn(() => ({addRaw: mockSummaryAddRaw})))

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    rest = {
      issues: {
        listLabelsForRepo: {},
        createLabel: mockCreateLabel,
        updateLabel: mockUpdateLabel,
        deleteLabel: mockDeleteLabel,
      },
    }

    paginate = {
      iterator: mockPaginateIterator,
    }
  },
}))

vi.mock('@actions/core', () => ({
  info: mockInfo,
  warning: mockWarning,
  summary: {
    addHeading: mockSummaryAddHeading,
  },
}))

interface MockLabel {
  name: string
  color: string
  description?: string | null
}

function createOctokit(): OctokitType {
  return new Octokit({auth: 'test-token'}) as unknown as OctokitType
}

function mockLabelPages(...pages: MockLabel[][]): void {
  mockPaginateIterator.mockImplementation(async function* () {
    for (const data of pages) {
      yield {data}
    }
  })
}

describe('labelsPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLabelPages()
  })

  it('creates new labels not in the current state', async () => {
    await labelsPlugin(createOctokit(), 'bfra-me', 'repo', [
      {name: 'bug', color: '#d73a4a', description: "Something isn't working"},
    ])

    expect(mockCreateLabel).toHaveBeenCalledTimes(1)
    expect(mockCreateLabel).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      name: 'bug',
      color: 'd73a4a',
      description: "Something isn't working",
    })
    expect(mockUpdateLabel).not.toHaveBeenCalled()
    expect(mockDeleteLabel).not.toHaveBeenCalled()
  })

  it('updates existing labels when the description changes', async () => {
    mockLabelPages([{name: 'bug', color: 'd73a4a', description: 'Old description'}])

    await labelsPlugin(createOctokit(), 'bfra-me', 'repo', [
      {name: 'bug', color: 'd73a4a', description: 'New description'},
    ])

    expect(mockUpdateLabel).toHaveBeenCalledTimes(1)
    expect(mockUpdateLabel).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      name: 'bug',
      color: 'd73a4a',
      description: 'New description',
    })
    expect(mockCreateLabel).not.toHaveBeenCalled()
    expect(mockDeleteLabel).not.toHaveBeenCalled()
  })

  it('deletes labels that are not present in the desired config', async () => {
    mockLabelPages([
      {name: 'bug', color: 'd73a4a', description: 'Something is broken'},
      {name: 'wontfix', color: 'ffffff', description: 'Will not be fixed'},
    ])

    await labelsPlugin(createOctokit(), 'bfra-me', 'repo', [
      {name: 'bug', color: 'd73a4a', description: 'Something is broken'},
    ])

    expect(mockDeleteLabel).toHaveBeenCalledTimes(1)
    expect(mockDeleteLabel).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      name: 'wontfix',
    })
    expect(mockCreateLabel).not.toHaveBeenCalled()
    expect(mockUpdateLabel).not.toHaveBeenCalled()
    expect(mockWarning).toHaveBeenCalledWith('Deleting label: wontfix')
    expect(mockSummaryAddHeading).toHaveBeenCalledWith('Labels', 3)
    expect(mockSummaryAddRaw).toHaveBeenCalledWith(
      expect.stringContaining('Deleted 1 label(s): wontfix'),
      true,
    )
    expect(mockSummaryWrite).toHaveBeenCalledTimes(1)
  })

  it('skips all deletions when the number of removals exceeds the labels remaining (mass-delete breaker)', async () => {
    const currentBaseLabels: MockLabel[] = Array.from({length: 45}, (_unused, index) => ({
      name: `base-label-${index}`,
      color: '000000',
      description: '',
    }))
    mockLabelPages(currentBaseLabels)

    const desiredLocalLabels = Array.from({length: 14}, (_unused, index) => ({
      name: `local-label-${index}`,
    }))

    await labelsPlugin(createOctokit(), 'bfra-me', 'repo', desiredLocalLabels)

    expect(mockDeleteLabel).not.toHaveBeenCalled()
    expect(mockCreateLabel).toHaveBeenCalledTimes(14)
    expect(mockWarning).toHaveBeenCalledWith(
      expect.stringContaining('Skipping deletion of 45 label(s)'),
    )
    expect(mockSummaryAddHeading).toHaveBeenCalledWith('Labels', 3)
    expect(mockSummaryAddRaw).toHaveBeenCalledWith(
      expect.stringContaining('Skipped deleting 45 label(s)'),
      true,
    )
  })

  it('does not trip the mass-delete breaker for a new repo replacing all default labels', async () => {
    const currentDefaultLabels: MockLabel[] = Array.from({length: 9}, (_unused, index) => ({
      name: `default-label-${index}`,
      color: '000000',
      description: '',
    }))
    mockLabelPages(currentDefaultLabels)

    const desiredLabels = Array.from({length: 55}, (_unused, index) => ({
      name: `desired-label-${index}`,
    }))

    await labelsPlugin(createOctokit(), 'bfra-me', 'repo', desiredLabels)

    expect(mockDeleteLabel).toHaveBeenCalledTimes(9)
    expect(mockCreateLabel).toHaveBeenCalledTimes(55)
  })

  it('does not write a summary when there are no deletions', async () => {
    mockLabelPages([{name: 'bug', color: 'd73a4a', description: 'Something is broken'}])

    await labelsPlugin(createOctokit(), 'bfra-me', 'repo', [
      {name: 'bug', color: 'd73a4a', description: 'Something is broken'},
    ])

    expect(mockDeleteLabel).not.toHaveBeenCalled()
    expect(mockSummaryAddHeading).not.toHaveBeenCalled()
    expect(mockSummaryWrite).not.toHaveBeenCalled()
  })

  it('normalizes colors before comparison to avoid false updates', async () => {
    mockLabelPages([{name: 'bug', color: 'd73a4a', description: 'Something is broken'}])

    await labelsPlugin(createOctokit(), 'bfra-me', 'repo', [
      {name: 'bug', color: '#d73a4a', description: 'Something is broken'},
    ])

    expect(mockCreateLabel).not.toHaveBeenCalled()
    expect(mockUpdateLabel).not.toHaveBeenCalled()
    expect(mockDeleteLabel).not.toHaveBeenCalled()
  })

  it('handles an empty labels config with no API calls when no labels exist', async () => {
    await labelsPlugin(createOctokit(), 'bfra-me', 'repo', [])

    expect(mockCreateLabel).not.toHaveBeenCalled()
    expect(mockUpdateLabel).not.toHaveBeenCalled()
    expect(mockDeleteLabel).not.toHaveBeenCalled()
  })

  it('handles pagination when labels span multiple pages', async () => {
    mockLabelPages(
      [{name: 'bug', color: 'd73a4a', description: 'Something is broken'}],
      [{name: 'enhancement', color: 'a2eeef', description: 'New feature or request'}],
    )

    await labelsPlugin(createOctokit(), 'bfra-me', 'repo', [
      {name: 'bug', color: 'd73a4a', description: 'Something is broken'},
      {name: 'enhancement', color: 'a2eeef', description: 'New feature or request'},
    ])

    expect(mockPaginateIterator).toHaveBeenCalledTimes(1)
    expect(mockCreateLabel).not.toHaveBeenCalled()
    expect(mockUpdateLabel).not.toHaveBeenCalled()
    expect(mockDeleteLabel).not.toHaveBeenCalled()
  })

  it('creates labels with normalized colors', async () => {
    await labelsPlugin(createOctokit(), 'bfra-me', 'repo', [{name: 'feature', color: '#7057ff'}])

    expect(mockCreateLabel).toHaveBeenCalledWith({
      owner: 'bfra-me',
      repo: 'repo',
      name: 'feature',
      color: '7057ff',
      description: '',
    })
  })

  it('matches labels case-insensitively by name', async () => {
    mockLabelPages([{name: 'Bug', color: 'd73a4a', description: 'Something is broken'}])

    await labelsPlugin(createOctokit(), 'bfra-me', 'repo', [
      {name: 'bug', color: 'd73a4a', description: 'Something is broken'},
    ])

    expect(mockCreateLabel).not.toHaveBeenCalled()
    expect(mockUpdateLabel).not.toHaveBeenCalled()
    expect(mockDeleteLabel).not.toHaveBeenCalled()
  })
})
