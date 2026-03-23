import type {Octokit} from '@octokit/rest'
import type {RenovateManagerType, RenovateUpdateType} from './renovate-parser.js'
import path from 'node:path'

export interface GoModule {
  path: string
  version?: string
  indirect?: boolean
  replace?: {
    old: string
    new: string
    version?: string
  }
}

export interface GoModFile {
  module?: string
  go?: string
  require?: GoModule[]
  exclude?: GoModule[]
  replace?: GoModule[]
  retract?: GoModule[]
}

export interface GoModDependencyChange {
  name: string
  modFile: string
  currentVersion?: string
  newVersion?: string
  manager: RenovateManagerType
  updateType: RenovateUpdateType
  semverImpact: 'major' | 'minor' | 'patch' | 'prerelease' | 'none'
  isSecurityUpdate: boolean
  isIndirect: boolean
  isReplace: boolean
  scope?: string
  line?: number
}

export async function detectGoChangesFromPR(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  files: {filename: string; status: string; additions: number; deletions: number}[],
): Promise<GoModDependencyChange[]> {
  const changes: GoModDependencyChange[] = []
  const goFiles = files.filter(file => isGoModFile(file.filename))

  if (goFiles.length === 0) {
    return changes
  }

  for (const file of goFiles) {
    try {
      const fileChanges = await analyzeGoModFile(octokit, owner, repo, prNumber, file.filename)
      changes.push(...fileChanges)
    } catch (error) {
      console.warn(`Failed to analyze Go mod file ${file.filename}: ${error}`)
    }
  }

  return deduplicateChanges(changes)
}

function isGoModFile(filename: string): boolean {
  return path.basename(filename) === 'go.mod' || path.basename(filename) === 'go.sum'
}

async function analyzeGoModFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  filename: string,
): Promise<GoModDependencyChange[]> {
  const changes: GoModDependencyChange[] = []

  try {
    const {data: comparison} = await octokit.rest.repos.compareCommits({
      owner,
      repo,
      base: `refs/pull/${prNumber}/base`,
      head: `refs/pull/${prNumber}/head`,
    })

    const fileData = comparison.files?.find(f => f.filename === filename)
    if (!fileData || !fileData.patch) {
      return changes
    }

    if (filename.endsWith('go.mod')) {
      changes.push(...parseGoModChanges(filename, fileData.patch))
    } else if (filename.endsWith('go.sum')) {
      changes.push(...parseGoSumChanges(filename, fileData.patch))
    }

    return changes
  } catch (error) {
    console.warn(`Error analyzing Go mod file ${filename}: ${error}`)
    return changes
  }
}

function parseGoModChanges(filename: string, patch: string): GoModDependencyChange[] {
  const changes: GoModDependencyChange[] = []
  const lines = patch.split('\n')

  let lineNumber = 0
  for (const [index, line] of lines.entries()) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (match?.[1]) {
        lineNumber = Number.parseInt(match[1], 10) - 1
      }
      continue
    }

    lineNumber++

    if (line.startsWith('-') && !line.startsWith('---')) {
      const oldMod = parseGoModLine(line.slice(1).trim())
      if (oldMod) {
        const addedLineIndex = lines.findIndex(
          (candidate, candidateIndex) =>
            candidateIndex > index &&
            candidate.startsWith('+') &&
            !candidate.startsWith('+++') &&
            parseGoModLine(candidate.slice(1).trim())?.path === oldMod.path,
        )

        if (addedLineIndex !== -1) {
          const newMod = parseGoModLine(lines[addedLineIndex]?.slice(1).trim() || '')
          if (newMod && oldMod.version !== newMod.version) {
            changes.push(createGoModChange(filename, oldMod, newMod, lineNumber))
          }
        }
      }
    }
  }

  return changes
}

function parseGoSumChanges(filename: string, patch: string): GoModDependencyChange[] {
  const changes: GoModDependencyChange[] = []
  const lines = patch.split('\n')

  let lineNumber = 0
  for (const line of lines) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (match?.[1]) {
        lineNumber = Number.parseInt(match[1], 10) - 1
      }
      continue
    }

    lineNumber++

    if (line.startsWith('+') && !line.startsWith('+++')) {
      const sumEntry = parseGoSumLine(line.slice(1).trim())
      if (sumEntry) {
        changes.push(createGoSumChange(filename, sumEntry, lineNumber))
      }
    }
  }

  return changes
}

