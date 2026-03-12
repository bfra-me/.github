import type {Octokit} from '@octokit/rest'
import * as core from '@actions/core'
import {deepMerge} from '../diff.js'

interface BranchConfig {
  name: string
  protection: Record<string, unknown>
}

// Fields where GET returns {url?, enabled: bool} but PUT expects a plain boolean
const BOOLEAN_PROTECTION_FIELDS = [
  'enforce_admins',
  'required_linear_history',
  'allow_force_pushes',
  'allow_deletions',
  'block_creations',
  'required_conversation_resolution',
  'lock_branch',
  'allow_fork_syncing',
] as const

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
      currentProtection = sanitizeBranchProtection(
        response.data as unknown as Record<string, unknown>,
      )
    } catch (error: unknown) {
      if (isNotFoundError(error)) {
        core.info(`Branch ${branch} has no existing protection, creating from config`)
      } else {
        throw error
      }
    }

    const mergedProtection = cleanupMergedProtection(deepMerge(currentProtection, protection))

    await octokit.rest.repos.updateBranchProtection({
      owner,
      repo,
      branch,
      ...mergedProtection,
    } as Parameters<(typeof octokit.rest.repos)['updateBranchProtection']>[0])

    core.info(`Branch protection updated for: ${branch}`)
  }
}

/**
 * Transform the GET /branches/{branch}/protection response into a shape
 * compatible with PUT /branches/{branch}/protection. The GET response
 * includes extra fields (url, contexts_url) and uses object wrappers
 * ({enabled: bool}) where the PUT expects plain booleans.
 */
export function sanitizeBranchProtection(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const field of BOOLEAN_PROTECTION_FIELDS) {
    if (field in data) {
      result[field] = extractEnabled(data[field])
    }
  }

  if ('required_status_checks' in data) {
    result.required_status_checks = sanitizeStatusChecks(data.required_status_checks)
  }

  if ('required_pull_request_reviews' in data) {
    result.required_pull_request_reviews = stripUrlFields(data.required_pull_request_reviews)
  }

  if ('restrictions' in data) {
    result.restrictions = stripUrlFields(data.restrictions)
  }

  // required_signatures is a separate endpoint — never include in PUT
  return result
}

/**
 * After deep-merging config over sanitized GET, ensure the result
 * is valid for the PUT endpoint. Primarily resolves the
 * contexts/checks mutual exclusivity constraint.
 */
export function cleanupMergedProtection(data: Record<string, unknown>): Record<string, unknown> {
  const result = {...data}

  if (
    result.required_status_checks !== null &&
    typeof result.required_status_checks === 'object' &&
    !Array.isArray(result.required_status_checks)
  ) {
    const rsc = {...(result.required_status_checks as Record<string, unknown>)}
    delete rsc.url
    delete rsc.contexts_url

    // contexts and checks are mutually exclusive in the PUT endpoint
    if ('checks' in rsc && 'contexts' in rsc) {
      delete rsc.contexts
    }

    result.required_status_checks = rsc
  }

  return result
}

function extractEnabled(value: unknown): boolean | unknown {
  if (value !== null && typeof value === 'object' && 'enabled' in value) {
    return (value as {enabled: boolean}).enabled
  }
  return value
}

function sanitizeStatusChecks(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const rsc = value as Record<string, unknown>
  const sanitized: Record<string, unknown> = {}

  if ('strict' in rsc) {
    sanitized.strict = rsc.strict
  }

  // Prefer checks over contexts (contexts is deprecated)
  if (Array.isArray(rsc.checks)) {
    sanitized.checks = rsc.checks
  } else if (Array.isArray(rsc.contexts)) {
    sanitized.contexts = rsc.contexts
  }

  return sanitized
}

function stripUrlFields(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value === null ? null : (value as Record<string, unknown>)
  }
  const obj = value as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(obj)) {
    if (key !== 'url' && !key.endsWith('_url')) {
      result[key] = val
    }
  }
  return result
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
