/**
 * Diagnostic extraction for errors thrown while applying settings.
 *
 * GitHub's REST API can return a 500 with an empty response body, which produces
 * an empty `error.message` on the resulting `RequestError`. Collapsing that to
 * `err.message` (the prior behavior) renders as an empty bullet in the aggregate
 * failure, so an operator learns nothing about which request failed or why.
 *
 * `describeError` extracts everything diagnostically useful from an unknown
 * thrown value — HTTP status, the GitHub request ID, and a redacted,
 * length-bounded response body — while guaranteeing that principal-identifying
 * fields (team/app slugs and IDs, user logins, bypass allowances, dismissal
 * restrictions) never reach the returned string. Structured bodies are redacted
 * before truncation so a length bound can never expose a field the denylist
 * would have removed. Genuinely non-JSON string bodies have no keys to redact,
 * so they are truncated verbatim.
 */

/**
 * Maximum characters of a JSON response body included in a diagnostic string.
 * GitHub error bodies are typically well under 1KB, but validation-error bodies
 * can carry an `errors` array with multiple entries. 2000 characters keeps a
 * realistic error body fully readable without letting a pathological body flood
 * the aggregate error or the action log.
 */
const MAX_BODY_LENGTH = 2000

const TRUNCATION_SUFFIX = '... [truncated]'

/**
 * Response headers surfaced in diagnostics. An allowlist, not a denylist —
 * every other header (including `authorization`) is dropped, never merely
 * hidden. Serializing `error.response.headers` wholesale would turn a
 * diagnostic into a header dump.
 */
const ALLOWED_RESPONSE_HEADERS = ['x-github-request-id'] as const

const REDACTED = '[REDACTED]'

/**
 * Keys whose entire value is stripped, wherever they appear in the body, at
 * any nesting depth. This covers the plan's named never-log set:
 * - `slug` — team and app slugs (GitHub principal objects use this field name)
 * - `login` — user logins
 * - `id` — app and other principal IDs
 * - `bypass_pull_request_allowances` — bypass allowance lists, wholesale
 * - `dismissal_restrictions` — dismissal restriction lists, wholesale
 */
const DENYLISTED_KEYS = new Set([
  'slug',
  'login',
  'id',
  'bypass_pull_request_allowances',
  'dismissal_restrictions',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Recursively redact denylisted keys from an arbitrary JSON-like value.
 * Walks both objects and arrays so a denylisted key nested inside an array
 * (e.g. `restrictions.teams[]`) is removed, not missed by a shallow walk.
 * Returns a new value; the input is never mutated.
 *
 * Exported so other modules that log request/response payloads (e.g.
 * `branches.ts` logging the merged branch-protection payload before a PUT)
 * reuse this single denylist instead of maintaining a second one that could
 * drift out of sync.
 */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => redact(item))
  }

  if (isRecord(value)) {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      result[key] = DENYLISTED_KEYS.has(key) ? REDACTED : redact(val)
    }
    return result
  }

  return value
}

function safeStringify(value: unknown): string {
  try {
    const json = JSON.stringify(value)
    return json ?? String(value)
  } catch {
    return String(value)
  }
}

function truncate(text: string): string {
  if (text.length <= MAX_BODY_LENGTH) {
    return text
  }
  return `${text.slice(0, MAX_BODY_LENGTH)}${TRUNCATION_SUFFIX}`
}

/**
 * Format a response body for inclusion in a diagnostic string. JSON-shaped
 * strings are parsed and redacted before truncation so a denylisted value
 * beyond the length bound is still removed rather than merely cut off.
 * Genuinely non-JSON strings have no keys to redact, so they are truncated
 * verbatim. Returns `undefined` for a body that carries no information
 * (missing, blank, or an empty object) so the caller never renders a hollow
 * `body: ` segment.
 */
function formatBody(data: unknown): string | undefined {
  if (data === undefined || data === null) {
    return undefined
  }

  if (typeof data === 'string') {
    if (data.trim().length === 0) {
      return undefined
    }

    try {
      const parsed: unknown = JSON.parse(data)
      if (Array.isArray(parsed) || isRecord(parsed)) {
        if (isRecord(parsed) && Object.keys(parsed).length === 0) {
          return undefined
        }
        return truncate(safeStringify(redact(parsed)))
      }
    } catch {
      // Genuinely non-JSON strings have no keys to redact.
    }

    return truncate(data)
  }

  if (isRecord(data) && Object.keys(data).length === 0) {
    return undefined
  }

  return truncate(safeStringify(redact(data)))
}

/**
 * Extract the GitHub request ID from response headers, surfacing only the
 * allowlisted header name.
 */
function extractRequestId(response: Record<string, unknown> | undefined): string | undefined {
  const headers =
    response !== undefined && isRecord(response.headers) ? response.headers : undefined
  if (headers === undefined) {
    return undefined
  }

  for (const name of ALLOWED_RESPONSE_HEADERS) {
    const value = headers[name]
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }

  return undefined
}

/**
 * Produce a diagnostic string for an unknown thrown value. Degrades cleanly:
 * - A `RequestError`-shaped value yields status, request ID, and body context.
 * - A plain `Error` with a message and no response yields the message.
 * - A non-`Error` throw yields a usable string, never `[object Object]`.
 */
export function describeError(error: unknown): string {
  if (typeof error === 'string') {
    return error
  }

  if (!isRecord(error)) {
    return safeStringify(error)
  }

  const status = typeof error.status === 'number' ? error.status : undefined
  const response = isRecord(error.response) ? error.response : undefined
  const requestId = extractRequestId(response)
  const bodyText = response === undefined ? undefined : formatBody(response.data)

  const contextParts: string[] = []
  if (status !== undefined) {
    contextParts.push(`status ${status}`)
  }
  if (requestId !== undefined) {
    contextParts.push(`request ID ${requestId}`)
  }
  if (bodyText !== undefined) {
    contextParts.push(`body: ${bodyText}`)
  }

  const message =
    typeof error.message === 'string' && error.message.trim().length > 0 ? error.message : undefined

  if (contextParts.length === 0) {
    if (message !== undefined) {
      return message
    }
    if (error instanceof Error) {
      return error.name
    }
    return safeStringify(error)
  }

  return message === undefined ? contextParts.join('; ') : `${message} (${contextParts.join('; ')})`
}