function parseGoModLine(line: string): GoModule | null {
  const trimmed = line.trim()
  if (
    !trimmed ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('module ') ||
    trimmed.startsWith('go ')
  ) {
    return null
  }

  const requireMatch = trimmed.match(/^(?:require\s+)?(\S+)\s+(\S+)/)
  if (requireMatch) {
    const [, modulePath, version] = requireMatch
    const indirect = trimmed.includes('// indirect')
    if (modulePath && version) {
      return {
        path: modulePath.trim(),
        version: version.trim(),
        indirect,
      }
    }
  }

  return null
}

function parseGoSumLine(line: string): {path: string; version: string; hash: string} | null {
  const trimmed = line.trim()
  if (!trimmed) {
    return null
  }

  const match = trimmed.match(/^(\S+)\s+(\S+)\s+(\S+)$/)
  if (match) {
    const [, modulePath, version, hash] = match
    if (modulePath && version && hash) {
      return {
        path: modulePath.trim(),
        version: version.trim(),
        hash: hash.trim(),
      }
    }
  }

  return null
}

function createGoModChange(
  filename: string,
  oldMod: GoModule,
  newMod: GoModule,
  lineNumber: number,
): GoModDependencyChange {
  return {
    name: newMod.path,
    modFile: filename,
    currentVersion: oldMod.version,
    newVersion: newMod.version,
    manager: 'go',
    updateType: determineUpdateType(oldMod.version, newMod.version),
    semverImpact: calculateSemverImpact(oldMod.version, newMod.version),
    isSecurityUpdate: isSecurityUpdate(),
    isIndirect: newMod.indirect || false,
    isReplace: Boolean(newMod.replace),
    line: lineNumber,
  }
}

function createGoSumChange(
  filename: string,
  sumEntry: {path: string; version: string; hash: string},
  lineNumber: number,
): GoModDependencyChange {
  return {
    name: sumEntry.path,
    modFile: filename,
    newVersion: sumEntry.version,
    manager: 'go',
    updateType: 'patch',
    semverImpact: 'patch',
    isSecurityUpdate: false,
    isIndirect: false,
    isReplace: false,
    line: lineNumber,
  }
}

function determineUpdateType(currentVersion?: string, newVersion?: string): RenovateUpdateType {
  if (!currentVersion || !newVersion) return 'patch'

  const currentParts = parseGoVersion(currentVersion)
  const newParts = parseGoVersion(newVersion)

  if (currentParts.major !== newParts.major) return 'major'
  if (currentParts.minor !== newParts.minor) return 'minor'
  if (currentParts.patch !== newParts.patch) return 'patch'

  return 'patch'
}

function parseGoVersion(version: string): {
  major: number
  minor: number
  patch: number
  prerelease?: string
} {
  const cleanVersion = version.startsWith('v') ? version.slice(1) : version
  const match = cleanVersion.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/)

  if (match) {
    const [, major, minor, patch, prerelease] = match
    if (major && minor && patch) {
      return {
        major: Number.parseInt(major, 10),
        minor: Number.parseInt(minor, 10),
        patch: Number.parseInt(patch, 10),
        prerelease,
      }
    }
  }

  return {major: 0, minor: 0, patch: 0}
}

function calculateSemverImpact(
  currentVersion?: string,
  newVersion?: string,
): 'major' | 'minor' | 'patch' | 'prerelease' | 'none' {
  if (!currentVersion || !newVersion) return 'none'

  const updateType = determineUpdateType(currentVersion, newVersion)

  switch (updateType) {
    case 'major':
      return 'major'
    case 'minor':
      return 'minor'
    case 'patch':
      return 'patch'
    default:
      return 'none'
  }
}

function isSecurityUpdate(): boolean {
  return false
}

function deduplicateChanges(changes: GoModDependencyChange[]): GoModDependencyChange[] {
  const seen = new Set<string>()
  return changes.filter(change => {
    const key = `${change.name}:${change.modFile}:${change.currentVersion}:${change.newVersion}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}
