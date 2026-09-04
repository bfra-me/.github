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
