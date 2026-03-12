import * as core from '@actions/core'

export function normalizeCommaDelimited(value: unknown): string[] {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') {
    if (value.trim().length === 0) return []
    return value
      .split(/\s*,\s*/)
      .map(s => s.trim())
      .filter(s => s.length > 0)
  }
  core.warning(`Expected string or array for comma-delimited field, got ${typeof value}`)
  return []
}

export function normalizeColor(color: unknown): string | undefined {
  if (color === undefined || color === null) return undefined
  if (typeof color !== 'string') {
    core.warning(`Expected string for color, got ${typeof color}`)
    return undefined
  }
  const stripped = color.startsWith('#') ? color.slice(1) : color
  const lowered = stripped.toLowerCase()
  return lowered.padStart(6, '0')
}
