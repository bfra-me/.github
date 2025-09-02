import type {Octokit} from '@octokit/rest'
import {minimatch} from 'minimatch'

/**
 * Renovate manager types that the parser can detect
 */
export type RenovateManagerType =
  | 'npm'
  | 'pnpm'
  | 'yarn'
  | 'lockfile'
  | 'github-actions'
  | 'docker'
  | 'dockerfile'
  | 'docker-compose'
  | 'pip'
  | 'pipenv'
  | 'gradle'
  | 'maven'
  | 'go'
  | 'nuget'
  | 'composer'
  | 'cargo'
  | 'helm'
  | 'terraform'
  | 'ansible'
  | 'pre-commit'
  | 'gitlabci'
  | 'circleci'
  | 'unknown'

/**
 * Types of Renovate updates
 */
export type RenovateUpdateType =
  | 'major'
  | 'minor'
  | 'patch'
  | 'pin'
  | 'digest'
  | 'lockfile'
  | 'rollback'
  | 'replacement'

/**
 * Renovate security classification
 */
export type RenovateSecurityType = 'low' | 'moderate' | 'high' | 'critical' | null

/**
 * Parsed dependency information
 */
export interface RenovateDependency {
  name: string
  currentVersion?: string
  newVersion?: string
  manager: RenovateManagerType
  updateType: RenovateUpdateType
  isSecurityUpdate: boolean
  securitySeverity?: RenovateSecurityType
  isGrouped: boolean
  groupName?: string
  packageFile?: string
  scope?: string
}

/**
 * Parsed Renovate PR context
 */
export interface RenovatePRContext {
  dependencies: RenovateDependency[]
  isRenovateBot: boolean
  branchName: string
  prTitle: string
  prBody: string
  commitMessages: string[]
  isGroupedUpdate: boolean
  isSecurityUpdate: boolean
  updateType: RenovateUpdateType
  manager: RenovateManagerType
  files: {filename: string; status: string; additions: number; deletions: number}[]
}

/**
 * Conventional commit information
 */
export interface ConventionalCommit {
  type: string
  scope?: string
  description: string
  body?: string
  footer?: string
  isBreaking: boolean
  renovateInfo?: {
    manager: RenovateManagerType
    dependencies: string[]
    updateType: RenovateUpdateType
  }
}

/**
 * Branch pattern configurations for Renovate detection
 */
export interface BranchPatterns {
  renovate: string[]
  dependabot: string[]
  custom: string[]
}

/**
 * Advanced Renovate parser for sophisticated context detection
 */
export class RenovateParser {
  private branchPatterns: BranchPatterns

  constructor(customBranchPatterns?: Partial<BranchPatterns>) {
    this.branchPatterns = {
      renovate: [
        'renovate/**',
        'renovate/*',
        'chore/renovate-**',
        'chore/update-**',
        'deps/renovate-**',
        'update/**',
        'bump/**',
      ],
      dependabot: ['dependabot/**', 'dependabot/*'],
      custom: customBranchPatterns?.custom || [],
      ...customBranchPatterns,
    }
  }

  /**
   * TASK-007: Enhanced Renovate branch name pattern detection
   */
  isRenovateBranch(branchName: string): boolean {
    const allPatterns = [
      ...this.branchPatterns.renovate,
      ...this.branchPatterns.dependabot,
      ...this.branchPatterns.custom,
    ]

    return allPatterns.some(pattern => minimatch(branchName, pattern, {dot: true}))
  }

  /**
   * Get the specific branch type (renovate, dependabot, custom)
   */
  getBranchType(branchName: string): 'renovate' | 'dependabot' | 'custom' | 'unknown' {
    if (this.branchPatterns.renovate.some(pattern => minimatch(branchName, pattern, {dot: true}))) {
      return 'renovate'
    }
    if (
      this.branchPatterns.dependabot.some(pattern => minimatch(branchName, pattern, {dot: true}))
    ) {
      return 'dependabot'
    }
    if (this.branchPatterns.custom.some(pattern => minimatch(branchName, pattern, {dot: true}))) {
      return 'custom'
    }
    return 'unknown'
  }

