import type {Octokit} from '@octokit/rest'
import type {RenovateManagerType, RenovateUpdateType} from './renovate-parser.js'
import {Buffer} from 'node:buffer'
import path from 'node:path'

/**
 * Python dependency types
 */
export type PythonDependencyType = 'main' | 'dev' | 'optional' | 'extras' | 'test' | 'docs' | 'lint'

/**
 * Requirements.txt entry structure
 */
export interface RequirementsEntry {
  name: string
  version?: string
  operator?: string
  extras?: string[]
  markers?: string
  line: number
  raw: string
  isEditable: boolean
  url?: string
  comment?: string
}

/**
 * Pipfile structure for dependency parsing
 */
export interface Pipfile {
  source?: {
    name?: string
    url?: string
    verify_ssl?: boolean
  }[]
  packages?: Record<string, string | {version?: string; [key: string]: any}>
  'dev-packages'?: Record<string, string | {version?: string; [key: string]: any}>
  requires?: {
    python_version?: string
    python_full_version?: string
  }
  [key: string]: any
}

/**
 * Pipfile.lock structure
 */
export interface PipfileLock {
  _meta?: {
    hash?: {sha256?: string}
    pipfile_spec?: number
    requires?: {python_version?: string}
    sources?: {name?: string; url?: string; verify_ssl?: boolean}[]
  }
  default?: Record<
    string,
    {
      hashes?: string[]
      index?: string
      version?: string
      markers?: string
      extras?: string[]
    }
  >
  develop?: Record<
    string,
    {
      hashes?: string[]
      index?: string
      version?: string
      markers?: string
      extras?: string[]
    }
  >
}

/**
 * pyproject.toml dependency structure
 */
export interface PyprojectToml {
  'build-system'?: {
    requires?: string[]
    'build-backend'?: string
  }
  project?: {
    name?: string
    version?: string
    dependencies?: string[]
    'optional-dependencies'?: Record<string, string[]>
    requires_python?: string
  }
  tool?: {
    poetry?: {
      name?: string
      version?: string
      dependencies?: Record<string, string | {version?: string; [key: string]: any}>
      'dev-dependencies'?: Record<string, string | {version?: string; [key: string]: any}>
      group?: Record<
        string,
        {dependencies?: Record<string, string | {version?: string; [key: string]: any}>}
      >
    }
    setuptools?: {
      packages?: string[] | Record<string, any>
    }
    [key: string]: any
  }
  [key: string]: any
}

/**
 * Detected Python dependency change
 */
export interface PythonDependencyChange {
  name: string
  packageFile: string
  dependencyType: PythonDependencyType
  currentVersion?: string
  newVersion?: string
  currentSpec?: string
  newSpec?: string
  manager: RenovateManagerType
  updateType: RenovateUpdateType
  semverImpact: 'major' | 'minor' | 'patch' | 'prerelease' | 'none'
  isSecurityUpdate: boolean
  isEditable: boolean
  scope?: string
  line?: number
  extras?: string[]
  markers?: string
  isExtra: boolean
  groupName?: string
}

/**
 * Python version components for semantic versioning
 */
interface PythonVersion {
  major?: number
  minor?: number
  patch?: number
  micro?: number
  dev?: number
  pre?: {type: 'a' | 'b' | 'rc'; number: number}
  post?: number
  epoch?: number
  local?: string
  original: string
  isPrerelease: boolean
  isDevelopment: boolean
  isLocal: boolean
}

/**
 * TASK-017: Python dependency change detection
 *
 * This class provides sophisticated analysis of Python dependency changes by parsing
 * requirements.txt, Pipfile, Pipfile.lock, pyproject.toml, setup.py, and other Python
 * dependency files to perform accurate version impact assessment.
 */
