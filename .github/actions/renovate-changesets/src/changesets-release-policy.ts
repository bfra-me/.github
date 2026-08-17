import type {WorkspacePackage} from './multi-package/types.js'
import {promises as fs} from 'node:fs'
import path from 'node:path'
import {minimatch} from 'minimatch'

export interface ChangesetsReleasePolicy {
  ignorePatterns: string[]
  allowPrivatePackages: boolean
}

const DEFAULT_POLICY: ChangesetsReleasePolicy = {
  ignorePatterns: [],
  allowPrivatePackages: true,
}

export async function readChangesetsReleasePolicy(
  workspaceRoot: string,
): Promise<ChangesetsReleasePolicy> {
  const configPath = path.join(workspaceRoot, '.changeset', 'config.json')
  let content: string

  try {
    content = await fs.readFile(configPath, 'utf8')
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') return {...DEFAULT_POLICY}
    throw error
  }

  let config: unknown
  try {
    config = JSON.parse(content)
  } catch {
    throw invalidPolicy('config.json is not valid JSON')
  }

  if (!isRecord(config)) throw invalidPolicy('configuration must be an object')

  const ignore = config.ignore
  if (
    ignore !== undefined &&
    (!Array.isArray(ignore) || !ignore.every(value => typeof value === 'string'))
  ) {
    throw invalidPolicy('ignore must be an array of strings')
  }

  const privatePackages = config.privatePackages
  if (
    privatePackages !== undefined &&
    privatePackages !== false &&
    (!isRecord(privatePackages) || Array.isArray(privatePackages))
  ) {
    throw invalidPolicy('privatePackages must be false or an object')
  }

  let allowPrivatePackages = true
  if (privatePackages === false) {
    allowPrivatePackages = false
  } else if (isRecord(privatePackages) && privatePackages.version !== undefined) {
    if (typeof privatePackages.version !== 'boolean') {
      throw invalidPolicy('privatePackages.version must be a boolean')
    }
    allowPrivatePackages = privatePackages.version
  }

  return {
    ignorePatterns: ignore === undefined ? [] : ignore,
    allowPrivatePackages,
  }
}

export function isPackageReleasable(
  pkg: WorkspacePackage,
  policy: ChangesetsReleasePolicy,
): boolean {
  if (pkg.version == null) return false
  if (policy.ignorePatterns.some(pattern => minimatch(pkg.name, pattern))) return false
  if (pkg.private && !policy.allowPrivatePackages) return false
  return true
}

function invalidPolicy(reason: string): Error {
  return new Error(`Invalid Changesets release policy at .changeset/config.json: ${reason}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
