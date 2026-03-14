import type {PythonDependencyChange, RequirementsEntry} from './python-detector-types.js'
import {createPythonChange, determineDependencyType} from './python-version-comparator.js'

export function parseRequirementsChanges(
  filename: string,
  patch: string,
): PythonDependencyChange[] {
  const changes: PythonDependencyChange[] = []
  const lines = patch.split('\n')
  let lineNumber = 0

  for (const [index, line] of lines.entries()) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (match?.[1] != null) lineNumber = Number.parseInt(match[1], 10) - 1
      continue
    }

    lineNumber += 1

    if (!line.startsWith('-') || line.startsWith('---')) continue

    const oldRequirement = parseRequirementLine(line.slice(1), lineNumber)
    if (oldRequirement == null) continue

    const newRequirement = findAddedRequirement(lines, index + 1, lineNumber, oldRequirement.name)
    if (newRequirement == null || oldRequirement.version === newRequirement.version) continue

    changes.push(
      createPythonChange({
        name: newRequirement.name,
        packageFile: filename,
        dependencyType: determineDependencyType(filename),
        currentVersion: oldRequirement.version,
        newVersion: newRequirement.version,
        currentSpec: oldRequirement.raw,
        newSpec: newRequirement.raw,
        manager: 'requirements',
        isEditable: newRequirement.isEditable,
        line: lineNumber,
        extras: newRequirement.extras,
      }),
    )
  }

  return changes
}

function findAddedRequirement(
  lines: string[],
  startIndex: number,
  lineNumber: number,
  dependencyName: string,
): RequirementsEntry | null {
  for (const line of lines.slice(startIndex)) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue

    const requirement = parseRequirementLine(line.slice(1), lineNumber)
    if (requirement?.name === dependencyName) return requirement
  }

  return null
}

function parseRequirementLine(line: string, lineNumber: number): RequirementsEntry | null {
  const splitLine = line.split('#')
  const cleanLine = splitLine[0]?.trim()
  if (cleanLine == null || cleanLine.length === 0 || cleanLine.startsWith('#')) return null

  const isEditable = cleanLine.startsWith('-e ')
  const requirementLine = isEditable ? cleanLine.slice(3).trim() : cleanLine
  const parts = requirementLine.split(/\s*[;#]/)
  const mainPart = parts[0]?.trim()
  if (mainPart == null || mainPart.length === 0) return null

  const nameMatch = mainPart.match(/^([a-z0-9][\w.-]*(?:\[[^\]]+\])?)/i)
  const nameWithExtras = nameMatch?.[1]
  if (nameWithExtras == null) return null

  const versionPart = mainPart.slice(nameWithExtras.length).trim()
  let operator: string | undefined
  let version: string | undefined

  if (versionPart.length > 0) {
    const operatorMatch = versionPart.match(/^([><=!~]+)/)
    operator = operatorMatch?.[1]
    version = operator == null ? versionPart : versionPart.slice(operator.length).trim()
  }

  const extrasMatch = nameWithExtras.match(/^([^[]+)(?:\[([^\]]+)\])?/)
  const name = extrasMatch?.[1]
  if (name == null) return null

  return {
    name,
    version,
    operator,
    extras: extrasMatch?.[2]?.split(',').map(extra => extra.trim()) ?? [],
    markers: parts[1]?.trim().slice(1),
    line: lineNumber,
    raw: line,
    isEditable,
    url: isEditable && version == null ? requirementLine : undefined,
  }
}