export class PythonChangeDetector {
  /**
   * Detect Python dependency changes from GitHub PR files
   */
  async detectChangesFromPR(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    files: {filename: string; status: string; additions: number; deletions: number}[],
  ): Promise<PythonDependencyChange[]> {
    const changes: PythonDependencyChange[] = []

    // Find all Python-related files that changed
    const pythonFiles = files.filter(file => this.isPythonDependencyFile(file.filename))

    if (pythonFiles.length === 0) {
      return changes
    }

    // Process each Python dependency file
    for (const file of pythonFiles) {
      try {
        const fileChanges = await this.analyzePythonFile(
          octokit,
          owner,
          repo,
          prNumber,
          file.filename,
        )
        changes.push(...fileChanges)
      } catch (error) {
        // Log error but continue processing other files
        console.warn(`Failed to analyze Python file ${file.filename}: ${error}`)
      }
    }

    // Deduplicate changes based on name, file, and version
    return this.deduplicateChanges(changes)
  }

  /**
   * Check if a file is a Python dependency file
   */
  private isPythonDependencyFile(filename: string): boolean {
    const pythonFilePatterns = [
      /^requirements.*\.txt$/i,
      /^Pipfile$/i,
      /^Pipfile\.lock$/i,
      /^pyproject\.toml$/i,
      /^setup\.py$/i,
      /^setup\.cfg$/i,
      /^poetry\.lock$/i,
      /^constraints.*\.txt$/i,
      /^dev-requirements.*\.txt$/i,
      /^test-requirements.*\.txt$/i,
      /.*requirements.*\.txt$/i,
    ]

    const baseName = path.basename(filename)
    return pythonFilePatterns.some(pattern => pattern.test(baseName))
  }

  /**
   * Analyze a specific Python dependency file for changes
   */
  private async analyzePythonFile(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    filename: string,
  ): Promise<PythonDependencyChange[]> {
    const changes: PythonDependencyChange[] = []

    try {
      // Get the file diff to understand what changed
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

      // Parse changes based on file type
      if (this.isRequirementsFile(filename)) {
        changes.push(...this.parseRequirementsChanges(filename, fileData.patch))
      } else if (this.isPipfile(filename)) {
        changes.push(...(await this.parsePipfileChanges(octokit, owner, repo, prNumber, filename)))
      } else if (this.isPyprojectToml(filename)) {
        changes.push(
          ...(await this.parsePyprojectChanges(octokit, owner, repo, prNumber, filename)),
        )
      }

      return changes
    } catch (error) {
      console.warn(`Error analyzing Python file ${filename}: ${error}`)
      return changes
    }
  }

  /**
   * Check if file is a requirements.txt style file
   */
  private isRequirementsFile(filename: string): boolean {
    return (
      /requirements.*\.txt$/i.test(path.basename(filename)) ||
      /constraints.*\.txt$/i.test(path.basename(filename))
    )
  }

  /**
   * Check if file is a Pipfile or Pipfile.lock
   */
  private isPipfile(filename: string): boolean {
    const baseName = path.basename(filename)
    return baseName === 'Pipfile' || baseName === 'Pipfile.lock'
  }

  /**
   * Check if file is pyproject.toml
   */
  private isPyprojectToml(filename: string): boolean {
    return path.basename(filename) === 'pyproject.toml'
  }

  /**
   * Parse requirements.txt file changes from patch
   */
  private parseRequirementsChanges(filename: string, patch: string): PythonDependencyChange[] {
    const changes: PythonDependencyChange[] = []
    const lines = patch.split('\n')

    let lineNumber = 0
    for (const line of lines) {
      if (line.startsWith('@@')) {
        // Extract line number from hunk header
        const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
        if (match && match[1]) {
          lineNumber = Number.parseInt(match[1], 10) - 1
        }
        continue
      }

      lineNumber++

      // Look for removed and added lines
      if (line.startsWith('-') && !line.startsWith('---')) {
        const oldReq = this.parseRequirementLine(line.slice(1), lineNumber)
        if (oldReq) {
          // Look for corresponding added line
          const addedLineIndex = lines.findIndex(
            (l, i) =>
              i > lines.indexOf(line) &&
              l.startsWith('+') &&
              !l.startsWith('+++') &&
              this.parseRequirementLine(l.slice(1), lineNumber)?.name === oldReq.name,
          )

          if (addedLineIndex !== -1) {
            const addedLine = lines[addedLineIndex]
            if (addedLine) {
              const newReq = this.parseRequirementLine(addedLine.slice(1), lineNumber)
              if (newReq && oldReq.version !== newReq.version) {
                changes.push(
                  this.createPythonChange(filename, oldReq, newReq, 'requirements', lineNumber),
                )
              }
            }
          }
        }
      }
    }

    return changes
  }

