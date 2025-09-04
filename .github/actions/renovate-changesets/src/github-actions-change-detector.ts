import type {Octokit} from '@octokit/rest'
import type {RenovateManagerType, RenovateUpdateType} from './renovate-parser.js'
import {Buffer} from 'node:buffer'
import {promises as fs} from 'node:fs'
import path from 'node:path'
import {load} from 'js-yaml'

/**
 * GitHub Actions action reference structure
 */
export interface ActionReference {
  /** Action name (e.g., 'actions/checkout') */
  name: string
  /** Version or reference (e.g., 'v5.0.0', 'main', commit SHA) */
  ref: string
  /** Original uses statement */
  uses: string
  /** Line number in the workflow file */
  line?: number
  /** Step name if available */
  stepName?: string
  /** Inline version comment if present (e.g., # v5.0.0) */
  inlineVersion?: string
}

/**
 * Workflow file structure for parsing
 */
export interface WorkflowFile {
  /** Workflow name */
  name?: string
  /** Trigger events */
  on?: any
  /** Jobs definition */
  jobs?: Record<string, WorkflowJob>
  [key: string]: any
}

/**
 * Workflow job structure
 */
export interface WorkflowJob {
  /** Job name */
  name?: string
  /** Steps in the job */
  steps?: WorkflowStep[]
  /** Uses reference for reusable workflows */
  uses?: string
  [key: string]: any
}

/**
 * Workflow step structure
 */
export interface WorkflowStep {
  /** Step name */
  name?: string
  /** Action to use */
  uses?: string
  /** Run command */
  run?: string
  /** Step inputs */
  with?: Record<string, any>
  [key: string]: any
}

/**
 * GitHub Actions dependency change
 */
export interface GitHubActionsDependencyChange {
  name: string
  workflowFile: string
  currentRef?: string
  newRef?: string
  manager: RenovateManagerType
  updateType: RenovateUpdateType
  semverImpact: 'major' | 'minor' | 'patch' | 'prerelease' | 'none'
  isSecurityUpdate: boolean
  scope?: string
  stepName?: string
  line?: number
  isReusableWorkflow: boolean
  inlineVersionComment?: string
}

/**
 * Semver version components for GitHub Actions
 */
interface ActionVersion {
  major?: number
  minor?: number
  patch?: number
  prerelease?: string
  build?: string
  original: string
  isCommitSha: boolean
  isBranch: boolean
  isTag: boolean
}

/**
 * TASK-015: GitHub Actions workflow dependency change detection
 *
 * This class provides sophisticated analysis of GitHub Actions dependency changes by parsing
 * workflow YAML files and performing version impact assessment for action references.
 */
export class GitHubActionsChangeDetector {
  /**
   * Detect GitHub Actions dependency changes from GitHub PR files
   */
  async detectChangesFromPR(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    files: {filename: string; status: string; additions: number; deletions: number}[],
  ): Promise<GitHubActionsDependencyChange[]> {
    const changes: GitHubActionsDependencyChange[] = []

    // Find all GitHub Actions workflow files that changed
    const workflowFiles = files.filter(file => this.isGitHubActionsFile(file.filename))

    for (const file of workflowFiles) {
      const fileChanges = await this.analyzeFileChanges(octokit, owner, repo, prNumber, file)
      changes.push(...fileChanges)
    }

    return this.deduplicateChanges(changes)
  }

  /**
   * Detect GitHub Actions dependency changes from local file system
   */
  async detectChangesFromFiles(
    workingDirectory: string,
    changedFiles: string[],
  ): Promise<GitHubActionsDependencyChange[]> {
    const changes: GitHubActionsDependencyChange[] = []

    // Find all GitHub Actions workflow files that changed
    const workflowFiles = changedFiles.filter(file => this.isGitHubActionsFile(file))

    for (const file of workflowFiles) {
      const fileChanges = await this.analyzeLocalFileChanges(workingDirectory, file)
      changes.push(...fileChanges)
    }

    return this.deduplicateChanges(changes)
  }

  /**
   * Check if a file is a GitHub Actions workflow file
   */
  private isGitHubActionsFile(filename: string): boolean {
    const workflowPatterns = ['.github/workflows/', '.github/actions/']

    const extensions = ['.yaml', '.yml']

    return (
      workflowPatterns.some(pattern => filename.includes(pattern)) &&
      extensions.some(ext => filename.endsWith(ext))
    )
  }

