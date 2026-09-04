import type {Octokit} from '@octokit/rest'
import * as core from '@actions/core'
import {deepMerge} from '../diff.js'
import {compareBranchProtection} from './branch-protection-equivalence.js'
import {redact} from './error-detail.js'

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

  const {data: repoData} = await octokit.rest.repos.get({owner, repo})
  const isOrganization = repoData.owner.type === 'Organization'

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

    const merged = deepMerge(currentProtection, protection)
    resolveStatusCheckConflict(merged, protection)
    const mergedProtection = cleanupMergedProtection(merged, isOrganization)

    // Scrubbed once per branch, before the request — not per retry attempt (retry lives in the
    // Octokit client, invisible here). The merged payload combines declared config with current
    // state read from the API, so it can carry team slugs and app bypass entries the published
    // config does not; `redact` strips those before this ever reaches log storage.
    core.debug(
      `Branch protection payload for ${branch}: ${JSON.stringify(redact(mergedProtection))}`,
    )

    await octokit.rest.repos.updateBranchProtection({
      owner,
      repo,
      branch,
      ...mergedProtection,
    } as Parameters<(typeof octokit.rest.repos)['updateBranchProtection']>[0])

    core.info(`Branch protection updated for: ${branch}`)

    await verifyBranchProtection(octokit, owner, repo, branch, protection)
  }
}

/**
 * Read back the branch protection that was just written and compare it
 * against the declared config using {@link compareBranchProtection}.
 *
 * Only called after `updateBranchProtection` has already succeeded — a
 * failed update runs no read-back at all, since a GET against state that
 * was never written would produce a misleading comparison. `declaredProtection`
 * is the branch's raw declared config from the settings file, not the merged
 * payload the write path built; comparing against the merged payload would
 * compare the action against itself.
 *
 * This entire operation is verification, not enforcement: a failed read-back
 * GET, or a throw from the comparison, is caught here, logged as a warning,
 * and never propagates. An observer that fails runs which actually applied
 * their settings is worse than no observer.
 */
async function verifyBranchProtection(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  declaredProtection: Record<string, unknown>,
): Promise<void> {
  try {
    const response = await octokit.rest.repos.getBranchProtection({owner, repo, branch})
    const observedRaw = response.data as unknown as Record<string, unknown>
    const {equivalent, divergentFields} = compareBranchProtection(declaredProtection, observedRaw)

    if (!equivalent) {
      core.warning(
        `Branch protection for '${branch}' diverges from declared config: ${divergentFields.join(', ')}`,
      )

      await core.summary
        .addTable([
          [
            {data: 'Branch', header: true},
            {data: 'Divergent Fields', header: true},
          ],
          [branch, divergentFields.join(', ')],
        ])
        .write()
    }
  } catch (error: unknown) {
    core.warning(
      `Failed to verify branch protection for '${branch}': ${error instanceof Error ? error.message : String(error)}`,
    )
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
 * contexts/checks mutual exclusivity constraint and strips
 * org-only fields (users/teams) for user-owned repositories.
 */
export function cleanupMergedProtection(
  data: Record<string, unknown>,
  isOrganization = true,
): Record<string, unknown> {
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

  if (!isOrganization) {
    // GitHub API rejects restrictions entirely for user-owned repos (must be null)
    result.restrictions = null

    if (
      result.required_pull_request_reviews !== null &&
      typeof result.required_pull_request_reviews === 'object' &&
      !Array.isArray(result.required_pull_request_reviews)
    ) {
      const rprr = {...(result.required_pull_request_reviews as Record<string, unknown>)}
      // GitHub docs: "Omit this parameter for personal repositories"
      delete rprr.dismissal_restrictions
      rprr.bypass_pull_request_allowances = stripOrgOnlyFields(rprr.bypass_pull_request_allowances)
      result.required_pull_request_reviews = rprr
    }
  }

  return result
}

/**
 * `checks` and `contexts` are mutually exclusive in the PUT endpoint.
 * After deep-merging the GET response with the config, both may be present
 * because the GET response includes `checks` while the config specifies
 * `contexts` (or vice versa). Remove whichever field the config does NOT
 * specify so the user's intent is preserved.
 */
function resolveStatusCheckConflict(
  merged: Record<string, unknown>,
  config: Record<string, unknown>,
): void {
  const mergedRsc = merged.required_status_checks
  const configRsc = config.required_status_checks
  if (
    mergedRsc == null ||
    typeof mergedRsc !== 'object' ||
    Array.isArray(mergedRsc) ||
    configRsc == null ||
    typeof configRsc !== 'object' ||
    Array.isArray(configRsc)
  ) {
    return
  }

  const m = mergedRsc as Record<string, unknown>
  const c = configRsc as Record<string, unknown>

  if ('contexts' in c && 'checks' in m) {
    delete m.checks
  } else if ('checks' in c && 'contexts' in m) {
    delete m.contexts
  }
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

/**
 * Remove the `users` and `teams` fields from an object.
 * These fields are only valid for organization repositories.
 */
function stripOrgOnlyFields(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return value
  }
  const obj = {...(value as Record<string, unknown>)}
  delete obj.users
  delete obj.teams
  return obj
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
