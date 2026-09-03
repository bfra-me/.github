import type {Octokit} from '@octokit/rest'
import type {SettingsConfig} from '../config.js'
import * as core from '@actions/core'
import {branchesPlugin} from './branches.js'
import {collaboratorsPlugin} from './collaborators.js'
import {environmentsPlugin} from './environments.js'
import {describeError} from './error-detail.js'
import {labelsPlugin} from './labels.js'
import {milestonesPlugin} from './milestones.js'
import {repositoryPlugin} from './repository.js'
import {rulesetsPlugin} from './rulesets.js'
import {teamsPlugin} from './teams.js'

export type Plugin = (
  octokit: Octokit,
  owner: string,
  repo: string,
  config: unknown,
) => Promise<void>

export {
  branchesPlugin,
  collaboratorsPlugin,
  environmentsPlugin,
  labelsPlugin,
  milestonesPlugin,
  repositoryPlugin,
  rulesetsPlugin,
  teamsPlugin,
}

export const PLUGIN_REGISTRY: Record<string, Plugin> = {
  repository: repositoryPlugin,
  labels: labelsPlugin,
  collaborators: collaboratorsPlugin,
  teams: teamsPlugin,
  milestones: milestonesPlugin,
  branches: branchesPlugin,
  environments: environmentsPlugin,
  rulesets: rulesetsPlugin,
}

export async function applySettings(
  octokit: Octokit,
  owner: string,
  repo: string,
  config: SettingsConfig,
): Promise<void> {
  const applied: string[] = []
  const failed: {key: string; detail: string}[] = []

  for (const [key, value] of Object.entries(config)) {
    const plugin = PLUGIN_REGISTRY[key]
    if (plugin === undefined) {
      core.info(`Unknown settings key: ${key}, skipping`)
      continue
    }

    core.info(`Applying ${key} settings...`)
    try {
      await plugin(octokit, owner, repo, value)
      core.info(`${key} settings applied`)
      applied.push(key)
    } catch (error) {
      const detail = describeError(error)
      core.error(`Failed to apply ${key} settings: ${detail}`)
      failed.push({key, detail})
    }
  }

  if (failed.length > 0) {
    const appliedLine = applied.length > 0 ? `Applied: ${applied.join(', ')}\n` : ''
    const failedLines = failed.map(({key, detail}) => `  - ${key}: ${detail}`).join('\n')
    throw new Error(`Failed to apply settings:\n${appliedLine}Failed:\n${failedLines}`)
  }
}
