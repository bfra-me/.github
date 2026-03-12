import type {Octokit} from '@octokit/rest'
import * as core from '@actions/core'
import {deepMerge} from '../diff.js'

interface BranchConfig {
  name: string
  protection: Record<string, unknown>
}

export async function branchesPlugin(
  octokit: Octokit,
  owner: string,
  repo: string,
  config: unknown,
): Promise<void> {
  if (!Array.isArray(config)) {
    core.warning('branches config must be an array, skipping')
    return
  }

  for (const entry of config) {
    if (!isBranchConfig(entry)) {
      core.warning('Invalid branch config entry, skipping')
      continue
    }

    const {name: branch, protection} = entry
    core.info(`Updating branch protection for: ${branch}`)

    let currentProtection: Record<string, unknown> = {}
    try {
      const response = await octokit.rest.repos.getBranchProtection({owner, repo, branch})
      currentProtection = response.data as unknown as Record<string, unknown>
    } catch (error: unknown) {
      if (isNotFoundError(error)) {
        core.info(`Branch ${branch} has no existing protection, creating from config`)
      } else {
        throw error
      }
    }

    const mergedProtection = deepMerge(currentProtection, protection)

    await octokit.rest.repos.updateBranchProtection({
      owner,
      repo,
      branch,
      ...mergedProtection,
    } as Parameters<(typeof octokit.rest.repos)['updateBranchProtection']>[0])

    core.info(`Branch protection updated for: ${branch}`)
  }
}

function isBranchConfig(value: unknown): value is BranchConfig {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return (
    'name' in value &&
    typeof value.name === 'string' &&
    'protection' in value &&
    value.protection !== null &&
    typeof value.protection === 'object' &&
    !Array.isArray(value.protection)
  )
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number' &&
    error.status === 404
  )
}
