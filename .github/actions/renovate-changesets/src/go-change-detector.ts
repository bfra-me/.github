import type {Octokit} from '@octokit/rest'
import type {RenovateManagerType, RenovateUpdateType} from './renovate-parser.js'
import path from 'node:path'

/**
 * Go module dependency structure
 */
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

/**
 * Go mod file structure
 */
export interface GoModFile {
  module?: string
  go?: string
  require?: GoModule[]
  exclude?: GoModule[]
  replace?: GoModule[]
  retract?: GoModule[]
}

/**
 * Detected Go dependency change
 */
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

/**
 * TASK-017: Go module dependency change detection
 *
 * This class provides analysis of Go module dependency changes by parsing
 * go.mod files and performing version impact assessment.
 */
export class GoChangeDetector {
  /**
   * Detect Go module dependency changes from GitHub PR files
   */
  async detectChangesFromPR(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    files: {filename: string; status: string; additions: number; deletions: number}[],
  ): Promise<GoModDependencyChange[]> {
    const changes: GoModDependencyChange[] = []

    // Find all Go-related files that changed
    const goFiles = files.filter(file => this.isGoModFile(file.filename))

    if (goFiles.length === 0) {
      return changes
    }

    // Process each Go mod file
    for (const file of goFiles) {
      try {
        const fileChanges = await this.analyzeGoModFile(
          octokit,
          owner,
          repo,
          prNumber,
          file.filename,
        )
        changes.push(...fileChanges)
      } catch (error) {
        // Log error but continue processing other files
        console.warn(`Failed to analyze Go mod file ${file.filename}: ${error}`)
      }
    }

    // Deduplicate changes based on name, file, and version
    return this.deduplicateChanges(changes)
  }

  /**
   * Check if a file is a Go mod file
   */
  private isGoModFile(filename: string): boolean {
    return path.basename(filename) === 'go.mod' || path.basename(filename) === 'go.sum'
  }

  /**
   * Analyze a specific Go mod file for changes
   */
  private async analyzeGoModFile(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    filename: string,
  ): Promise<GoModDependencyChange[]> {
    const changes: GoModDependencyChange[] = []

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
      if (filename.endsWith('go.mod')) {
        changes.push(...this.parseGoModChanges(filename, fileData.patch))
      } else if (filename.endsWith('go.sum')) {
        // go.sum files contain checksums, changes here indicate dependency updates
        changes.push(...this.parseGoSumChanges(filename, fileData.patch))
      }

      return changes
    } catch (error) {
      console.warn(`Error analyzing Go mod file ${filename}: ${error}`)
      return changes
    }
  }

  /**
   * Parse go.mod file changes from patch
   */
  private parseGoModChanges(filename: string, patch: string): GoModDependencyChange[] {
    const changes: GoModDependencyChange[] = []
    const lines = patch.split('\n')

    let lineNumber = 0
    for (const line of lines) {
      if (line.startsWith('@@')) {
        // Extract line number from hunk header
        const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
        if (match?.[1]) {
          lineNumber = Number.parseInt(match[1], 10) - 1
        }
        continue
      }

      lineNumber++

      // Look for dependency changes
      if (line.startsWith('-') && !line.startsWith('---')) {
        const oldMod = this.parseGoModLine(line.slice(1).trim())
        if (oldMod) {
          // Look for corresponding added line
          const addedLineIndex = lines.findIndex(
            (l, i) =>
              i > lines.indexOf(line) &&
              l.startsWith('+') &&
              !l.startsWith('+++') &&
              this.parseGoModLine(l.slice(1).trim())?.path === oldMod.path,
          )

          if (addedLineIndex !== -1) {
            const newMod = this.parseGoModLine(lines[addedLineIndex]?.slice(1).trim() || '')
            if (newMod && oldMod.version !== newMod.version) {
              changes.push(this.createGoModChange(filename, oldMod, newMod, lineNumber))
            }
          }
        }
      }
    }

    return changes
  }

  /**
   * Parse go.sum file changes from patch
   */
  private parseGoSumChanges(filename: string, patch: string): GoModDependencyChange[] {
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

      // Look for new entries in go.sum (indicates version updates)
      if (line.startsWith('+') && !line.startsWith('+++')) {
        const sumEntry = this.parseGoSumLine(line.slice(1).trim())
        if (sumEntry) {
          changes.push(this.createGoSumChange(filename, sumEntry, lineNumber))
        }
      }
    }

    return changes
  }

  /**
   * Parse a single go.mod line
   */
  private parseGoModLine(line: string): GoModule | null {
    const trimmed = line.trim()
    if (
      !trimmed ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('module ') ||
      trimmed.startsWith('go ')
    ) {
      return null
    }

    // Handle require statements: "require github.com/pkg/errors v0.9.1"
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

  /**
   * Parse a single go.sum line
   */
  private parseGoSumLine(line: string): {path: string; version: string; hash: string} | null {
    const trimmed = line.trim()
    if (!trimmed) {
      return null
    }

    // go.sum format: "module version hash"
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

  /**
   * Create Go mod dependency change
   */
  private createGoModChange(
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
      updateType: this.determineUpdateType(oldMod.version, newMod.version),
      semverImpact: this.calculateSemverImpact(oldMod.version, newMod.version),
      isSecurityUpdate: this.isSecurityUpdate(newMod.path, oldMod.version, newMod.version),
      isIndirect: newMod.indirect || false,
      isReplace: Boolean(newMod.replace),
      line: lineNumber,
    }
  }

  /**
   * Create Go sum dependency change
   */
  private createGoSumChange(
    filename: string,
    sumEntry: {path: string; version: string; hash: string},
    lineNumber: number,
  ): GoModDependencyChange {
    return {
      name: sumEntry.path,
      modFile: filename,
      newVersion: sumEntry.version,
      manager: 'go',
      updateType: 'patch', // Default for go.sum entries
      semverImpact: 'patch',
      isSecurityUpdate: false,
      isIndirect: false,
      isReplace: false,
      line: lineNumber,
    }
  }

  /**
   * Determine update type based on version change
   */
  private determineUpdateType(currentVersion?: string, newVersion?: string): RenovateUpdateType {
    if (!currentVersion || !newVersion) return 'patch'

    // Go uses semantic versioning
    const currentParts = this.parseGoVersion(currentVersion)
    const newParts = this.parseGoVersion(newVersion)

    if (currentParts.major !== newParts.major) return 'major'
    if (currentParts.minor !== newParts.minor) return 'minor'
    if (currentParts.patch !== newParts.patch) return 'patch'

    return 'patch'
  }

  /**
   * Parse Go version string
   */
  private parseGoVersion(version: string): {
    major: number
    minor: number
    patch: number
    prerelease?: string
  } {
    // Remove 'v' prefix if present
    const cleanVersion = version.startsWith('v') ? version.slice(1) : version

    // Basic semantic version parsing
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

    // Fallback for non-standard versions
    return {major: 0, minor: 0, patch: 0}
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
   * Deduplicate changes based on name, file, and version
   */
  private deduplicateChanges(changes: GoModDependencyChange[]): GoModDependencyChange[] {
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
}
