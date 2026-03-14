import type {Octokit} from '@octokit/rest'
import * as core from '@actions/core'
import {diffCollections} from '../diff.js'

type CollaboratorPermission = 'pull' | 'push' | 'admin' | 'maintain' | 'triage'

interface CollaboratorConfig {
  username: string
  permission: string
}

interface CurrentCollaborator {
  username: string
  permission: string
}

function isCollaboratorConfig(value: unknown): value is CollaboratorConfig {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return (
    'username' in value &&
    typeof value.username === 'string' &&
    'permission' in value &&
    typeof value.permission === 'string'
  )
}

function isEmptyConfig(config: unknown[]): boolean {
  return config.length === 0
}

function getCollaboratorKey(collaborator: {username?: string; login?: string}): string {
  return (collaborator.username ?? collaborator.login ?? '').toLowerCase()
}

function toCurrentCollaborator(login: string, roleName?: string): CurrentCollaborator {
  return {
    username: login,
    permission: roleName ?? 'push',
  }
}

function collaboratorsDiffer(current: CurrentCollaborator, desired: CollaboratorConfig): boolean {
  return current.permission !== desired.permission
}

export async function collaboratorsPlugin(
  octokit: Octokit,
  owner: string,
  repo: string,
  config: unknown,
): Promise<void> {
  if (!Array.isArray(config)) {
    core.warning('collaborators config must be an array, skipping')
    return
  }

  if (isEmptyConfig(config)) {
    return
  }

  const allDesired = config.filter(isCollaboratorConfig)
  const ownerCollaborators = allDesired.filter(
    c => c.username.toLowerCase() === owner.toLowerCase(),
  )
  if (ownerCollaborators.length > 0) {
    core.warning(
      `Skipping collaborator '${owner}': repository owner cannot be added as a collaborator`,
    )
  }
  const desiredCollaborators = allDesired.filter(
    c => c.username.toLowerCase() !== owner.toLowerCase(),
  )

  const response = await octokit.rest.repos.listCollaborators({
    owner,
    repo,
    affiliation: 'direct',
    per_page: 100,
  })
  const currentCollaborators = response.data
    .filter(collaborator => collaborator.login.toLowerCase() !== owner.toLowerCase())
    .map(collaborator => toCurrentCollaborator(collaborator.login, collaborator.role_name))

  const {add, update, remove} = diffCollections(
    currentCollaborators,
    desiredCollaborators,
    getCollaboratorKey,
  )
  const currentByUsername = new Map(
    currentCollaborators.map(collaborator => [getCollaboratorKey(collaborator), collaborator]),
  )
  const collaboratorsToUpdate = update.filter(collaborator => {
    const currentCollaborator = currentByUsername.get(getCollaboratorKey(collaborator))
    return currentCollaborator != null && collaboratorsDiffer(currentCollaborator, collaborator)
  })

  for (const collaborator of add) {
    core.info(
      `Adding/updating collaborator: ${collaborator.username} with ${collaborator.permission}`,
    )
    await octokit.rest.repos.addCollaborator({
      owner,
      repo,
      username: collaborator.username,
      permission: collaborator.permission as CollaboratorPermission,
    })
  }

  for (const collaborator of collaboratorsToUpdate) {
    core.info(
      `Adding/updating collaborator: ${collaborator.username} with ${collaborator.permission}`,
    )
    await octokit.rest.repos.addCollaborator({
      owner,
      repo,
      username: collaborator.username,
      permission: collaborator.permission as CollaboratorPermission,
    })
  }

  for (const collaborator of remove) {
    core.info(`Removing collaborator: ${collaborator.username}`)
    await octokit.rest.repos.removeCollaborator({
      owner,
      repo,
      username: collaborator.username,
    })
  }
}
