import type {Octokit} from '@octokit/rest'
import {Buffer} from 'node:buffer'
import * as core from '@actions/core'
import * as yaml from 'js-yaml'
import {deepMerge} from './diff.js'

export interface SettingsConfig {
  repository?: Record<string, unknown>
  labels?: unknown[]
  collaborators?: unknown[]
  teams?: unknown[]
  milestones?: unknown[]
  branches?: unknown[]
  environments?: unknown[]
  rulesets?: unknown[]
}

type RawConfig = SettingsConfig & {_extends?: string}

interface ContentFile {
  content?: string
  encoding?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

interface NamedRecord {
  name: string
  [key: string]: unknown
}

function isNamedRecord(value: unknown): value is NamedRecord {
  return isRecord(value) && typeof value.name === 'string'
}

/** Warn once per duplicate key in a named-entry array. Resolution is unchanged. */
function warnDuplicateNames(
  entries: unknown[],
  keyFn: (name: string) => string,
  entityLabel: string,
  side: string,
): void {
  const seen = new Set<string>()
  const warned = new Set<string>()

  for (const entry of entries) {
    if (!isNamedRecord(entry)) {
      continue
    }

    const key = keyFn(entry.name)
    if (seen.has(key)) {
      if (!warned.has(key)) {
        core.warning(
          `Duplicate ${entityLabel} name "${entry.name}" in ${side}: only one definition will be used.`,
        )
        warned.add(key)
      }
      continue
    }

    seen.add(key)
  }
}

/**
 * Merge an array of `{name: string, ...}` entries by key. Base order is
 * preserved; a child entry whose key matches a base entry is combined via
 * `mergeEntry` at the base's position. Child-only entries are appended in
 * child order. Entries that aren't objects with a string `name` pass
 * through unchanged (and are never matched against anything).
 */
function mergeNamedArray(
  base: unknown[],
  override: unknown[],
  keyFn: (name: string) => string,
  mergeEntry: (baseEntry: NamedRecord, overrideEntry: NamedRecord) => NamedRecord,
  entityLabel: string,
): unknown[] {
  warnDuplicateNames(base, keyFn, entityLabel, 'the base (_extends) config')
  warnDuplicateNames(override, keyFn, entityLabel, 'the local config')

  const overrideByKey = new Map<string, NamedRecord>()
  for (const entry of override) {
    if (isNamedRecord(entry)) {
      overrideByKey.set(keyFn(entry.name), entry)
    }
  }

  const usedKeys = new Set<string>()
  const merged = base.map(entry => {
    if (!isNamedRecord(entry)) {
      return entry
    }

    const key = keyFn(entry.name)
    const replacement = overrideByKey.get(key)
    if (replacement === undefined) {
      return entry
    }

    usedKeys.add(key)
    return mergeEntry(entry, replacement)
  })

  for (const entry of override) {
    if (!isNamedRecord(entry)) {
      merged.push(entry)
      continue
    }

    const key = keyFn(entry.name)
    if (!usedKeys.has(key)) {
      merged.push(entry)
      usedKeys.add(key)
    }
  }

  return merged
}

/**
 * Merge `labels` arrays by `name` (case-insensitive, matching the
 * case-insensitive comparison the labels plugin already does against live
 * GitHub labels). A child entry with the same key replaces the base entry
 * wholesale (no field-level merge).
 */
function mergeLabels(base: unknown[], override: unknown[]): unknown[] {
  return mergeNamedArray(
    base,
    override,
    name => name.toLowerCase(),
    (_baseEntry, overrideEntry) => overrideEntry,
    'label',
  )
}

/** `checks` and `contexts` are alternatives: keep only the one the override declares. */
function resolveMergedStatusCheckAlternative(
  merged: NamedRecord,
  overrideEntry: NamedRecord,
): void {
  const mergedProtection = merged.protection
  const overrideProtection = overrideEntry.protection
  if (!isRecord(mergedProtection) || !isRecord(overrideProtection)) {
    return
  }

  const mergedRsc = mergedProtection.required_status_checks
  const overrideRsc = overrideProtection.required_status_checks
  if (!isRecord(mergedRsc) || !isRecord(overrideRsc)) {
    return
  }

  if ('contexts' in overrideRsc && !('checks' in overrideRsc)) {
    delete mergedRsc.checks
  } else if ('checks' in overrideRsc && !('contexts' in overrideRsc)) {
    delete mergedRsc.contexts
  }
}

/**
 * Merge `branches` arrays by `name` (exact match — branch names are
 * case-sensitive). A child entry with the same key is deep-merged onto the
 * base entry via `deepMerge`, so e.g. a child that only declares
 * `protection.required_status_checks` still keeps the base's other
 * `protection` fields (like `enforce_admins`); an explicit `null` in the
 * child wins outright, and nested arrays (like `checks`) are replaced, not
 * unioned.
 */
function mergeBranches(base: unknown[], override: unknown[]): unknown[] {
  return mergeNamedArray(
    base,
    override,
    name => name,
    (baseEntry, overrideEntry) => {
      const merged = deepMerge(baseEntry, overrideEntry) as NamedRecord
      resolveMergedStatusCheckAlternative(merged, overrideEntry)
      return merged
    },
    'branch',
  )
}

/** Merge an `_extends` base with the local config. Only top-level `labels`/`branches` merge by name. */
function mergeConfigs(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const merged = deepMerge(base, override)

  if (Array.isArray(base.labels) && Array.isArray(override.labels)) {
    merged.labels = mergeLabels(base.labels, override.labels)
  }

  if (Array.isArray(base.branches) && Array.isArray(override.branches)) {
    merged.branches = mergeBranches(base.branches, override.branches)
  }

  return merged
}

function decodeContent(payload: unknown, path: string): string {
  if (!isRecord(payload) || typeof payload.content !== 'string') {
    throw new Error(`Expected file content for ${path}`)
  }

  const encoding = typeof payload.encoding === 'string' ? payload.encoding : 'base64'
  if (encoding !== 'base64') {
    throw new Error(`Unsupported content encoding for ${path}: ${encoding}`)
  }

  return Buffer.from(payload.content, 'base64').toString('utf8')
}

function parseYamlConfig(content: string, source: string): RawConfig {
  try {
    const parsed = yaml.load(content)
    if (!isRecord(parsed)) {
      throw new Error('YAML root must be an object')
    }
    return parsed as RawConfig
  } catch (error) {
    throw new Error(
      `Failed to parse ${source}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function withoutExtends(config: RawConfig): Record<string, unknown> {
  const {_extends, ...rest} = config
  return rest
}

function parseExtendsTarget(
  extendsValue: string,
  currentOwner: string,
  currentRepo: string,
): {owner: string; repo: string; path: string} {
  const match = /^(?:([^/]+)\/([^:]+)|([^:]+))?:(.+)$/.exec(extendsValue)
  if (match) {
    const org = match[1]
    const repo = match[2] ?? match[3]
    const path = match[4]

    if (typeof path !== 'string' || path.length === 0) {
      throw new Error(`Invalid _extends value: ${extendsValue}`)
    }

    if (org != null && repo != null) {
      return {owner: org, repo, path}
    }

    if (repo != null) {
      return {owner: currentOwner, repo, path}
    }

    return {owner: currentOwner, repo: '.github', path}
  }

  if (extendsValue.includes(':')) {
    throw new Error(`Invalid _extends value: ${extendsValue}`)
  }

  return {owner: currentOwner, repo: currentRepo, path: extendsValue}
}

async function loadRemoteConfig(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
): Promise<RawConfig> {
  const response = await octokit.rest.repos.getContent({owner, repo, path})
  const content = decodeContent(response.data as ContentFile, path)
  return parseYamlConfig(content, `_extends config YAML from ${owner}/${repo}:${path}`)
}

export async function loadConfig(
  octokit: Octokit,
  owner: string,
  repo: string,
  configPath: string,
): Promise<SettingsConfig> {
  let local: RawConfig

  try {
    const response = await octokit.rest.repos.getContent({owner, repo, path: configPath})
    const content = decodeContent(response.data as ContentFile, configPath)
    local = parseYamlConfig(content, `local config YAML from ${configPath}`)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Failed to parse local config YAML')) {
      throw error
    }
    throw new Error(`Failed to load local config from ${configPath}: ${String(error)}`)
  }

  const extendsValue = local._extends
  if (typeof extendsValue !== 'string' || extendsValue.length === 0) {
    return withoutExtends(local) as SettingsConfig
  }

  const localWithoutExtends = withoutExtends(local)

  try {
    const target = parseExtendsTarget(extendsValue, owner, repo)
    const base = await loadRemoteConfig(octokit, target.owner, target.repo, target.path)
    const baseWithoutExtends = withoutExtends(base)

    return mergeConfigs(baseWithoutExtends, localWithoutExtends) as SettingsConfig
  } catch (error) {
    core.warning(`Failed to load _extends config: ${String(error)}`)
    return localWithoutExtends
  }
}
