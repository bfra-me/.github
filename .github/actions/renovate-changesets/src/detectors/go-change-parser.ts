import type {GoModDependencyChange, GoModule} from './go-detector-types.js'
import {calculateSemverImpact, determineUpdateType} from './go-version-parser.js'

export function parseGoModChanges(filename: string, patch: string): GoModDependencyChange[] {
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

export function parseGoSumChanges(filename: string, patch: string): GoModDependencyChange[] {
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
    isSecurityUpdate: false,
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