  /**
   * TASK-008: Parse Renovate commit message formats using latest patterns
   */
  parseCommitMessage(commitMessage: string): ConventionalCommit {
    // Extract conventional commit pattern: type(scope): description
    const conventionalPattern =
      /^(?<type>\w+)(?:\((?<scope>[^)]+)\))?: (?<description>.+)(?:\n\n(?<body>[\s\S]*?))?$/m

    const match = commitMessage.match(conventionalPattern)

    if (!match?.groups) {
      // Fallback parsing for non-conventional commits
      return {
        type: 'chore',
        description: commitMessage.split('\n')[0] || commitMessage,
        body: commitMessage.includes('\n')
          ? commitMessage.split('\n').slice(1).join('\n')
          : undefined,
        isBreaking: commitMessage.includes('BREAKING CHANGE'),
      }
    }

    const type = match.groups.type ?? 'chore'
    const scope = match.groups.scope
    const description = match.groups.description ?? ''
    const body = match.groups.body
    const isBreaking =
      commitMessage.includes('BREAKING CHANGE') || (description?.startsWith('!') ?? false)

    // Parse Renovate-specific information from commit message
    const renovateInfo = this.extractRenovateInfoFromCommit(commitMessage, scope)

    return {
      type,
      scope,
      description: description.replace(/^!/, ''), // Remove breaking change indicator
      body,
      isBreaking,
      renovateInfo,
    }
  }

  /**
   * Extract Renovate-specific information from commit messages
   */
  private extractRenovateInfoFromCommit(
    commitMessage: string,
    scope?: string,
  ): ConventionalCommit['renovateInfo'] {
    // Detect manager from scope or commit content
    const manager =
      this.detectManagerFromScope(scope) || this.detectManagerFromCommit(commitMessage)

    // Extract dependencies from commit message
    const dependencies = this.extractDependenciesFromCommit(commitMessage)

    // Detect update type
    const updateType = this.detectUpdateTypeFromCommit(commitMessage)

    if (manager !== 'unknown' || dependencies.length > 0) {
      return {
        manager,
        dependencies,
        updateType,
      }
    }

    return undefined
  }

  /**
   * TASK-010: Implement manager type detection from various sources
   */
  detectManagerFromScope(scope?: string): RenovateManagerType {
    if (!scope) return 'unknown'

    const scopeLower = scope.toLowerCase()

    // Direct manager name mapping
    const managerMap: Record<string, RenovateManagerType> = {
      npm: 'npm',
      pnpm: 'pnpm',
      yarn: 'yarn',
      'lock-file': 'lockfile',
      lockfile: 'lockfile',
      'github-actions': 'github-actions',
      actions: 'github-actions',
      docker: 'docker',
      dockerfile: 'dockerfile',
      'docker-compose': 'docker-compose',
      pip: 'pip',
      pipenv: 'pipenv',
      gradle: 'gradle',
      maven: 'maven',
      go: 'go',
      nuget: 'nuget',
      composer: 'composer',
      cargo: 'cargo',
      helm: 'helm',
      terraform: 'terraform',
      ansible: 'ansible',
      'pre-commit': 'pre-commit',
      gitlabci: 'gitlabci',
      circleci: 'circleci',
    }

    return managerMap[scopeLower] || 'unknown'
  }

  /**
   * Detect manager type from commit message content
   */
  private detectManagerFromCommit(commitMessage: string): RenovateManagerType {
    const messageLower = commitMessage.toLowerCase()

    // Look for manager-specific keywords
    if (messageLower.includes('package.json') || messageLower.includes('npm')) return 'npm'
    if (messageLower.includes('pnpm-lock.yaml') || messageLower.includes('pnpm')) return 'pnpm'
    if (messageLower.includes('yarn.lock') || messageLower.includes('yarn')) return 'yarn'
    if (messageLower.includes('lock file') || messageLower.includes('lockfile')) return 'lockfile'
    if (messageLower.includes('github action') || messageLower.includes('.github/workflows'))
      return 'github-actions'
    if (messageLower.includes('dockerfile') || messageLower.includes('docker image'))
      return 'docker'
    if (messageLower.includes('docker-compose')) return 'docker-compose'
    if (messageLower.includes('requirements.txt') || messageLower.includes('pip')) return 'pip'
    if (messageLower.includes('pipfile') || messageLower.includes('pipenv')) return 'pipenv'
    if (messageLower.includes('build.gradle') || messageLower.includes('gradle')) return 'gradle'
    if (messageLower.includes('pom.xml') || messageLower.includes('maven')) return 'maven'
    if (messageLower.includes('go.mod') || messageLower.includes('go module')) return 'go'
    if (messageLower.includes('.csproj') || messageLower.includes('nuget')) return 'nuget'
    if (messageLower.includes('composer.json') || messageLower.includes('composer'))
      return 'composer'
    if (messageLower.includes('cargo.toml') || messageLower.includes('cargo')) return 'cargo'
    if (messageLower.includes('chart.yaml') || messageLower.includes('helm')) return 'helm'
    if (messageLower.includes('.tf') || messageLower.includes('terraform')) return 'terraform'
    if (messageLower.includes('ansible')) return 'ansible'
    if (messageLower.includes('pre-commit')) return 'pre-commit'
    if (messageLower.includes('.gitlab-ci.yml')) return 'gitlabci'
    if (messageLower.includes('circle')) return 'circleci'

    return 'unknown'
  }

  /**
   * Extract dependency names from commit message
   */
  private extractDependenciesFromCommit(commitMessage: string): string[] {
    const dependencies: string[] = []

    // Patterns for dependency extraction
    const patterns = [
      /update (?:dependency )?([@\w/.-]+)/gi, // "update dependency name" or "update name"
      /bump ([@\w/.-]+)/gi, // "bump name"
      /upgrade ([@\w/.-]+)/gi, // "upgrade name"
      /\[([@\w/.-]+)\]/g, // [dependency-name]
    ]

    for (const pattern of patterns) {
      let match = pattern.exec(commitMessage)
      while (match !== null) {
        if (match[1] && !dependencies.includes(match[1])) {
          dependencies.push(match[1])
        }
        match = pattern.exec(commitMessage)
      }
    }

    return dependencies
  }

  /**
   * Detect update type from commit message
   */
  private detectUpdateTypeFromCommit(commitMessage: string): RenovateUpdateType {
    const messageLower = commitMessage.toLowerCase()

    if (messageLower.includes('major')) return 'major'
    if (messageLower.includes('minor')) return 'minor'
    if (messageLower.includes('patch')) return 'patch'
    if (messageLower.includes('pin')) return 'pin'
    if (messageLower.includes('digest')) return 'digest'
    if (messageLower.includes('lock') || messageLower.includes('lockfile')) return 'lockfile'
    if (messageLower.includes('rollback') || messageLower.includes('revert')) return 'rollback'
    if (messageLower.includes('replace')) return 'replacement'

    // Default to patch for regular updates
    return 'patch'
  }

  /**
   * TASK-009: Extract comprehensive dependency information from GitHub PR context
   */
  async extractPRContext(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    prData: any,
  ): Promise<RenovatePRContext> {
    // Get PR files
    const {data: files} = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
    })

    // Get commit messages
    const {data: commits} = await octokit.rest.pulls.listCommits({
      owner,
      repo,
      pull_number: prNumber,
    })

    const commitMessages = commits.map(commit => commit.commit.message)

    // Parse each commit for Renovate information
    const allDependencies: RenovateDependency[] = []
    let isGroupedUpdate = false
    let isSecurityUpdate = false
    let detectedManager: RenovateManagerType = 'unknown'
    let detectedUpdateType: RenovateUpdateType = 'patch'

    for (const commitMessage of commitMessages) {
      const parsedCommit = this.parseCommitMessage(commitMessage)
      if (parsedCommit.renovateInfo) {
        const deps = this.extractDependenciesFromPR(
          prData.title,
          prData.body || '',
          commitMessage,
          files,
          parsedCommit.renovateInfo.manager,
        )
        allDependencies.push(...deps)

        if (parsedCommit.renovateInfo.manager !== 'unknown') {
          detectedManager = parsedCommit.renovateInfo.manager
        }
        detectedUpdateType = parsedCommit.renovateInfo.updateType
      }

      // Check for security indicators
      if (
        commitMessage.toLowerCase().includes('security') ||
        commitMessage.toLowerCase().includes('vulnerability') ||
        commitMessage.toLowerCase().includes('cve-')
      ) {
        isSecurityUpdate = true
      }

      // Check for grouped update indicators
      if (
        commitMessage.toLowerCase().includes('group') ||
        prData.title.toLowerCase().includes('group') ||
        allDependencies.length > 1
      ) {
        isGroupedUpdate = true
      }
    }

    // Fallback dependency extraction from PR title and body
    if (allDependencies.length === 0) {
      const fallbackDeps = this.extractDependenciesFromPR(
        prData.title,
        prData.body || '',
        '',
        files,
        detectedManager,
      )
      allDependencies.push(...fallbackDeps)
    }

    return {
      dependencies: allDependencies,
      isRenovateBot: ['renovate[bot]', 'bfra-me[bot]', 'dependabot[bot]'].includes(
        prData.user.login,
      ),
      branchName: prData.head?.ref || '',
      prTitle: prData.title,
      prBody: prData.body || '',
      commitMessages,
      isGroupedUpdate,
      isSecurityUpdate,
      updateType: detectedUpdateType,
      manager: detectedManager,
      files: files.map(file => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
      })),
    }
  }

  /**
   * Extract dependencies from PR title, body, and file changes
   */
  private extractDependenciesFromPR(
    prTitle: string,
    prBody: string,
    commitMessage: string,
    files: {filename: string; status: string; additions?: number; deletions?: number}[],
    manager: RenovateManagerType,
  ): RenovateDependency[] {
    const dependencies: RenovateDependency[] = []

    // Extract from PR title
    const titleDeps = this.parseDependenciesFromText(prTitle, manager)
    dependencies.push(...titleDeps)

    // Extract from PR body
    const bodyDeps = this.parseDependenciesFromText(prBody, manager)
    dependencies.push(...bodyDeps)

    // Extract from commit message if provided
    if (commitMessage) {
      const commitDeps = this.parseDependenciesFromText(commitMessage, manager)
      dependencies.push(...commitDeps)
    }

    // TASK-013: Extract version changes from file diffs
    const fileDeps = this.extractDependenciesFromFiles(files, manager)
    dependencies.push(...fileDeps)

    // Deduplicate dependencies by name
    const uniqueDeps = dependencies.reduce((acc, dep) => {
      const existing = acc.find(d => d.name === dep.name && d.manager === dep.manager)
      if (existing) {
        // Merge information, preferring non-empty values
        existing.currentVersion = existing.currentVersion || dep.currentVersion
        existing.newVersion = existing.newVersion || dep.newVersion
        existing.packageFile = existing.packageFile || dep.packageFile
        existing.scope = existing.scope || dep.scope
        if (dep.isSecurityUpdate) existing.isSecurityUpdate = true
        if (dep.isGrouped) existing.isGrouped = true
        if (dep.groupName) existing.groupName = dep.groupName
        if (dep.securitySeverity && !existing.securitySeverity) {
          existing.securitySeverity = dep.securitySeverity
        }
      } else {
        acc.push(dep)
      }
      return acc
    }, [] as RenovateDependency[])

    return uniqueDeps
  }

  /**
   * Parse dependencies from text content (PR title, body, commit message)
   */
  private parseDependenciesFromText(
    text: string,
    defaultManager: RenovateManagerType,
  ): RenovateDependency[] {
    const dependencies: RenovateDependency[] = []

    // Enhanced patterns for dependency extraction
    const patterns = [
      // "update dependency @scope/package to v1.2.3"
      /update\s+(?:dependency\s+)?(@?\w[\w./%-]*)\s+(?:to\s+)?v?(\d+\.\d+\.\d+(?:-[\w.]+)?)/gi,
      // "bump @scope/package from 1.0.0 to 1.1.0"
      /bump\s+(@?\w[\w./%-]*)\s+from\s+v?(\d+\.\d+\.\d+(?:-[\w.]+)?)\s+to\s+v?(\d+\.\d+\.\d+(?:-[\w.]+)?)/gi,
      // "upgrade @scope/package (1.0.0 → 1.1.0)"
      /upgrade\s+(@?\w[\w./%-]*)\s*\(v?(\d+\.\d+\.\d+(?:-[\w.]+)?)\s*→\s*v?(\d+\.\d+\.\d+(?:-[\w.]+)?)\)/gi,
      // "@scope/package (1.0.0 → 1.1.0)" in release notes
      /(@?\w[\w./%-]*)\s*\(v?(\d+\.\d+\.\d+(?:-[\w.]+)?)\s*→\s*v?(\d+\.\d+\.\d+(?:-[\w.]+)?)\)/gi,
    ]

    for (const pattern of patterns) {
      let match = pattern.exec(text)
      while (match !== null) {
        const [, name, version1, version2] = match
        if (name) {
          const dependency: RenovateDependency = {
            name,
            currentVersion: version2 ? version1 : undefined,
            newVersion: version2 || version1,
            manager: this.detectManagerFromDependencyName(name) || defaultManager,
            updateType: this.detectUpdateTypeFromVersions(version1, version2),
            isSecurityUpdate: this.isSecurityUpdate(text, name),
            isGrouped: this.isGroupedUpdate(text),
            groupName: this.extractGroupName(text),
            scope: this.extractScope(name),
          }

          if (dependency.isSecurityUpdate) {
            dependency.securitySeverity = this.extractSecuritySeverity(text)
          }

          dependencies.push(dependency)
        }
        match = pattern.exec(text)
      }
    }

    return dependencies
  }

  /**
   * TASK-013: Extract dependencies from file changes
   */
  private extractDependenciesFromFiles(
    files: {filename: string; status: string; additions?: number; deletions?: number}[],
    defaultManager: RenovateManagerType,
  ): RenovateDependency[] {
    const dependencies: RenovateDependency[] = []

    for (const file of files) {
      const manager = this.detectManagerFromFilename(file.filename)
      if (manager !== 'unknown') {
        // For now, create a basic dependency entry for the file
        // In a real implementation, we'd parse the file diff to extract specific changes
        const packageName = this.extractPackageNameFromFilename(file.filename)
        if (packageName) {
          dependencies.push({
            name: packageName,
            manager: manager || defaultManager,
            updateType: 'patch',
            isSecurityUpdate: false,
            isGrouped: false,
            packageFile: file.filename,
          })
        }
      }
    }

    return dependencies
  }

  /**
   * Detect manager type from filename
   */
  private detectManagerFromFilename(filename: string): RenovateManagerType {
    const filenameLower = filename.toLowerCase()

    if (filenameLower.includes('package.json')) return 'npm'
    if (filenameLower.includes('pnpm-lock.yaml')) return 'pnpm'
    if (filenameLower.includes('yarn.lock')) return 'yarn'
    if (filenameLower.includes('package-lock.json')) return 'lockfile'
    if (filenameLower.includes('.github/workflows/')) return 'github-actions'
    if (filenameLower.includes('dockerfile')) return 'dockerfile'
    if (filenameLower.includes('docker-compose')) return 'docker-compose'
    if (filenameLower.includes('requirements.txt') || filenameLower.includes('.py')) return 'pip'
    if (filenameLower.includes('pipfile')) return 'pipenv'
    if (filenameLower.includes('build.gradle') || filenameLower.includes('.gradle')) return 'gradle'
    if (filenameLower.includes('pom.xml')) return 'maven'
    if (filenameLower.includes('go.mod') || filenameLower.includes('go.sum')) return 'go'
    if (filenameLower.includes('.csproj') || filenameLower.includes('.nuspec')) return 'nuget'
    if (filenameLower.includes('composer.json')) return 'composer'
    if (filenameLower.includes('cargo.toml') || filenameLower.includes('cargo.lock')) return 'cargo'
    if (filenameLower.includes('chart.yaml') || filenameLower.includes('values.yaml')) return 'helm'
    if (filenameLower.includes('.tf') || filenameLower.includes('.hcl')) return 'terraform'
    if (filenameLower.includes('ansible')) return 'ansible'
    if (filenameLower.includes('.pre-commit-config.yaml')) return 'pre-commit'
    if (filenameLower.includes('.gitlab-ci.yml')) return 'gitlabci'
    if (filenameLower.includes('.circleci/config.yml')) return 'circleci'

    return 'unknown'
  }

  /**
   * Extract package name from filename
   */
  private extractPackageNameFromFilename(filename: string): string | undefined {
    // For package.json files, we'd need to parse the content to get the name
    // For now, return a generic name based on the file type
    const manager = this.detectManagerFromFilename(filename)
    if (manager !== 'unknown') {
      return `${manager}-dependencies`
    }
    return undefined
  }

  /**
   * Detect manager from dependency name patterns
   */
  private detectManagerFromDependencyName(name: string): RenovateManagerType | undefined {
    if (name.startsWith('@types/')) return 'npm'
    if (name.startsWith('@')) return 'npm' // Scoped npm packages
    if (name.includes('/')) {
      // Could be Docker image or scoped package
      if (name.includes(':')) return 'docker'
      return 'npm'
    }
    return undefined
  }

  /**
   * Detect update type from version comparison
   */
  private detectUpdateTypeFromVersions(version1?: string, version2?: string): RenovateUpdateType {
    // If either version is missing or unparsable, treat as patch
    if (!version1 || !version2) return 'patch'

    // Parse semantic versions
    const parseVersion = (v: string) => {
      const match = v.match(/^v?(\d+)\.(\d+)\.(\d+)/)
      if (!match) return null
      const [, majorStr, minorStr, patchStr] = match
      if (!majorStr || !minorStr || !patchStr) return null
      return {
        major: Number.parseInt(majorStr, 10),
        minor: Number.parseInt(minorStr, 10),
        patch: Number.parseInt(patchStr, 10),
      }
    }

    const oldVer = parseVersion(version1)
    const newVer = parseVersion(version2)

    if (!oldVer || !newVer) return 'patch'

    if (newVer.major > oldVer.major) return 'major'
    if (newVer.minor > oldVer.minor) return 'minor'
    return 'patch'
  }

  /**
   * TASK-011: Detect security updates
   */
  private isSecurityUpdate(text: string, _dependencyName: string): boolean {
    const textLower = text.toLowerCase()
    return (
      textLower.includes('security') ||
      textLower.includes('vulnerability') ||
      textLower.includes('cve-') ||
      textLower.includes('exploit') ||
      textLower.includes('malicious') ||
      textLower.includes('advisory') ||
      textLower.includes('critical') ||
      textLower.includes('high severity')
    )
  }

  /**
   * TASK-011: Detect grouped updates
   */
  private isGroupedUpdate(text: string): boolean {
    const textLower = text.toLowerCase()
    return (
      textLower.includes('group') ||
      textLower.includes('multiple') ||
      textLower.includes('batch') ||
      textLower.includes('bundle') ||
      textLower.includes('all dependencies') ||
      textLower.includes('dependency group')
    )
  }

  /**
   * Extract group name from text
   */
  private extractGroupName(text: string): string | undefined {
    const groupMatch = text.match(/group[:\s]+([\w\s-]+)/i)
    return groupMatch?.[1]?.trim()
  }

  /**
   * Extract security severity from text
   */
  private extractSecuritySeverity(text: string): RenovateSecurityType {
    const textLower = text.toLowerCase()
    if (textLower.includes('critical')) return 'critical'
    if (textLower.includes('high')) return 'high'
    if (textLower.includes('moderate') || textLower.includes('medium')) return 'moderate'
    if (textLower.includes('low')) return 'low'
    return null
  }

  /**
   * Extract scope from dependency name
   */
  private extractScope(dependencyName: string): string | undefined {
    if (dependencyName.startsWith('@')) {
      const parts = dependencyName.split('/')
      return parts[0]?.slice(1) // Remove @ prefix
    }
    return undefined
  }

  /**
   * TASK-012: Parse semantic commit with enhanced scope detection
   */
  parseSemanticCommit(commitMessage: string): ConventionalCommit {
    return this.parseCommitMessage(commitMessage)
  }

  /**
   * Get all supported manager types
   */
  getSupportedManagers(): RenovateManagerType[] {
    return [
      'npm',
      'pnpm',
      'yarn',
      'lockfile',
      'github-actions',
      'docker',
      'dockerfile',
      'docker-compose',
      'pip',
      'pipenv',
      'gradle',
      'maven',
      'go',
      'nuget',
      'composer',
      'cargo',
      'helm',
      'terraform',
      'ansible',
      'pre-commit',
      'gitlabci',
      'circleci',
    ]
  }

  /**
   * Validate if a manager type is supported
   */
  isManagerSupported(manager: string): manager is RenovateManagerType {
    return this.getSupportedManagers().includes(manager as RenovateManagerType)
  }
}
