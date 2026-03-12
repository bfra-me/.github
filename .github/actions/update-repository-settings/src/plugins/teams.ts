import type {Octokit} from '@octokit/rest'
import * as core from '@actions/core'
import {diffCollections} from '../diff.js'

type TeamPermission = 'pull' | 'push' | 'admin' | 'maintain' | 'triage'

interface TeamConfig {
  name: string
  permission: string
}

interface CurrentTeam {
  name: string
  permission: string
}

function isTeamConfig(value: unknown): value is TeamConfig {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return (
    'name' in value &&
    typeof value.name === 'string' &&
    'permission' in value &&
    typeof value.permission === 'string'
  )
}

function isEmptyConfig(config: unknown[]): boolean {
  return config.length === 0
}

function getTeamKey(team: {name: string}): string {
  return team.name.toLowerCase()
}

function teamsDiffer(current: CurrentTeam, desired: TeamConfig): boolean {
  return current.permission !== desired.permission
}

export async function teamsPlugin(
  octokit: Octokit,
  owner: string,
  repo: string,
  config: unknown,
): Promise<void> {
  if (!Array.isArray(config)) {
    core.warning('teams config must be an array, skipping')
    return
  }

  if (isEmptyConfig(config)) {
    return
  }

  const desiredTeams = config.filter(isTeamConfig)
  const response = await octokit.rest.repos.listTeams({owner, repo, per_page: 100})
  const currentTeams = response.data.map(team => ({
    name: team.slug,
    permission: team.permission ?? 'pull',
  }))

  const {add, update, remove} = diffCollections(currentTeams, desiredTeams, getTeamKey)
  const currentByName = new Map(currentTeams.map(team => [getTeamKey(team), team]))
  const teamsToUpdate = update.filter(team => {
    const currentTeam = currentByName.get(getTeamKey(team))
    return currentTeam != null && teamsDiffer(currentTeam, team)
  })

  for (const team of add) {
    core.info(`Adding/updating team: ${team.name} with ${team.permission}`)
    await octokit.rest.teams.addOrUpdateRepoPermissionsInOrg({
      org: owner,
      team_slug: team.name,
      owner,
      repo,
      permission: team.permission as TeamPermission,
    })
  }

  for (const team of teamsToUpdate) {
    core.info(`Adding/updating team: ${team.name} with ${team.permission}`)
    await octokit.rest.teams.addOrUpdateRepoPermissionsInOrg({
      org: owner,
      team_slug: team.name,
      owner,
      repo,
      permission: team.permission as TeamPermission,
    })
  }

  for (const team of remove) {
    core.info(`Removing team: ${team.name}`)
    await octokit.rest.teams.removeRepoInOrg({
      org: owner,
      team_slug: team.name,
      owner,
      repo,
    })
  }
}
