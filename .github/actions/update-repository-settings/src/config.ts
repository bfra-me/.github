import type {Octokit} from '@octokit/rest'
import {Buffer} from 'node:buffer'
import * as core from '@actions/core'
import * as yaml from 'js-yaml'

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

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {...base}
  for (const key of Object.keys(override)) {
    const overrideVal = override[key]
    const baseVal = base[key]

    if (
      overrideVal !== null &&
      typeof overrideVal === 'object' &&
      !Array.isArray(overrideVal) &&
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>,
      )
      continue
    }

    result[key] = overrideVal
  }
  return result
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

    return deepMerge(baseWithoutExtends, localWithoutExtends) as SettingsConfig
  } catch (error) {
    core.warning(`Failed to load _extends config: ${String(error)}`)
    return localWithoutExtends
  }
}