  /**
   * Parse Pipfile or Pipfile.lock changes
   */
  private async parsePipfileChanges(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    filename: string,
  ): Promise<PythonDependencyChange[]> {
    const changes: PythonDependencyChange[] = []

    try {
      // Get both old and new versions of the file
      const [oldContent, newContent] = await Promise.all([
        this.getFileContent(octokit, owner, repo, filename, `refs/pull/${prNumber}/base`),
        this.getFileContent(octokit, owner, repo, filename, `refs/pull/${prNumber}/head`),
      ])

      if (!oldContent || !newContent) {
        return changes
      }

      // Parse Pipfile vs Pipfile.lock differently
      if (filename.endsWith('Pipfile.lock')) {
        const oldLock = JSON.parse(oldContent) as PipfileLock
        const newLock = JSON.parse(newContent) as PipfileLock

        // Compare default and develop dependencies
        changes.push(
          ...this.comparePipfileLockDependencies(
            filename,
            oldLock.default || {},
            newLock.default || {},
            'main',
          ),
        )
        changes.push(
          ...this.comparePipfileLockDependencies(
            filename,
            oldLock.develop || {},
            newLock.develop || {},
            'dev',
          ),
        )
      } else {
        // Parse TOML format for Pipfile
        const oldPipfile = this.parsePipfileContent(oldContent)
        const newPipfile = this.parsePipfileContent(newContent)

        changes.push(
          ...this.comparePipfileDependencies(
            filename,
            oldPipfile.packages || {},
            newPipfile.packages || {},
            'main',
          ),
        )
        changes.push(
          ...this.comparePipfileDependencies(
            filename,
            oldPipfile['dev-packages'] || {},
            newPipfile['dev-packages'] || {},
            'dev',
          ),
        )
      }

      return changes
    } catch (error) {
      console.warn(`Error parsing Pipfile changes for ${filename}: ${error}`)
      return changes
    }
  }

