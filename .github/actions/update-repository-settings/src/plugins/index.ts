import type {Octokit} from '@octokit/rest'
import type {SettingsConfig} from '../config.js'
import * as core from '@actions/core'
import {branchesPlugin} from './branches.js'
import {collaboratorsPlugin} from './collaborators.js'
import {environmentsPlugin} from './environments.js'
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
  const errors: Error[] = []

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
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      core.error(`Failed to apply ${key} settings: ${err.message}`)
      errors.push(err)
    }
  }

  if (errors.length > 0) {
    throw new Error(`Failed to apply settings:\n${errors.map(e => `  - ${e.message}`).join('\n')}`)
  }
}
