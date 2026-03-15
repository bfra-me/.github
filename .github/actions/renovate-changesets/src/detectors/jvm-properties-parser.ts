import type {JVMDependencyChange} from './jvm-detector-types.js'
import {isGradleFile} from './jvm-file-classifier.js'
import {
  calculateSemverImpact,
  determineUpdateType,
  isVersionProperty,
} from './jvm-version-comparator.js'

interface PropertyLine {
  key: string
  value: string
}

export function parsePropertiesChanges(filename: string, patch: string): JVMDependencyChange[] {
  const lines = patch.split('\n')
  const changes: JVMDependencyChange[] = []
  let lineNumber = 0

  for (const [index, line] of lines.entries()) {
    if (line.startsWith('@@')) {
      lineNumber = parseHunkLine(line)
      continue
    }

    lineNumber += 1
    if (!line.startsWith('-') || line.startsWith('---')) continue

    const oldProp = parsePropertyLine(line.slice(1))
    if (oldProp == null || !isVersionProperty(oldProp.key)) continue

    const newProp = findUpdatedProperty(lines, index, oldProp.key)
    if (newProp != null && oldProp.value !== newProp.value) {
      changes.push(createPropertyChange(filename, oldProp, newProp, lineNumber))
    }
  }

  return changes
}

function parsePropertyLine(line: string): PropertyLine | null {
  const cleanLine = line.trim()
  if (cleanLine.length === 0 || cleanLine.startsWith('#') || cleanLine.startsWith('!')) return null
  const separatorIndex = Math.min(
    ...[cleanLine.indexOf('='), cleanLine.indexOf(':')].filter(i => i >= 0),
  )
  if (!Number.isFinite(separatorIndex) || separatorIndex <= 0) return null
  return {
    key: cleanLine.slice(0, separatorIndex).trim(),
    value: cleanLine.slice(separatorIndex + 1).trim(),
  }
}

function parseHunkLine(line: string): number {
  const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
  return (match?.[1] == null ? 1 : Number.parseInt(match[1], 10)) - 1
}

function findUpdatedProperty(
  lines: string[],
  startIndex: number,
  key: string,
): PropertyLine | null {
  for (const line of lines.slice(startIndex + 1)) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue
    const newProp = parsePropertyLine(line.slice(1))
    if (newProp?.key === key) return newProp
  }

  return null
}

function createPropertyChange(
  filename: string,
  oldProp: PropertyLine,
  newProp: PropertyLine,
  lineNumber: number,
): JVMDependencyChange {
  return {
    name: oldProp.key,
    buildFile: filename,
    dependencyType: 'compile',
    currentVersion: oldProp.value,
    newVersion: newProp.value,
    currentCoordinate: `${oldProp.key}=${oldProp.value}`,
    newCoordinate: `${newProp.key}=${newProp.value}`,
    manager: isGradleFile(filename) ? 'gradle' : 'maven',
    updateType: determineUpdateType(oldProp.value, newProp.value),
    semverImpact: calculateSemverImpact(oldProp.value, newProp.value),
    isSecurityUpdate: false,
    isPlugin: false,
    line: lineNumber,
    isParent: false,
    isPropertyReference: true,
  }
}
