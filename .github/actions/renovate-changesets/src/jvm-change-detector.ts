import type {Octokit} from '@octokit/rest'
import type {RenovateManagerType, RenovateUpdateType} from './renovate-parser.js'
import {Buffer} from 'node:buffer'
import path from 'node:path'

/**
 * JVM dependency types
 */
export type JVMDependencyType =
  | 'compile'
  | 'runtime'
  | 'test'
  | 'provided'
  | 'system'
  | 'implementation'
  | 'api'
  | 'testImplementation'
  | 'compileOnly'
  | 'runtimeOnly'
  | 'annotationProcessor'
  | 'plugin'
  | 'parent'

/**
 * Maven coordinate structure
 */
export interface MavenCoordinate {
  groupId: string
  artifactId: string
  version?: string
  scope?: string
  type?: string
  classifier?: string
  optional?: boolean
  exclusions?: MavenCoordinate[]
}

/**
 * Gradle dependency structure
 */
export interface GradleDependency {
  configuration: string
  group?: string
  name: string
  version?: string
  classifier?: string
  ext?: string
  notation: string
  line?: number
}

/**
 * Maven POM structure (simplified)
 */
export interface MavenPOM {
  modelVersion?: string
  groupId?: string
  artifactId?: string
  version?: string
  packaging?: string
  parent?: MavenCoordinate
  properties?: Record<string, string>
  dependencies?: MavenCoordinate[]
  dependencyManagement?: {
    dependencies?: MavenCoordinate[]
  }
  build?: {
    plugins?: {
      groupId?: string
      artifactId?: string
      version?: string
      configuration?: any
    }[]
  }
  [key: string]: any
}

/**
 * Gradle build file structure (simplified)
 */
export interface GradleBuildFile {
  plugins?: {
    id?: string
    version?: string
    apply?: boolean
  }[]
  dependencies?: GradleDependency[]
  repositories?: string[]
  configurations?: Record<string, any>
  [key: string]: any
}

/**
 * Detected JVM dependency change
 */
export interface JVMDependencyChange {
  name: string
  buildFile: string
  dependencyType: JVMDependencyType
  currentVersion?: string
  newVersion?: string
  currentCoordinate?: string
  newCoordinate?: string
  manager: RenovateManagerType
  updateType: RenovateUpdateType
  semverImpact: 'major' | 'minor' | 'patch' | 'prerelease' | 'none'
  isSecurityUpdate: boolean
  isPlugin: boolean
  scope?: string
  line?: number
  groupId?: string
  artifactId?: string
  configuration?: string
  isParent: boolean
  isPropertyReference: boolean
}

/**
 * JVM version components for semantic versioning
 */
interface JVMVersion {
  major?: number
  minor?: number
  patch?: number
  qualifier?: string
  build?: string
  original: string
  isSnapshot: boolean
  isRelease: boolean
  isMilestone: boolean
  isRC: boolean
}

/**
 * TASK-017: JVM dependency change detection
 *
 * This class provides sophisticated analysis of JVM dependency changes by parsing
 * build.gradle, pom.xml, gradle.properties, and other JVM build files to perform
 * accurate version impact assessment for Java/Kotlin projects.
 */
export class JVMChangeDetector {
  /**
   * Detect JVM dependency changes from GitHub PR files
   */
  async detectChangesFromPR(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    files: {filename: string; status: string; additions: number; deletions: number}[],
  ): Promise<JVMDependencyChange[]> {
    const changes: JVMDependencyChange[] = []

    // Find all JVM-related files that changed
    const jvmFiles = files.filter(file => this.isJVMBuildFile(file.filename))

    if (jvmFiles.length === 0) {
      return changes
    }

    // Process each JVM build file
    for (const file of jvmFiles) {
      try {
        const fileChanges = await this.analyzeJVMFile(octokit, owner, repo, prNumber, file.filename)
        changes.push(...fileChanges)
      } catch (error) {
        // Log error but continue processing other files
        console.warn(`Failed to analyze JVM file ${file.filename}: ${error}`)
      }
    }

    // Deduplicate changes based on name, file, and version
    return this.deduplicateChanges(changes)
  }

  /**
   * Check if a file is a JVM build file
   */
  private isJVMBuildFile(filename: string): boolean {
    const jvmFilePatterns = [
      /^build\.gradle$/i,
      /^build\.gradle\.kts$/i,
      /^settings\.gradle$/i,
      /^settings\.gradle\.kts$/i,
      /^gradle\.properties$/i,
      /^pom\.xml$/i,
      /gradle\/wrapper\/gradle-wrapper\.properties$/i,
      /.*\.gradle$/i,
      /.*\.gradle\.kts$/i,
      /.*pom.*\.xml$/i,
    ]

    return jvmFilePatterns.some(pattern => pattern.test(filename))
  }

