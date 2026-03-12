import type {Octokit} from '@octokit/rest'
import * as core from '@actions/core'
import {diffCollections} from '../diff.js'

interface EnvironmentConfig {
  name: string
  [key: string]: unknown
}

interface CurrentEnvironment {
  name: string
}

function getEnvironmentKey(environment: {name: string}): string {
  return environment.name.toLowerCase()
}

export async function environmentsPlugin(
  octokit: Octokit,
  owner: string,
  repo: string,
  config: unknown,
): Promise<void> {
  if (!Array.isArray(config)) {
    core.warning('environments config must be an array, skipping')
    return
  }

  if (config.length === 0) {
    return
  }

  const response = await octokit.rest.repos.getAllEnvironments({owner, repo})
  const currentEnvironments: CurrentEnvironment[] = (response.data.environments ?? []).map(
    environment => ({
      name: environment.name,
    }),
  )
  const desiredEnvironments = config.filter(isEnvironmentConfig)
  const desiredEnvironmentsByName = new Map(
    desiredEnvironments.map(environment => [getEnvironmentKey(environment), environment]),
  )
  const {add, update, remove} = diffCollections(
    currentEnvironments.map(environment => ({name: environment.name})),
    desiredEnvironments.map(environment => ({name: environment.name})),
    getEnvironmentKey,
  )

  for (const environment of [...update, ...add]) {
    const desiredEnvironment = desiredEnvironmentsByName.get(getEnvironmentKey(environment))

    if (desiredEnvironment == null) {
      continue
    }

    core.info(`Creating/updating environment: ${desiredEnvironment.name}`)
    const {name, ...rest} = desiredEnvironment

    await octokit.rest.repos.createOrUpdateEnvironment({
      owner,
      repo,
      environment_name: name,
      ...rest,
    })
  }

  for (const environment of remove) {
    core.info(`Deleting environment: ${environment.name}`)
    await octokit.rest.repos.deleteAnEnvironment({
      owner,
      repo,
      environment_name: environment.name,
    })
  }
}

function isEnvironmentConfig(value: unknown): value is EnvironmentConfig {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return 'name' in value && typeof value.name === 'string'
}
