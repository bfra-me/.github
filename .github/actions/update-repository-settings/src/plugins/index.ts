import type {Octokit} from '@octokit/rest'
import type {SettingsConfig} from '../config.js'
import * as core from '@actions/core'

export type Plugin = (
  octokit: Octokit,
  owner: string,
  repo: string,
  config: unknown,
) => Promise<void>

async function repositoryPlugin(
  _octokit: Octokit,
  _owner: string,
  _repo: string,
  _config: unknown,
): Promise<void> {
  core.info('repository plugin: not yet implemented')
}

async function labelsPlugin(
  _octokit: Octokit,
  _owner: string,
  _repo: string,
  _config: unknown,
): Promise<void> {
  core.info('labels plugin: not yet implemented')
}

async function collaboratorsPlugin(
  _octokit: Octokit,
  _owner: string,
  _repo: string,
  _config: unknown,
): Promise<void> {
  core.info('collaborators plugin: not yet implemented')
}

async function teamsPlugin(
  _octokit: Octokit,
  _owner: string,
  _repo: string,
  _config: unknown,
): Promise<void> {
  core.info('teams plugin: not yet implemented')
}

async function milestonesPlugin(
  _octokit: Octokit,
  _owner: string,
  _repo: string,
  _config: unknown,
): Promise<void> {
  core.info('milestones plugin: not yet implemented')
}

async function branchesPlugin(
  _octokit: Octokit,
  _owner: string,
  _repo: string,
  _config: unknown,
): Promise<void> {
  core.info('branches plugin: not yet implemented')
}

async function environmentsPlugin(
  _octokit: Octokit,
  _owner: string,
  _repo: string,
  _config: unknown,
): Promise<void> {
  core.info('environments plugin: not yet implemented')
}

async function rulesetsPlugin(
  _octokit: Octokit,
  _owner: string,
  _repo: string,
  _config: unknown,
): Promise<void> {
  core.info('rulesets plugin: not yet implemented')
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
