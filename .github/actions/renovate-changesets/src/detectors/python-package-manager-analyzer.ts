import type {
  Pipfile,
  PipfileLock,
  PipfileLockEntry,
  PipfilePackageSpec,
  PythonDependencyChange,
  PythonDependencyType,
} from './python-detector-types.js'
import {createPythonChange} from './python-version-comparator.js'

export interface PythonPackageManagerAnalyzerOptions {
  filename: string
  prNumber: number
  loadContent: (filename: string, ref: string) => Promise<string | null>
}

export async function parsePackageManagerChanges({
  filename,
  prNumber,
  loadContent,
}: PythonPackageManagerAnalyzerOptions): Promise<PythonDependencyChange[]> {
  try {
    const [baseContent, headContent] = await Promise.all([
      loadContent(filename, `refs/pull/${prNumber}/base`),
      loadContent(filename, `refs/pull/${prNumber}/head`),
    ])
    if (baseContent == null || headContent == null) return []

    if (filename.endsWith('Pipfile.lock')) {
      const baseLock = JSON.parse(baseContent) as PipfileLock
      const headLock = JSON.parse(headContent) as PipfileLock

      return [
        ...comparePipfileLockDependencies(
          filename,
          baseLock.default ?? {},
          headLock.default ?? {},
          'main',
        ),
        ...comparePipfileLockDependencies(
          filename,
          baseLock.develop ?? {},
          headLock.develop ?? {},
          'dev',
        ),
      ]
    }

    if (filename.endsWith('Pipfile')) {
      const basePipfile = parsePipfileContent(baseContent)
      const headPipfile = parsePipfileContent(headContent)

      return [
        ...comparePipfileDependencies(
          filename,
          basePipfile.packages ?? {},
          headPipfile.packages ?? {},
          'main',
        ),
        ...comparePipfileDependencies(
          filename,
          basePipfile['dev-packages'] ?? {},
          headPipfile['dev-packages'] ?? {},
          'dev',
        ),
      ]
    }
  } catch (error) {
    console.warn(`Error parsing Python package manager changes for ${filename}: ${error}`)
  }

  return []
}

function comparePipfileLockDependencies(
  filename: string,
  oldDependencies: Record<string, PipfileLockEntry>,
  newDependencies: Record<string, PipfileLockEntry>,
  dependencyType: PythonDependencyType,
): PythonDependencyChange[] {
  return Object.entries(newDependencies).flatMap(([name, newDependency]) => {
    const oldDependency = oldDependencies[name]
    if (oldDependency?.version == null || newDependency.version == null) return []
    if (oldDependency.version === newDependency.version) return []

    return [
      createPythonChange({
        name,
        packageFile: filename,
        dependencyType,
        currentVersion: oldDependency.version,
        newVersion: newDependency.version,
        currentSpec: oldDependency.version,
        newSpec: newDependency.version,
        manager: 'pipenv',
        extras: newDependency.extras ?? [],
      }),
    ]
  })
}

function comparePipfileDependencies(
  filename: string,
  oldDependencies: Record<string, PipfilePackageSpec>,
  newDependencies: Record<string, PipfilePackageSpec>,
  dependencyType: PythonDependencyType,
): PythonDependencyChange[] {
  return Object.entries(newDependencies).flatMap(([name, newDependency]) => {
    const oldDependency = oldDependencies[name]
    const oldVersion = getVersionSpec(oldDependency)
    const newVersion = getVersionSpec(newDependency)
    if (oldVersion == null || newVersion == null || oldVersion === newVersion) return []

    return [
      createPythonChange({
        name,
        packageFile: filename,
        dependencyType,
        currentVersion: oldVersion,
        newVersion,
        currentSpec: oldVersion,
        newSpec: newVersion,
        manager: 'pipenv',
      }),
    ]
  })
}

function parsePipfileContent(content: string): Pipfile {
  const pipfile: Pipfile = {}
  let currentSection: 'packages' | 'dev-packages' | null = null

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith('#')) continue

    const section = line.match(/^\[([^\]]+)\]$/)?.[1]
    if (section != null) {
      currentSection = section === 'packages' || section === 'dev-packages' ? section : null
      if (currentSection != null) pipfile[currentSection] = {}
      continue
    }

    if (currentSection == null) continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) continue

    const key = line.slice(0, separatorIndex).trim().replaceAll(/['"]/g, '')
    const rawValue = line.slice(separatorIndex + 1).trim()
    const value =
      rawValue.startsWith('"') && rawValue.endsWith('"') ? rawValue.slice(1, -1) : rawValue
    pipfile[currentSection] = {...(pipfile[currentSection] ?? {}), [key]: value}
  }

  return pipfile
}

function getVersionSpec(spec?: PipfilePackageSpec): string | undefined {
  if (typeof spec === 'string') return spec
  return spec?.version
}