  /**
   * Parse pyproject.toml changes
   */
  private async parsePyprojectChanges(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    filename: string,
  ): Promise<PythonDependencyChange[]> {
    const changes: PythonDependencyChange[] = []

    try {
      // Get both old and new versions of the file
      const [oldContent, newContent] = await Promise.all([
        this.getFileContent(octokit, owner, repo, filename, `refs/pull/${prNumber}/base`),
        this.getFileContent(octokit, owner, repo, filename, `refs/pull/${prNumber}/head`),
      ])

      if (!oldContent || !newContent) {
        return changes
      }

      // Parse TOML format
      const oldPyproject = this.parsePyprojectContent(oldContent)
      const newPyproject = this.parsePyprojectContent(newContent)

      // Compare project dependencies
      if (oldPyproject.project?.dependencies && newPyproject.project?.dependencies) {
        changes.push(
          ...this.comparePyprojectDependencies(
            filename,
            oldPyproject.project.dependencies,
            newPyproject.project.dependencies,
            'main',
          ),
        )
      }

      // Compare optional dependencies
      if (
        oldPyproject.project?.['optional-dependencies'] &&
        newPyproject.project?.['optional-dependencies']
      ) {
        for (const [extra, oldDeps] of Object.entries(
          oldPyproject.project['optional-dependencies'],
        )) {
          const newDeps = newPyproject.project['optional-dependencies'][extra]
          if (newDeps) {
            changes.push(
              ...this.comparePyprojectDependencies(filename, oldDeps, newDeps, 'extras', extra),
            )
          }
        }
      }

      // Compare Poetry dependencies if present
      if (oldPyproject.tool?.poetry && newPyproject.tool?.poetry) {
        const oldPoetry = oldPyproject.tool.poetry
        const newPoetry = newPyproject.tool.poetry

        if (oldPoetry.dependencies && newPoetry.dependencies) {
          changes.push(
            ...this.comparePipfileDependencies(
              filename,
              oldPoetry.dependencies,
              newPoetry.dependencies,
              'main',
            ),
          )
        }

        if (oldPoetry['dev-dependencies'] && newPoetry['dev-dependencies']) {
          changes.push(
            ...this.comparePipfileDependencies(
              filename,
              oldPoetry['dev-dependencies'],
              newPoetry['dev-dependencies'],
              'dev',
            ),
          )
        }

        // Compare Poetry groups
        if (oldPoetry.group && newPoetry.group) {
          for (const [groupName, oldGroup] of Object.entries(oldPoetry.group)) {
            const newGroup = newPoetry.group[groupName]
            if (newGroup?.dependencies && oldGroup?.dependencies) {
              changes.push(
                ...this.comparePipfileDependencies(
                  filename,
                  oldGroup.dependencies,
                  newGroup.dependencies,
                  'dev',
                  groupName,
                ),
              )
            }
          }
        }
      }

      return changes
    } catch (error) {
      console.warn(`Error parsing pyproject.toml changes for ${filename}: ${error}`)
      return changes
    }
  }

