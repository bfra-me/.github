import type {GradleDependency, JVMDependencyChange} from './jvm-detector-types.js'
import {
  calculateSemverImpact,
  determineUpdateType,
  isPropertyReference,
  mapGradleConfigurationToJVMType,
} from './jvm-version-comparator.js'

export function parseGradleChanges(filename: string, patch: string): JVMDependencyChange[] {
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

    const oldDep = parseGradleDependencyLine(line.slice(1), lineNumber)
    if (oldDep == null) continue

    const newDep = findUpdatedGradleDependency(lines, index, oldDep, lineNumber)
    if (newDep != null && oldDep.version !== newDep.version) {
      changes.push(createJVMChange(filename, oldDep, newDep, lineNumber))
    }
  }

  return changes
}

export function parseGradleDependencyLine(
  line: string,
  lineNumber: number,
): GradleDependency | null {
  const cleanLine = line.trim()
  if (cleanLine.length === 0 || cleanLine.startsWith('//') || cleanLine.startsWith('/*')) {
    return null
  }

  const stringMatch = cleanLine.match(/^([\w.]+)\s+['"]([\w.-]+):([\w.-]+):([\w.-]+)['"]/)
  if (stringMatch != null) {
    const [, configuration, group, name, version] = stringMatch
    if (configuration != null && group != null && name != null && version != null) {
      return {
        configuration,
        group,
        name,
        version,
        notation: `${group}:${name}:${version}`,
        line: lineNumber,
      }
    }
  }

  const mapMatch = cleanLine.match(
    /^([\w.]+)\s+group:\s*['"]([\w.-]+)['"],\s*name:\s*['"]([\w.-]+)['"],\s*version:\s*['"]([\w.-]+)['"]/,
  )
  if (mapMatch != null) {
    const [, configuration, group, name, version] = mapMatch
    if (configuration != null && group != null && name != null && version != null) {
      return {
        configuration,
        group,
        name,
        version,
        notation: `${group}:${name}:${version}`,
        line: lineNumber,
      }
    }
  }

  const pluginMatch = cleanLine.match(/^id\s+['"]([\w.-]+)['"](?:\s+version\s+['"]([\w.-]+)['"])?/)
  if (pluginMatch?.[1] == null) return null

  const name = pluginMatch[1]
  const version = pluginMatch[2] ?? ''

  return {
    configuration: 'plugin',
    name,
    version,
    notation: version.length > 0 ? `${name}:${version}` : name,
    line: lineNumber,
  }
}

function parseHunkLine(line: string): number {
  const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
  return (match?.[1] == null ? 1 : Number.parseInt(match[1], 10)) - 1
}

function findUpdatedGradleDependency(
  lines: string[],
  startIndex: number,
  oldDep: GradleDependency,
  lineNumber: number,
): GradleDependency | null {
  for (const line of lines.slice(startIndex + 1)) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue

    const newDep = parseGradleDependencyLine(line.slice(1), lineNumber)
    if (newDep?.name === oldDep.name) return newDep
  }

  return null
}

function createJVMChange(
  filename: string,
  oldDep: GradleDependency,
  newDep: GradleDependency,
  lineNumber: number,
): JVMDependencyChange {
  return {
    name: newDep.group == null ? newDep.name : `${newDep.group}:${newDep.name}`,
    buildFile: filename,
    dependencyType: mapGradleConfigurationToJVMType(newDep.configuration),
    currentVersion: oldDep.version,
    newVersion: newDep.version,
    currentCoordinate: oldDep.notation,
    newCoordinate: newDep.notation,
    manager: 'gradle',
    updateType: determineUpdateType(oldDep.version, newDep.version),
    semverImpact: calculateSemverImpact(oldDep.version, newDep.version),
    isSecurityUpdate: false,
    isPlugin: newDep.configuration === 'plugin',
    line: lineNumber,
    groupId: newDep.group,
    artifactId: newDep.name,
    configuration: newDep.configuration,
    isParent: false,
    isPropertyReference: isPropertyReference(newDep.version),
  }
}