  /**
   * Analyze changes in a specific workflow file from GitHub PR
   */
  private async analyzeFileChanges(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    file: {filename: string; status: string; additions: number; deletions: number},
  ): Promise<GitHubActionsDependencyChange[]> {
    const changes: GitHubActionsDependencyChange[] = []

    try {
      // Get file content from both base and head commits
      const prData = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      })

      const baseContent = await this.getFileContent(
        octokit,
        owner,
        repo,
        file.filename,
        prData.data.base.sha,
      )
      const headContent = await this.getFileContent(
        octokit,
        owner,
        repo,
        file.filename,
        prData.data.head.sha,
      )

      if (!baseContent && !headContent) {
        return changes
      }

      // Parse action references from both versions
      const baseActions = baseContent
        ? await this.parseActionReferences(baseContent, file.filename)
        : []
      const headActions = headContent
        ? await this.parseActionReferences(headContent, file.filename)
        : []

      // Compare and detect changes
      const actionChanges = this.compareActionReferences(baseActions, headActions, file.filename)
      changes.push(...actionChanges)
    } catch (error) {
      console.warn(`Failed to analyze GitHub Actions file ${file.filename}:`, error)
    }

    return changes
  }

  /**
   * Analyze changes in a local workflow file (for local development)
   */
  private async analyzeLocalFileChanges(
    workingDirectory: string,
    filename: string,
  ): Promise<GitHubActionsDependencyChange[]> {
    const changes: GitHubActionsDependencyChange[] = []

    try {
      const fullPath = path.join(workingDirectory, filename)
      const content = await fs.readFile(fullPath, 'utf8')

      // For local analysis, we can only parse current state
      // Real change detection would need git integration
      const actions = await this.parseActionReferences(content, filename)

      // Convert to changes (simplified for local testing)
      for (const action of actions) {
        const change: GitHubActionsDependencyChange = {
          name: action.name,
          workflowFile: filename,
          newRef: action.ref,
          manager: 'github-actions',
          updateType: this.determineUpdateType(action.name, undefined, action.ref),
          semverImpact: this.calculateSemverImpact(undefined, action.ref),
          isSecurityUpdate: this.isSecurityRelatedAction(action.name),
          stepName: action.stepName,
          line: action.line,
          isReusableWorkflow: this.isReusableWorkflow(action.uses),
          inlineVersionComment: action.inlineVersion,
        }
        changes.push(change)
      }
    } catch (error) {
      console.warn(`Failed to analyze local GitHub Actions file ${filename}:`, error)
    }

    return changes
  }

  /**
   * Get file content from GitHub at a specific commit
   */
  private async getFileContent(
    octokit: Octokit,
    owner: string,
    repo: string,
    path: string,
    ref: string,
  ): Promise<string | null> {
    try {
      const response = await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref,
      })

      if ('content' in response.data && response.data.content) {
        return Buffer.from(response.data.content, 'base64').toString('utf8')
      }
    } catch (error: any) {
      // File might not exist in this version
      if (error.status === 404) {
        return null
      }
      throw error
    }

    return null
  }

  /**
   * Parse action references from workflow YAML content
   */
  private async parseActionReferences(
    content: string,
    filename: string,
  ): Promise<ActionReference[]> {
    const actions: ActionReference[] = []

    try {
      const workflow = load(content) as WorkflowFile

      if (!workflow || typeof workflow !== 'object') {
        return actions
      }

      // Parse jobs for action references
      if (workflow.jobs && typeof workflow.jobs === 'object') {
        for (const [jobId, job] of Object.entries(workflow.jobs)) {
          // Check for reusable workflow calls
          if (job.uses && typeof job.uses === 'string') {
            const actionRef = this.parseActionUses(job.uses, jobId)
            if (actionRef) {
              actions.push(actionRef)
            }
          }

          // Check job steps for action uses
          if (job.steps && Array.isArray(job.steps)) {
            for (const [stepIndex, step] of job.steps.entries()) {
              if (step.uses && typeof step.uses === 'string') {
                const actionRef = this.parseActionUses(
                  step.uses,
                  step.name || `${jobId}-step-${stepIndex}`,
                )
                if (actionRef) {
                  actions.push(actionRef)
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to parse workflow YAML in ${filename}:`, error)
    }

    return actions
  }

  /**
   * Parse a single action 'uses' statement
   */
  private parseActionUses(uses: string, stepName: string): ActionReference | null {
    // Skip local actions (starting with ./)
    if (uses.startsWith('./')) {
      return null
    }

    // Parse action reference: owner/action@ref or owner/action/subaction@ref
    const match = uses.match(/^([^@]+)@(.+)$/)
    if (!match || !match[1] || !match[2]) {
      return null
    }

    const [, name, fullRef] = match

    // Extract inline version comment if present
    const commentMatch = uses.match(/#\s*(v?[\d.]+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?)/)
    const inlineVersion = commentMatch ? commentMatch[1] : undefined

    // Clean the ref by removing any comment part
    const ref = fullRef.split('#')[0].trim()

    return {
      name: name.trim(),
      ref,
      uses,
      stepName,
      inlineVersion,
    }
  }

  /**
   * Compare action references between base and head to detect changes
   */
  private compareActionReferences(
    baseActions: ActionReference[],
    headActions: ActionReference[],
    filename: string,
  ): GitHubActionsDependencyChange[] {
    const changes: GitHubActionsDependencyChange[] = []

    // Create maps for easier comparison
    const baseMap = new Map<string, ActionReference>()
    const headMap = new Map<string, ActionReference>()

    // Key format: "actionName:stepName" to handle same action used multiple times
    for (const action of baseActions) {
      const key = `${action.name}:${action.stepName || 'unknown'}`
      baseMap.set(key, action)
    }

    for (const action of headActions) {
      const key = `${action.name}:${action.stepName || 'unknown'}`
      headMap.set(key, action)
    }

    // Find changed actions
    for (const [key, headAction] of headMap) {
      const baseAction = baseMap.get(key)

      if (!baseAction) {
        // New action added
        const change: GitHubActionsDependencyChange = {
          name: headAction.name,
          workflowFile: filename,
          newRef: headAction.ref,
          manager: 'github-actions',
          updateType: 'minor', // Adding new action is usually minor
          semverImpact: 'minor',
          isSecurityUpdate: this.isSecurityRelatedAction(headAction.name),
          stepName: headAction.stepName,
          line: headAction.line,
          isReusableWorkflow: this.isReusableWorkflow(headAction.uses),
          inlineVersionComment: headAction.inlineVersion,
        }
        changes.push(change)
      } else if (baseAction.ref !== headAction.ref) {
        // Action reference changed
        const change: GitHubActionsDependencyChange = {
          name: headAction.name,
          workflowFile: filename,
          currentRef: baseAction.ref,
          newRef: headAction.ref,
          manager: 'github-actions',
          updateType: this.determineUpdateType(headAction.name, baseAction.ref, headAction.ref),
          semverImpact: this.calculateSemverImpact(baseAction.ref, headAction.ref),
          isSecurityUpdate:
            this.isSecurityRelatedAction(headAction.name) ||
            this.isSecurityUpdate(baseAction.ref, headAction.ref),
          stepName: headAction.stepName,
          line: headAction.line,
          isReusableWorkflow: this.isReusableWorkflow(headAction.uses),
          inlineVersionComment: headAction.inlineVersion,
        }
        changes.push(change)
      }
    }

    return changes
  }

  /**
   * Parse version information from action reference
   */
  private parseActionVersion(ref: string): ActionVersion {
    const version: ActionVersion = {
      original: ref,
      isCommitSha: false,
      isBranch: false,
      isTag: false,
    }

    // Check if it's a commit SHA (40 hex characters)
    if (/^[a-f0-9]{40}$/i.test(ref)) {
      version.isCommitSha = true
      return version
    }

    // Check if it's a semver tag
    const semverMatch = ref.match(
      /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([a-zA-Z0-9.-]+))?(?:\+([a-zA-Z0-9.-]+))?$/,
    )
    if (semverMatch && semverMatch[1]) {
      version.isTag = true
      version.major = Number.parseInt(semverMatch[1], 10)
      version.minor = semverMatch[2] ? Number.parseInt(semverMatch[2], 10) : 0
      version.patch = semverMatch[3] ? Number.parseInt(semverMatch[3], 10) : 0
      version.prerelease = semverMatch[4]
      version.build = semverMatch[5]
      return version
    }

    // Otherwise, assume it's a branch
    version.isBranch = true
    return version
  }

  /**
   * Calculate semver impact of version change
   */
  private calculateSemverImpact(
    currentRef?: string,
    newRef?: string,
  ): 'major' | 'minor' | 'patch' | 'prerelease' | 'none' {
    if (!currentRef || !newRef) {
      return 'patch' // Default for new or unknown changes
    }

    const currentVersion = this.parseActionVersion(currentRef)
    const newVersion = this.parseActionVersion(newRef)

    // If both are commit SHAs, consider it a patch update
    if (currentVersion.isCommitSha && newVersion.isCommitSha) {
      return 'patch'
    }

    // If changing from/to branch, consider it minor
    if (currentVersion.isBranch || newVersion.isBranch) {
      return 'minor'
    }

    // For semver tags, calculate actual impact
    if (
      currentVersion.isTag &&
      newVersion.isTag &&
      currentVersion.major !== undefined &&
      newVersion.major !== undefined
    ) {
      if (currentVersion.major !== newVersion.major) {
        return 'major'
      }

      if (currentVersion.minor !== newVersion.minor) {
        return 'minor'
      }

      if (currentVersion.patch !== newVersion.patch) {
        return 'patch'
      }

      if (currentVersion.prerelease !== newVersion.prerelease) {
        return 'prerelease'
      }
    }

    return 'none'
  }

  /**
   * Determine update type based on action and version change
   */
  private determineUpdateType(
    _actionName: string,
    currentRef?: string,
    newRef?: string,
  ): RenovateUpdateType {
    const semverImpact = this.calculateSemverImpact(currentRef, newRef)

    // Map semver impact to Renovate update types
    switch (semverImpact) {
      case 'major':
        return 'major'
      case 'minor':
        return 'minor'
      case 'patch':
        return 'patch'
      case 'prerelease':
        return 'minor' // Treat prerelease as minor
      default:
        return 'patch'
    }
  }

  /**
   * Check if an action is security-related
   */
  private isSecurityRelatedAction(actionName: string): boolean {
    const securityActions = [
      'ossf/scorecard-action',
      'github/codeql-action',
      'actions/dependency-review-action',
      'securecodewarrior/github-action-add-sarif',
      'securecodewarrior/github-action-add-vulnerable-dependency',
      'step-security/harden-runner',
    ]

    return securityActions.some(secAction => actionName.includes(secAction))
  }

  /**
   * Check if this is a security update based on version change
   */
  private isSecurityUpdate(currentRef: string, newRef: string): boolean {
    // For now, we'll use a simple heuristic: patch updates to security actions
    // In a real implementation, this could check CVE databases or release notes
    const currentVersion = this.parseActionVersion(currentRef)
    const newVersion = this.parseActionVersion(newRef)

    // If it's a patch update and involves a commit SHA (common for security patches)
    if (
      this.calculateSemverImpact(currentRef, newRef) === 'patch' &&
      (currentVersion.isCommitSha || newVersion.isCommitSha)
    ) {
      return true
    }

    return false
  }

  /**
   * Check if the uses statement is for a reusable workflow
   */
  private isReusableWorkflow(uses: string): boolean {
    // Reusable workflows are referenced at the job level and contain .yaml or .yml
    return uses.includes('.yaml') || uses.includes('.yml')
  }

  /**
   * Deduplicate changes to avoid duplicates
   */
  private deduplicateChanges(
    changes: GitHubActionsDependencyChange[],
  ): GitHubActionsDependencyChange[] {
    const seen = new Set<string>()
    const deduplicated: GitHubActionsDependencyChange[] = []

    for (const change of changes) {
      // Create a unique key for deduplication
      const key = `${change.name}:${change.workflowFile}:${change.stepName}:${change.currentRef}:${change.newRef}`

      if (!seen.has(key)) {
        seen.add(key)
        deduplicated.push(change)
      }
    }

    return deduplicated
  }
}