  /**
   * Analyze a specific JVM build file for changes
   */
  private async analyzeJVMFile(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    filename: string,
  ): Promise<JVMDependencyChange[]> {
    const changes: JVMDependencyChange[] = []

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
      if (this.isGradleFile(filename)) {
        changes.push(...this.parseGradleChanges(filename, fileData.patch))
      } else if (this.isMavenFile(filename)) {
        changes.push(...(await this.parseMavenChanges(octokit, owner, repo, prNumber, filename)))
      } else if (this.isPropertiesFile(filename)) {
        changes.push(...this.parsePropertiesChanges(filename, fileData.patch))
      }

      return changes
    } catch (error) {
      console.warn(`Error analyzing JVM file ${filename}: ${error}`)
      return changes
    }
  }

  /**
   * Check if file is a Gradle build file
   */
  private isGradleFile(filename: string): boolean {
    return /\.gradle(?:\.kts)?$/i.test(filename) || filename.includes('gradle')
  }

  /**
   * Check if file is a Maven POM file
   */
  private isMavenFile(filename: string): boolean {
    return /pom.*\.xml$/i.test(path.basename(filename))
  }

  /**
   * Check if file is a properties file
   */
  private isPropertiesFile(filename: string): boolean {
    return filename.endsWith('.properties')
  }

  /**
   * Parse Gradle build file changes from patch
   */
  private parseGradleChanges(filename: string, patch: string): JVMDependencyChange[] {
    const changes: JVMDependencyChange[] = []
    const lines = patch.split('\n')

    let lineNumber = 0
    for (const line of lines) {
      if (line.startsWith('@@')) {
        // Extract line number from hunk header
        const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
        if (match) {
          lineNumber = Number.parseInt(match[1], 10) - 1
        }
        continue
      }

      lineNumber++

      // Look for dependency changes in Gradle format
      if (line.startsWith('-') && !line.startsWith('---')) {
        const oldDep = this.parseGradleDependencyLine(line.slice(1), lineNumber)
        if (oldDep) {
          // Look for corresponding added line
          const addedLineIndex = lines.findIndex(
            (l, i) =>
              i > lines.indexOf(line) &&
              l.startsWith('+') &&
              !l.startsWith('+++') &&
              this.parseGradleDependencyLine(l.slice(1), lineNumber)?.name === oldDep.name,
          )

          if (addedLineIndex !== -1) {
            const newDep = this.parseGradleDependencyLine(
              lines[addedLineIndex].slice(1),
              lineNumber,
            )
            if (newDep && oldDep.version !== newDep.version) {
              changes.push(this.createJVMChange(filename, oldDep, newDep, 'gradle', lineNumber))
            }
          }
        }
      }
    }

    return changes
  }

  /**
   * Parse Maven POM changes
   */
  private async parseMavenChanges(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    filename: string,
  ): Promise<JVMDependencyChange[]> {
    const changes: JVMDependencyChange[] = []

    try {
      // Get both old and new versions of the file
      const [oldContent, newContent] = await Promise.all([
        this.getFileContent(octokit, owner, repo, filename, `refs/pull/${prNumber}/base`),
        this.getFileContent(octokit, owner, repo, filename, `refs/pull/${prNumber}/head`),
      ])

      if (!oldContent || !newContent) {
        return changes
      }

      // Parse Maven POM XML
      const oldPom = this.parseMavenPOM(oldContent)
      const newPom = this.parseMavenPOM(newContent)

      // Compare dependencies
      changes.push(
        ...this.compareMavenDependencies(
          filename,
          oldPom.dependencies || [],
          newPom.dependencies || [],
        ),
      )

      // Compare dependency management
      const oldDepMgmt = oldPom.dependencyManagement?.dependencies || []
      const newDepMgmt = newPom.dependencyManagement?.dependencies || []
      changes.push(...this.compareMavenDependencies(filename, oldDepMgmt, newDepMgmt))

      // Compare parent version
      if (oldPom.parent && newPom.parent && oldPom.parent.version !== newPom.parent.version) {
        changes.push(this.createMavenParentChange(filename, oldPom.parent, newPom.parent))
      }

      // Compare plugin versions
      const oldPlugins = oldPom.build?.plugins || []
      const newPlugins = newPom.build?.plugins || []
      changes.push(...this.compareMavenPlugins(filename, oldPlugins, newPlugins))

      return changes
    } catch (error) {
      console.warn(`Error parsing Maven changes for ${filename}: ${error}`)
      return changes
    }
  }

  /**
   * Parse properties file changes
   */
  private parsePropertiesChanges(filename: string, patch: string): JVMDependencyChange[] {
    const changes: JVMDependencyChange[] = []
    const lines = patch.split('\n')

    let lineNumber = 0
    for (const line of lines) {
      if (line.startsWith('@@')) {
        const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
        if (match) {
          lineNumber = Number.parseInt(match[1], 10) - 1
        }
        continue
      }

      lineNumber++

      // Look for version property changes
      if (line.startsWith('-') && !line.startsWith('---')) {
        const oldProp = this.parsePropertyLine(line.slice(1))
        if (oldProp && this.isVersionProperty(oldProp.key)) {
          // Look for corresponding added line
          const addedLineIndex = lines.findIndex(
            (l, i) =>
              i > lines.indexOf(line) &&
              l.startsWith('+') &&
              !l.startsWith('+++') &&
              this.parsePropertyLine(l.slice(1))?.key === oldProp.key,
          )

          if (addedLineIndex !== -1) {
            const newProp = this.parsePropertyLine(lines[addedLineIndex].slice(1))
            if (newProp && oldProp.value !== newProp.value) {
              changes.push(this.createPropertyChange(filename, oldProp, newProp, lineNumber))
            }
          }
        }
      }
    }

    return changes
  }

  /**
   * Parse a single Gradle dependency line
   */
  private parseGradleDependencyLine(line: string, lineNumber: number): GradleDependency | null {
    const cleanLine = line.trim()
    if (!cleanLine || cleanLine.startsWith('//') || cleanLine.startsWith('/*')) {
      return null
    }

    // Common Gradle dependency formats:
    // implementation 'group:name:version'
    // implementation group: 'group', name: 'name', version: 'version'
    // id 'plugin-id' version 'version'

    // Simple string notation
    const stringMatch = cleanLine.match(/^(\w+)\s+['"]([\w.-]+):([\w.-]+):([\w.-]+)['"]/)
    if (stringMatch) {
      const [, configuration, group, name, version] = stringMatch
      return {
        configuration,
        group,
        name,
        version,
        notation: `${group}:${name}:${version}`,
        line: lineNumber,
      }
    }

    // Map notation
    const mapMatch = cleanLine.match(
      /^(\w+)\s+group:\s*['"]([\w.-]+)['"],\s*name:\s*['"]([\w.-]+)['"],\s*version:\s*['"]([\w.-]+)['"]/,
    )
    if (mapMatch) {
      const [, configuration, group, name, version] = mapMatch
      return {
        configuration,
        group,
        name,
        version,
        notation: `${group}:${name}:${version}`,
        line: lineNumber,
      }
    }

    // Plugin notation
    const pluginMatch = cleanLine.match(
      /^id\s+['"]([\w.-]+)['"](?:\s+version\s+['"]([\w.-]+)['"])?/,
    )
    if (pluginMatch) {
      const [, id, version] = pluginMatch
      return {
        configuration: 'plugin',
        name: id,
        version: version || '',
        notation: version ? `${id}:${version}` : id,
        line: lineNumber,
      }
    }

    return null
  }

  /**
   * Parse Maven POM XML content (simplified)
   */
  private parseMavenPOM(content: string): MavenPOM {
    // This is a simplified XML parser - in production, use a proper XML library
    const pom: MavenPOM = {}

    try {
      // Extract basic project info
      const groupIdMatch = content.match(/<groupId>(.*?)<\/groupId>/)
      const artifactIdMatch = content.match(/<artifactId>(.*?)<\/artifactId>/)
      const versionMatch = content.match(/<version>(.*?)<\/version>/)

      if (groupIdMatch) pom.groupId = groupIdMatch[1]
      if (artifactIdMatch) pom.artifactId = artifactIdMatch[1]
      if (versionMatch) pom.version = versionMatch[1]

      // Extract dependencies (simplified)
      pom.dependencies = this.extractMavenDependencies(content, 'dependencies')

      // Extract dependency management
      const depMgmt = this.extractMavenDependencies(content, 'dependencyManagement')
      if (depMgmt.length > 0) {
        pom.dependencyManagement = {dependencies: depMgmt}
      }

      // Extract parent
      const parentMatch = content.match(/<parent>(.*?)<\/parent>/s)
      if (parentMatch) {
        const parentContent = parentMatch[1]
        const parentGroupId = parentContent.match(/<groupId>(.*?)<\/groupId>/)?.[1]
        const parentArtifactId = parentContent.match(/<artifactId>(.*?)<\/artifactId>/)?.[1]
        const parentVersion = parentContent.match(/<version>(.*?)<\/version>/)?.[1]

        if (parentGroupId && parentArtifactId && parentVersion) {
          pom.parent = {
            groupId: parentGroupId,
            artifactId: parentArtifactId,
            version: parentVersion,
          }
        }
      }

      // Extract plugins (simplified)
      const pluginsMatch = content.match(/<plugins>(.*?)<\/plugins>/s)
      if (pluginsMatch) {
        pom.build = {plugins: this.extractMavenPlugins(pluginsMatch[1])}
      }
    } catch (error) {
      console.warn(`Error parsing Maven POM: ${error}`)
    }

    return pom
  }

  /**
   * Extract Maven dependencies from XML content
   */
  private extractMavenDependencies(content: string, section: string): MavenCoordinate[] {
    const dependencies: MavenCoordinate[] = []

    const sectionMatch = content.match(new RegExp(`<${section}>(.*?)</${section}>`, 's'))
    if (!sectionMatch) return dependencies

    const sectionContent = sectionMatch[1]
    const dependencyMatches = sectionContent.matchAll(/<dependency>(.*?)<\/dependency>/gs)

    for (const depMatch of dependencyMatches) {
      const depContent = depMatch[1]
      const groupId = depContent.match(/<groupId>(.*?)<\/groupId>/)?.[1]
      const artifactId = depContent.match(/<artifactId>(.*?)<\/artifactId>/)?.[1]
      const version = depContent.match(/<version>(.*?)<\/version>/)?.[1]
      const scope = depContent.match(/<scope>(.*?)<\/scope>/)?.[1]

      if (groupId && artifactId) {
        dependencies.push({
          groupId,
          artifactId,
          version,
          scope,
        })
      }
    }

    return dependencies
  }

  /**
   * Extract Maven plugins from XML content
   */
  private extractMavenPlugins(
    content: string,
  ): {groupId?: string; artifactId?: string; version?: string}[] {
    const plugins: {groupId?: string; artifactId?: string; version?: string}[] = []

    const pluginMatches = content.matchAll(/<plugin>(.*?)<\/plugin>/gs)

    for (const pluginMatch of pluginMatches) {
      const pluginContent = pluginMatch[1]
      const groupId = pluginContent.match(/<groupId>(.*?)<\/groupId>/)?.[1]
      const artifactId = pluginContent.match(/<artifactId>(.*?)<\/artifactId>/)?.[1]
      const version = pluginContent.match(/<version>(.*?)<\/version>/)?.[1]

      if (artifactId) {
        plugins.push({groupId, artifactId, version})
      }
    }

    return plugins
  }

  /**
   * Parse a property line from .properties file
   */
  private parsePropertyLine(line: string): {key: string; value: string} | null {
    const cleanLine = line.trim()
    if (!cleanLine || cleanLine.startsWith('#') || cleanLine.startsWith('!')) {
      return null
    }

    const equalIndex = cleanLine.indexOf('=')
    const colonIndex = cleanLine.indexOf(':')

    let separatorIndex = -1
    if (equalIndex !== -1 && colonIndex !== -1) {
      separatorIndex = Math.min(equalIndex, colonIndex)
    } else if (equalIndex !== -1) {
      separatorIndex = equalIndex
    } else if (colonIndex !== -1) {
      separatorIndex = colonIndex
    }

    if (separatorIndex > 0) {
      const key = cleanLine.slice(0, separatorIndex).trim()
      const value = cleanLine.slice(separatorIndex + 1).trim()
      return {key, value}
    }

    return null
  }

  /**
   * Check if a property key represents a version
   */
  private isVersionProperty(key: string): boolean {
    const versionPatterns = [/version$/i, /\.version$/i, /Version$/, /_version$/i, /^version\./i]

    return versionPatterns.some(pattern => pattern.test(key))
  }

  /**
   * Compare Maven dependencies
   */
  private compareMavenDependencies(
    filename: string,
    oldDeps: MavenCoordinate[],
    newDeps: MavenCoordinate[],
  ): JVMDependencyChange[] {
    const changes: JVMDependencyChange[] = []

    for (const newDep of newDeps) {
      const oldDep = oldDeps.find(
        d => d.groupId === newDep.groupId && d.artifactId === newDep.artifactId,
      )

      if (oldDep && oldDep.version !== newDep.version) {
        const change: JVMDependencyChange = {
          name: `${newDep.groupId}:${newDep.artifactId}`,
          buildFile: filename,
          dependencyType: this.mapMavenScopeToJVMType(newDep.scope),
          currentVersion: oldDep.version,
          newVersion: newDep.version,
          currentCoordinate: `${oldDep.groupId}:${oldDep.artifactId}:${oldDep.version || ''}`,
          newCoordinate: `${newDep.groupId}:${newDep.artifactId}:${newDep.version || ''}`,
          manager: 'maven',
          updateType: this.determineUpdateType(oldDep.version, newDep.version),
          semverImpact: this.calculateSemverImpact(oldDep.version, newDep.version),
          isSecurityUpdate: this.isSecurityUpdate(
            newDep.artifactId,
            oldDep.version,
            newDep.version,
          ),
          isPlugin: false,
          groupId: newDep.groupId,
          artifactId: newDep.artifactId,
          scope: newDep.scope,
          isParent: false,
          isPropertyReference: this.isPropertyReference(newDep.version),
        }
        changes.push(change)
      }
    }

    return changes
  }

  /**
   * Compare Maven plugins
   */
  private compareMavenPlugins(
    filename: string,
    oldPlugins: {groupId?: string; artifactId?: string; version?: string}[],
    newPlugins: {groupId?: string; artifactId?: string; version?: string}[],
  ): JVMDependencyChange[] {
    const changes: JVMDependencyChange[] = []

    for (const newPlugin of newPlugins) {
      const oldPlugin = oldPlugins.find(
        p => p.groupId === newPlugin.groupId && p.artifactId === newPlugin.artifactId,
      )

      if (oldPlugin && oldPlugin.version !== newPlugin.version && newPlugin.version) {
        const change: JVMDependencyChange = {
          name: `${newPlugin.groupId || 'org.apache.maven.plugins'}:${newPlugin.artifactId}`,
          buildFile: filename,
          dependencyType: 'plugin',
          currentVersion: oldPlugin.version,
          newVersion: newPlugin.version,
          currentCoordinate: `${oldPlugin.groupId || ''}:${oldPlugin.artifactId}:${oldPlugin.version || ''}`,
          newCoordinate: `${newPlugin.groupId || ''}:${newPlugin.artifactId}:${newPlugin.version}`,
          manager: 'maven',
          updateType: this.determineUpdateType(oldPlugin.version, newPlugin.version),
          semverImpact: this.calculateSemverImpact(oldPlugin.version, newPlugin.version),
          isSecurityUpdate: this.isSecurityUpdate(
            newPlugin.artifactId || '',
            oldPlugin.version,
            newPlugin.version,
          ),
          isPlugin: true,
          groupId: newPlugin.groupId,
          artifactId: newPlugin.artifactId,
          isParent: false,
          isPropertyReference: this.isPropertyReference(newPlugin.version),
        }
        changes.push(change)
      }
    }

    return changes
  }

  /**
   * Create JVM dependency change from Gradle dependencies
   */
  private createJVMChange(
    filename: string,
    oldDep: GradleDependency,
    newDep: GradleDependency,
    manager: string,
    lineNumber: number,
  ): JVMDependencyChange {
    return {
      name: newDep.group ? `${newDep.group}:${newDep.name}` : newDep.name,
      buildFile: filename,
      dependencyType: this.mapGradleConfigurationToJVMType(newDep.configuration),
      currentVersion: oldDep.version,
      newVersion: newDep.version,
      currentCoordinate: oldDep.notation,
      newCoordinate: newDep.notation,
      manager: manager as RenovateManagerType,
      updateType: this.determineUpdateType(oldDep.version, newDep.version),
      semverImpact: this.calculateSemverImpact(oldDep.version, newDep.version),
      isSecurityUpdate: this.isSecurityUpdate(newDep.name, oldDep.version, newDep.version),
      isPlugin: newDep.configuration === 'plugin',
      line: lineNumber,
      groupId: newDep.group,
      artifactId: newDep.name,
      configuration: newDep.configuration,
      isParent: false,
      isPropertyReference: this.isPropertyReference(newDep.version),
    }
  }

  /**
   * Create Maven parent change
   */
  private createMavenParentChange(
    filename: string,
    oldParent: MavenCoordinate,
    newParent: MavenCoordinate,
  ): JVMDependencyChange {
    return {
      name: `${newParent.groupId}:${newParent.artifactId}`,
      buildFile: filename,
      dependencyType: 'parent',
      currentVersion: oldParent.version,
      newVersion: newParent.version,
      currentCoordinate: `${oldParent.groupId}:${oldParent.artifactId}:${oldParent.version || ''}`,
      newCoordinate: `${newParent.groupId}:${newParent.artifactId}:${newParent.version || ''}`,
      manager: 'maven',
      updateType: this.determineUpdateType(oldParent.version, newParent.version),
      semverImpact: this.calculateSemverImpact(oldParent.version, newParent.version),
      isSecurityUpdate: this.isSecurityUpdate(
        newParent.artifactId,
        oldParent.version,
        newParent.version,
      ),
      isPlugin: false,
      groupId: newParent.groupId,
      artifactId: newParent.artifactId,
      isParent: true,
      isPropertyReference: this.isPropertyReference(newParent.version),
    }
  }

  /**
   * Create property change
   */
  private createPropertyChange(
    filename: string,
    oldProp: {key: string; value: string},
    newProp: {key: string; value: string},
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
      manager: this.isGradleFile(filename) ? 'gradle' : 'maven',
      updateType: this.determineUpdateType(oldProp.value, newProp.value),
      semverImpact: this.calculateSemverImpact(oldProp.value, newProp.value),
      isSecurityUpdate: this.isSecurityUpdate(oldProp.key, oldProp.value, newProp.value),
      isPlugin: false,
      line: lineNumber,
      isParent: false,
      isPropertyReference: true,
    }
  }

  /**
   * Map Maven scope to JVM dependency type
   */
  private mapMavenScopeToJVMType(scope?: string): JVMDependencyType {
    switch (scope) {
      case 'test':
        return 'test'
      case 'provided':
        return 'provided'
      case 'runtime':
        return 'runtime'
      case 'system':
        return 'system'
      case 'compile':
      default:
        return 'compile'
    }
  }

  /**
   * Map Gradle configuration to JVM dependency type
   */
  private mapGradleConfigurationToJVMType(configuration: string): JVMDependencyType {
    switch (configuration) {
      case 'implementation':
        return 'implementation'
      case 'api':
        return 'api'
      case 'testImplementation':
        return 'testImplementation'
      case 'compileOnly':
        return 'compileOnly'
      case 'runtimeOnly':
        return 'runtimeOnly'
      case 'annotationProcessor':
        return 'annotationProcessor'
      case 'plugin':
        return 'plugin'
      default:
        return 'compile'
    }
  }

  /**
   * Check if version is a property reference
   */
  private isPropertyReference(version?: string): boolean {
    if (!version) return false
    return version.includes('${') || version.startsWith('$')
  }

  /**
   * Parse JVM version string into components
   */
  private parseJVMVersion(version: string): JVMVersion {
    const result: JVMVersion = {
      original: version,
      isSnapshot: version.includes('SNAPSHOT'),
      isRelease: version.includes('RELEASE'),
      isMilestone: version.includes('M'),
      isRC: version.includes('RC'),
    }

    // Basic semantic version parsing
    const match = version.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-.](.+))?$/)

    if (match) {
      const [, major, minor, patch, qualifier] = match

      if (major) result.major = Number.parseInt(major, 10)
      if (minor) result.minor = Number.parseInt(minor, 10)
      if (patch) result.patch = Number.parseInt(patch, 10)
      if (qualifier) result.qualifier = qualifier
    }

    return result
  }

  /**
   * Determine update type based on version change
   */
  private determineUpdateType(currentVersion?: string, newVersion?: string): RenovateUpdateType {
    if (!currentVersion || !newVersion) return 'patch'

    const current = this.parseJVMVersion(currentVersion)
    const updated = this.parseJVMVersion(newVersion)

    // Compare major.minor.patch
    if (current.major !== updated.major) return 'major'
    if (current.minor !== updated.minor) return 'minor'
    if (current.patch !== updated.patch) return 'patch'

    // Check for qualifier changes
    if (current.qualifier !== updated.qualifier) return 'patch'

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
  private deduplicateChanges(changes: JVMDependencyChange[]): JVMDependencyChange[] {
    const seen = new Set<string>()
    return changes.filter(change => {
      const key = `${change.name}:${change.buildFile}:${change.currentVersion}:${change.newVersion}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
  }
}