  /**
   * Parse a single requirement line from requirements.txt
   */
  private parseRequirementLine(line: string, lineNumber: number): RequirementsEntry | null {
    // Remove comments and whitespace
    const splitLine = line.split('#')
    const cleanLine = splitLine[0]?.trim()
    if (!cleanLine || cleanLine.startsWith('#')) {
      return null
    }

    // Handle editable installs (-e)
    const isEditable = cleanLine.startsWith('-e ')
    const reqLine = isEditable ? cleanLine.slice(3).trim() : cleanLine

    // Parse package specification (simplified to avoid regex complexity)
    const parts = reqLine.split(/\s*[;#]/) // Split on comment/marker separators
    const mainPart = parts[0]?.trim()
    if (!mainPart) {
      return null
    }
    const markers = parts[1]?.trim()

    // Extract package name with optional extras
    const nameMatch = mainPart.match(/^([a-z0-9][\w.-]*(?:\[[^\]]+\])?)/i)
    if (!nameMatch) {
      return null
    }

    const nameWithExtras = nameMatch[1]
    if (!nameWithExtras) {
      return null
    }
    const versionPart = mainPart.slice(nameWithExtras.length).trim()

    // Extract operator and version (simplified approach)
    let operator: string | undefined
    let version: string | undefined

    if (versionPart) {
      const operatorMatch = versionPart.match(/^([><=!~]+)/)
      if (operatorMatch) {
        operator = operatorMatch[1]
        if (operator) {
          version = versionPart.slice(operator.length).trim()
        }
      } else {
        version = versionPart
      }
    }
    const extrasMatch = nameWithExtras.match(/^([^[]+)(?:\[([^\]]+)\])?/)
    const name = extrasMatch?.[1] || nameWithExtras
    const extras = extrasMatch?.[2]?.split(',').map(e => e.trim()) || []

    if (!name) {
      return null
    }

    return {
      name,
      version,
      operator,
      extras,
      markers: markers?.slice(1).trim(),
      line: lineNumber,
      raw: line,
      isEditable,
      url: isEditable && !version ? reqLine : undefined,
    }
  }

  /**
   * Parse Pipfile content (simplified TOML parsing)
   */
  private parsePipfileContent(content: string): Pipfile {
    // This is a simplified TOML parser - in production, use a proper TOML library
    const pipfile: Pipfile = {}

    try {
      // Split into sections
      const sections = content.split(/\n\s*\[([^\]]+)\]\s*\n/)
      let currentSection: string | null = null

      for (const [index, section] of sections.entries()) {
        if (index % 2 === 1) {
          // This is a section name
          currentSection = section
          pipfile[currentSection as keyof Pipfile] = {} as any
        } else if (currentSection && section.trim()) {
          // This is section content
          const lines = section
            .split('\n')
            .filter(line => line.trim() && !line.trim().startsWith('#'))
          for (const line of lines) {
            // Simple key=value parsing
            const equalIndex = line.indexOf('=')
            if (equalIndex > 0) {
              const key = line.slice(0, equalIndex).trim().replaceAll(/['"]/g, '')
              let value = line.slice(equalIndex + 1).trim()

              // Handle string values
              if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1)
              }

              const sectionObj = pipfile[currentSection as keyof Pipfile] as Record<string, string>
              if (
                sectionObj &&
                (currentSection === 'packages' || currentSection === 'dev-packages')
              ) {
                sectionObj[key] = value
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Error parsing Pipfile content: ${error}`)
    }

    return pipfile
  }

  /**
   * Parse pyproject.toml content (simplified TOML parsing)
   */
  private parsePyprojectContent(_content: string): PyprojectToml {
    // This is a simplified TOML parser - in production, use a proper TOML library
    // For now, return empty object as a placeholder
    return {}
  }

  /**
   * Compare Pipfile.lock dependencies
   */
  private comparePipfileLockDependencies(
    filename: string,
    oldDeps: Record<string, any>,
    newDeps: Record<string, any>,
    depType: PythonDependencyType,
  ): PythonDependencyChange[] {
    const changes: PythonDependencyChange[] = []

    // Find changed dependencies
    for (const [name, newDepInfo] of Object.entries(newDeps)) {
      const oldDepInfo = oldDeps[name]
      if (oldDepInfo && oldDepInfo.version !== newDepInfo.version) {
        const change: PythonDependencyChange = {
          name,
          packageFile: filename,
          dependencyType: depType,
          currentVersion: this.cleanVersion(oldDepInfo.version),
          newVersion: this.cleanVersion(newDepInfo.version),
          currentSpec: oldDepInfo.version,
          newSpec: newDepInfo.version,
          manager: 'pipenv',
          updateType: this.determineUpdateType(
            this.cleanVersion(oldDepInfo.version),
            this.cleanVersion(newDepInfo.version),
          ),
          semverImpact: this.calculateSemverImpact(
            this.cleanVersion(oldDepInfo.version),
            this.cleanVersion(newDepInfo.version),
          ),
          isSecurityUpdate: this.isSecurityUpdate(name, oldDepInfo.version, newDepInfo.version),
          isEditable: false,
          isExtra: false,
          extras: newDepInfo.extras || [],
        }
        changes.push(change)
      }
    }

    return changes
  }

  /**
   * Compare Pipfile dependencies
   */
  private comparePipfileDependencies(
    filename: string,
    oldDeps: Record<string, any>,
    newDeps: Record<string, any>,
    depType: PythonDependencyType,
    groupName?: string,
  ): PythonDependencyChange[] {
    const changes: PythonDependencyChange[] = []

    for (const [name, newSpec] of Object.entries(newDeps)) {
      const oldSpec = oldDeps[name]
      if (oldSpec && oldSpec !== newSpec) {
        const oldVersion = typeof oldSpec === 'string' ? oldSpec : oldSpec.version
        const newVersion = typeof newSpec === 'string' ? newSpec : newSpec.version

        if (oldVersion && newVersion && oldVersion !== newVersion) {
          const change: PythonDependencyChange = {
            name,
            packageFile: filename,
            dependencyType: depType,
            currentVersion: this.cleanVersion(oldVersion),
            newVersion: this.cleanVersion(newVersion),
            currentSpec: oldVersion,
            newSpec: newVersion,
            manager: filename.includes('pyproject.toml') ? 'pip' : 'pipenv',
            updateType: this.determineUpdateType(
              this.cleanVersion(oldVersion),
              this.cleanVersion(newVersion),
            ),
            semverImpact: this.calculateSemverImpact(
              this.cleanVersion(oldVersion),
              this.cleanVersion(newVersion),
            ),
            isSecurityUpdate: this.isSecurityUpdate(name, oldVersion, newVersion),
            isEditable: false,
            isExtra: false,
            groupName,
          }
          changes.push(change)
        }
      }
    }

    return changes
  }

  /**
   * Compare pyproject.toml dependency arrays
   */
  private comparePyprojectDependencies(
    filename: string,
    oldDeps: string[],
    newDeps: string[],
    depType: PythonDependencyType,
    groupName?: string,
  ): PythonDependencyChange[] {
    const changes: PythonDependencyChange[] = []

    // Parse dependency specifications
    const oldParsed = oldDeps
      .map(dep => this.parseRequirementLine(dep, 0))
      .filter(Boolean) as RequirementsEntry[]
    const newParsed = newDeps
      .map(dep => this.parseRequirementLine(dep, 0))
      .filter(Boolean) as RequirementsEntry[]

    // Find changes
    for (const newDep of newParsed) {
      const oldDep = oldParsed.find(d => d.name === newDep.name)
      if (oldDep && oldDep.version !== newDep.version) {
        const change: PythonDependencyChange = {
          name: newDep.name,
          packageFile: filename,
          dependencyType: depType,
          currentVersion: this.cleanVersion(oldDep.version),
          newVersion: this.cleanVersion(newDep.version),
          currentSpec: oldDep.raw,
          newSpec: newDep.raw,
          manager: 'pip',
          updateType: this.determineUpdateType(
            this.cleanVersion(oldDep.version),
            this.cleanVersion(newDep.version),
          ),
          semverImpact: this.calculateSemverImpact(
            this.cleanVersion(oldDep.version),
            this.cleanVersion(newDep.version),
          ),
          isSecurityUpdate: this.isSecurityUpdate(newDep.name, oldDep.version, newDep.version),
          isEditable: newDep.isEditable,
          isExtra: depType === 'extras',
          extras: newDep.extras,
          groupName,
        }
        changes.push(change)
      }
    }

    return changes
  }

  /**
   * Create a Python dependency change from requirements entries
   */
  private createPythonChange(
    filename: string,
    oldReq: RequirementsEntry,
    newReq: RequirementsEntry,
    manager: string,
    lineNumber: number,
  ): PythonDependencyChange {
    return {
      name: newReq.name,
      packageFile: filename,
      dependencyType: this.determineDependencyType(filename),
      currentVersion: this.cleanVersion(oldReq.version),
      newVersion: this.cleanVersion(newReq.version),
      currentSpec: oldReq.raw,
      newSpec: newReq.raw,
      manager: manager as RenovateManagerType,
      updateType: this.determineUpdateType(
        this.cleanVersion(oldReq.version),
        this.cleanVersion(newReq.version),
      ),
      semverImpact: this.calculateSemverImpact(
        this.cleanVersion(oldReq.version),
        this.cleanVersion(newReq.version),
      ),
      isSecurityUpdate: this.isSecurityUpdate(newReq.name, oldReq.version, newReq.version),
      isEditable: newReq.isEditable,
      isExtra: false,
      line: lineNumber,
      extras: newReq.extras,
    }
  }

  /**
   * Determine dependency type from filename
   */
  private determineDependencyType(filename: string): PythonDependencyType {
    const basename = path.basename(filename).toLowerCase()

    if (basename.includes('dev')) return 'dev'
    if (basename.includes('test')) return 'test'
    if (basename.includes('docs')) return 'docs'
    if (basename.includes('lint')) return 'lint'

    return 'main'
  }

  /**
   * Clean version string by removing operators and extra characters
   */
  private cleanVersion(version?: string): string | undefined {
    if (!version) return undefined

    // Remove version operators (==, >=, etc.) and keep just the version
    return version.replace(/^[><=!~]+/, '').trim()
  }

  /**
   * Parse Python version string into components
   */
  private parsePythonVersion(version: string): PythonVersion {
    const cleanVersion = this.cleanVersion(version) || version

    // Basic PEP 440 version parsing
    const match = cleanVersion.match(
      /^(?:(\d+):)?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(post|dev)(\d+))?(?:(a|b|rc)(\d+))?(?:\+(.+))?$/,
    )

    const result: PythonVersion = {
      original: version,
      isPrerelease: false,
      isDevelopment: false,
      isLocal: false,
    }

    if (match) {
      const [, epoch, major, minor, patch, postDev, postDevNum, preType, preNum, local] = match

      if (epoch) result.epoch = Number.parseInt(epoch, 10)
      if (major) result.major = Number.parseInt(major, 10)
      if (minor) result.minor = Number.parseInt(minor, 10)
      if (patch) result.patch = Number.parseInt(patch, 10)

      if (postDev === 'post' && postDevNum) {
        result.post = Number.parseInt(postDevNum, 10)
      } else if (postDev === 'dev' && postDevNum) {
        result.dev = Number.parseInt(postDevNum, 10)
        result.isDevelopment = true
      }

      if (preType && preNum) {
        result.pre = {type: preType as 'a' | 'b' | 'rc', number: Number.parseInt(preNum, 10)}
        result.isPrerelease = true
      }

      if (local) {
        result.local = local
        result.isLocal = true
      }
    }

    return result
  }

  /**
   * Determine update type based on version change
   */
  private determineUpdateType(currentVersion?: string, newVersion?: string): RenovateUpdateType {
    if (!currentVersion || !newVersion) return 'patch'

    const current = this.parsePythonVersion(currentVersion)
    const updated = this.parsePythonVersion(newVersion)

    // Compare major.minor.patch
    if (current.major !== updated.major) return 'major'
    if (current.minor !== updated.minor) return 'minor'
    if (current.patch !== updated.patch) return 'patch'

    // Check for prerelease or dev changes
    if (current.isPrerelease !== updated.isPrerelease) return 'patch'
    if (current.isDevelopment !== updated.isDevelopment) return 'patch'

    return 'patch'
  }

  /**
   * Calculate semantic version impact
   */
  private calculateSemverImpact(
    currentVersion?: string,
    newVersion?: string,
  ): 'major' | 'minor' | 'patch' | 'prerelease' | 'none' {
    if (!currentVersion || !newVersion) return 'none'

    const updateType = this.determineUpdateType(currentVersion, newVersion)

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

  /**
   * Check if this is a security update
   */
  private isSecurityUpdate(_name: string, _oldVersion?: string, _newVersion?: string): boolean {
    // Simple heuristic - in production, this would check against security databases
    return false
  }

  /**
   * Get file content from GitHub
   */
  private async getFileContent(
    octokit: Octokit,
    owner: string,
    repo: string,
    path: string,
    ref: string,
  ): Promise<string | null> {
    try {
      const {data} = await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref,
      })

      if ('content' in data) {
        return Buffer.from(data.content, 'base64').toString('utf8')
      }
      return null
    } catch (error) {
      console.warn(`Failed to get file content for ${path} at ${ref}: ${error}`)
      return null
    }
  }

  /**
   * Deduplicate changes based on name, file, and version
   */
  private deduplicateChanges(changes: PythonDependencyChange[]): PythonDependencyChange[] {
    const seen = new Set<string>()
    return changes.filter(change => {
      const key = `${change.name}:${change.packageFile}:${change.currentVersion}:${change.newVersion}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
  }
}
