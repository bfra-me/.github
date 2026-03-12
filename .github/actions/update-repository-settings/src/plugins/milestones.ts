import type {Octokit} from '@octokit/rest'
import * as core from '@actions/core'
import {diffCollections} from '../diff.js'

type MilestoneState = 'open' | 'closed'

interface MilestoneConfig {
  title: string
  description?: string
  due_on?: string
  state?: string
}

interface CurrentMilestone {
  title: string
  number: number
  description?: string | null
  due_on?: string | null
  state: string
}

interface ComparableMilestone {
  title: string
  description?: string
  due_on?: string
  state?: string
  number?: number
}

interface ExistingMilestone extends ComparableMilestone {
  number: number
}

function isMilestoneConfig(value: unknown): value is MilestoneConfig {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return 'title' in value && typeof value.title === 'string'
}

function isEmptyConfig(config: unknown[]): boolean {
  return config.length === 0
}

function getMilestoneKey(milestone: {title: string}): string {
  return milestone.title.toLowerCase()
}

function toCurrentMilestone(milestone: CurrentMilestone): ComparableMilestone {
  return {
    title: milestone.title,
    number: milestone.number,
    description: milestone.description ?? undefined,
    due_on: milestone.due_on ?? undefined,
    state: milestone.state,
  }
}

function milestonesDiffer(current: ComparableMilestone, desired: MilestoneConfig): boolean {
  return (
    current.description !== (desired.description ?? current.description) ||
    current.due_on !== (desired.due_on ?? current.due_on) ||
    current.state !== (desired.state ?? current.state)
  )
}

function hasMilestoneNumber(milestone: ComparableMilestone): milestone is ExistingMilestone {
  return milestone.number != null
}

export async function milestonesPlugin(
  octokit: Octokit,
  owner: string,
  repo: string,
  config: unknown,
): Promise<void> {
  if (!Array.isArray(config)) {
    core.warning('milestones config must be an array, skipping')
    return
  }

  if (isEmptyConfig(config)) {
    return
  }

  const desiredMilestones = config.filter(isMilestoneConfig)
  const response = await octokit.rest.issues.listMilestones({
    owner,
    repo,
    state: 'all',
    per_page: 100,
  })
  const currentMilestones = response.data.map(milestone =>
    toCurrentMilestone({
      title: milestone.title,
      number: milestone.number,
      description: milestone.description,
      due_on: milestone.due_on,
      state: milestone.state,
    }),
  )
  const comparableDesiredMilestones: ComparableMilestone[] = desiredMilestones.map(milestone => ({
    title: milestone.title,
    description: milestone.description,
    due_on: milestone.due_on,
    state: milestone.state,
  }))

  const {add, update, remove} = diffCollections(
    currentMilestones,
    comparableDesiredMilestones,
    getMilestoneKey,
  )
  const currentByTitle = new Map(
    currentMilestones
      .filter(hasMilestoneNumber)
      .map(milestone => [getMilestoneKey(milestone), milestone]),
  )
  const milestonesToUpdate = update.filter(milestone => {
    const currentMilestone = currentByTitle.get(getMilestoneKey(milestone))
    return currentMilestone != null && milestonesDiffer(currentMilestone, milestone)
  })

  for (const milestone of add) {
    core.info(`Creating milestone: ${milestone.title}`)
    await octokit.rest.issues.createMilestone({
      owner,
      repo,
      title: milestone.title,
      description: milestone.description,
      due_on: milestone.due_on,
      state: milestone.state as MilestoneState | undefined,
    })
  }

  for (const milestone of milestonesToUpdate) {
    const currentMilestone = currentByTitle.get(getMilestoneKey(milestone))
    if (currentMilestone != null) {
      core.info(`Updating milestone: ${milestone.title}`)
      await octokit.rest.issues.updateMilestone({
        owner,
        repo,
        milestone_number: currentMilestone.number,
        title: milestone.title,
        description: milestone.description,
        due_on: milestone.due_on,
        state: milestone.state as MilestoneState | undefined,
      })
    }
  }

  for (const milestone of remove) {
    if (hasMilestoneNumber(milestone)) {
      core.info(`Deleting milestone: ${milestone.title}`)
      await octokit.rest.issues.deleteMilestone({
        owner,
        repo,
        milestone_number: milestone.number,
      })
    }
  }
}
