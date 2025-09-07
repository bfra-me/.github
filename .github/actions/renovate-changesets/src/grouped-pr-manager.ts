import type {Octokit} from '@octokit/rest'
import type {RenovatePRContext} from './renovate-parser'
import * as core from '@actions/core'

/**
 * Information about a PR that is part of a grouped update
 */
export interface GroupedPR {
  /** PR number */
  number: number
  /** PR title */
  title: string
  /** Branch name */
  head: string
  /** Whether this is the current/triggering PR */
  isCurrent: boolean
  /** Group name if detected */
  groupName?: string
  /** Related dependencies */
  dependencies: string[]
}

/**
 * Result of grouped PR operations
 */
export interface GroupedPRResult {
  /** Total number of PRs found in the group */
  totalPRs: number
  /** Number of PRs successfully updated */
  updatedPRs: number
  /** Number of PRs that failed to update */
  failedPRs: number
  /** Details about each PR operation */
  prResults: {
    prNumber: number
    success: boolean
    operation: 'description' | 'comment' | 'both'
    error?: string
  }[]
  /** Strategy used for grouping */
  groupingStrategy: 'none' | 'branch-pattern' | 'group-name' | 'dependencies'
  /** Group identifier */
  groupIdentifier?: string
}

/**
 * Configuration for grouped PR operations
 */
export interface GroupedPRConfig {
  /** Whether to enable grouped PR updates */
  enabled: boolean
  /** Maximum number of PRs to update in a group */
  maxPRs: number
  /** Whether to update PR descriptions */
  updateDescriptions: boolean
  /** Whether to create PR comments */
  createComments: boolean
  /** How to handle failures in grouped updates */
  failureStrategy: 'continue' | 'stop'
  /** Whether to skip the current PR (avoid duplicate updates) */
  skipCurrentPR: boolean
}

/**
 * GroupedPRManager handles updating multiple PRs in Renovate grouped updates
 *
 * TASK-034: Add support for updating multiple PRs in grouped updates
 *
 * This class provides functionality to:
 * - Detect when a PR is part of a grouped update
 * - Find related PRs in the same group
 * - Coordinate updates across multiple PRs
 * - Handle failures and partial successes gracefully
 */
export class GroupedPRManager {
  private readonly octokit: Octokit
  private readonly owner: string
  private readonly repo: string
  private readonly config: GroupedPRConfig

  constructor(octokit: Octokit, owner: string, repo: string, config: GroupedPRConfig) {
    this.octokit = octokit
    this.owner = owner
    this.repo = repo
    this.config = config
  }

  /**
   * Detect if the current PR is part of a grouped update and find related PRs
   */
  async detectGroupedPRs(
    currentPRNumber: number,
    renovateContext: RenovatePRContext,
  ): Promise<GroupedPR[]> {
    if (!this.config.enabled) {
      core.info('Grouped PR updates disabled, skipping detection')
      return []
    }

    core.info('Detecting grouped PRs for current update')

    // Get current PR details
    const {data: currentPR} = await this.octokit.rest.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: currentPRNumber,
    })

    const groupedPRs: GroupedPR[] = [
      {
        number: currentPR.number,
        title: currentPR.title,
        head: currentPR.head.ref,
        isCurrent: true,
        groupName: this.extractGroupNameFromDependencies(renovateContext.dependencies),
        dependencies: renovateContext.dependencies.map(dep => dep.name),
      },
    ]

    // Try different strategies to find related PRs
    const groupName = this.extractGroupNameFromDependencies(renovateContext.dependencies)
    const strategies = [
      () => this.findPRsByGroupName(groupName, currentPRNumber),
      () => this.findPRsByBranchPattern(currentPR.head.ref, currentPRNumber),
      () =>
        this.findPRsByDependencies(
          renovateContext.dependencies.map(dep => dep.name),
          currentPRNumber,
        ),
    ]

    for (const strategy of strategies) {
      try {
        const relatedPRs = await strategy()
        if (relatedPRs.length > 0) {
          groupedPRs.push(...relatedPRs)
          break // Use the first successful strategy
        }
      } catch (error) {
        core.warning(`Strategy failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // Remove duplicates and limit the number of PRs
    const uniquePRs = this.deduplicatePRs(groupedPRs)
    const limitedPRs = uniquePRs.slice(0, this.config.maxPRs)

    core.info(
      `Found ${uniquePRs.length} PRs in group (limited to ${limitedPRs.length}): ${limitedPRs.map(pr => `#${pr.number}`).join(', ')}`,
    )

    return limitedPRs
  }

  /**
   * Extract group name from dependencies if available
   */
  private extractGroupNameFromDependencies(
    dependencies: {name: string; groupName?: string}[],
  ): string | undefined {
    for (const dep of dependencies) {
      if (dep.groupName) {
        return dep.groupName
      }
    }
    return undefined
  }

  /**
   * Find related PRs by group name
   */
  private async findPRsByGroupName(
    groupName: string | undefined,
    currentPRNumber: number,
  ): Promise<GroupedPR[]> {
    if (!groupName) {
      return []
    }

    core.debug(`Searching for PRs with group name: ${groupName}`)

    // Search for open PRs that mention the group name
    const searchQuery = `repo:${this.owner}/${this.repo} is:pr is:open "${groupName}" NOT number:${currentPRNumber}`

    const {data: searchResult} = await this.octokit.rest.search.issuesAndPullRequests({
      q: searchQuery,
      per_page: this.config.maxPRs,
    })

    const groupedPRs: GroupedPR[] = []

    for (const item of searchResult.items) {
      if (item.pull_request) {
        // Get full PR details
        const {data: pr} = await this.octokit.rest.pulls.get({
          owner: this.owner,
          repo: this.repo,
          pull_number: item.number,
        })

        groupedPRs.push({
          number: pr.number,
          title: pr.title,
          head: pr.head.ref,
          isCurrent: false,
          groupName,
          dependencies: this.extractDependenciesFromPRTitle(pr.title),
        })
      }
    }

    core.debug(`Found ${groupedPRs.length} PRs by group name`)
    return groupedPRs
  }

  /**
   * Find related PRs by branch pattern
   */
  private async findPRsByBranchPattern(
    currentBranch: string,
    currentPRNumber: number,
  ): Promise<GroupedPR[]> {
    core.debug(`Searching for PRs with similar branch pattern to: ${currentBranch}`)

    // Extract the base pattern from the current branch
    // For example: renovate/npm-group-dependencies -> renovate/npm-group-*
    const branchPattern = this.extractBranchPattern(currentBranch)
    if (!branchPattern) {
      return []
    }

    // Search for PRs with similar branch names
    const searchQuery = `repo:${this.owner}/${this.repo} is:pr is:open head:${branchPattern} NOT number:${currentPRNumber}`

    const {data: searchResult} = await this.octokit.rest.search.issuesAndPullRequests({
      q: searchQuery,
      per_page: this.config.maxPRs,
    })

    const groupedPRs: GroupedPR[] = []

    for (const item of searchResult.items) {
      if (item.pull_request) {
        const {data: pr} = await this.octokit.rest.pulls.get({
          owner: this.owner,
          repo: this.repo,
          pull_number: item.number,
        })

        groupedPRs.push({
          number: pr.number,
          title: pr.title,
          head: pr.head.ref,
          isCurrent: false,
          dependencies: this.extractDependenciesFromPRTitle(pr.title),
        })
      }
    }

    core.debug(`Found ${groupedPRs.length} PRs by branch pattern`)
    return groupedPRs
  }

  /**
   * Find related PRs by shared dependencies
   */
  private async findPRsByDependencies(
    dependencies: string[],
    currentPRNumber: number,
  ): Promise<GroupedPR[]> {
    if (dependencies.length === 0) {
      return []
    }

    core.debug(`Searching for PRs with shared dependencies: ${dependencies.join(', ')}`)

    const groupedPRs: GroupedPR[] = []

    // Search for each dependency
    for (const dependency of dependencies.slice(0, 3)) {
      // Limit to first 3 dependencies to avoid too many API calls
      const searchQuery = `repo:${this.owner}/${this.repo} is:pr is:open "${dependency}" NOT number:${currentPRNumber}`

      try {
        const {data: searchResult} = await this.octokit.rest.search.issuesAndPullRequests({
          q: searchQuery,
          per_page: 5, // Limit results per dependency
        })

        for (const item of searchResult.items) {
          if (item.pull_request) {
            const {data: pr} = await this.octokit.rest.pulls.get({
              owner: this.owner,
              repo: this.repo,
              pull_number: item.number,
            })

            // Only include if it's a Renovate PR
            if (this.isRenovatePR(pr.head.ref, pr.title)) {
              groupedPRs.push({
                number: pr.number,
                title: pr.title,
                head: pr.head.ref,
                isCurrent: false,
                dependencies: this.extractDependenciesFromPRTitle(pr.title),
              })
            }
          }
        }
      } catch (error) {
        core.warning(
          `Failed to search for dependency ${dependency}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    core.debug(`Found ${groupedPRs.length} PRs by dependencies`)
    return groupedPRs
  }

  /**
   * Update multiple PRs with changeset information
   */
  async updateGroupedPRs(
    groupedPRs: GroupedPR[],
    changesetContent: string,
    releases: {name: string; type: 'patch' | 'minor' | 'major'}[],
    dependencies: string[],
    categorizationResult: {
      primaryCategory: string
      allCategories: string[]
      summary: {
        securityUpdates: number
        breakingChanges: number
        highPriorityUpdates: number
        averageRiskLevel: number
      }
      confidence: string
    },
    multiPackageResult: {
      strategy: string
      reasoning: string[]
    },
    updatePRDescriptionFn: (
      octokit: Octokit,
      owner: string,
      repo: string,
      prNumber: number,
      changesetContent: string,
      releases: {name: string; type: 'patch' | 'minor' | 'major'}[],
      dependencies: string[],
      categorizationResult: any,
      multiPackageResult: any,
    ) => Promise<void>,
    createPRCommentFn: (
      octokit: Octokit,
      owner: string,
      repo: string,
      prNumber: number,
      changesetContent: string,
      releases: {name: string; type: 'patch' | 'minor' | 'major'}[],
      changesetPath: string,
      dependencies: string[],
      categorizationResult: any,
      multiPackageResult: any,
    ) => Promise<void>,
    changesetPath: string,
  ): Promise<GroupedPRResult> {
    const result: GroupedPRResult = {
      totalPRs: groupedPRs.length,
      updatedPRs: 0,
      failedPRs: 0,
      prResults: [],
      groupingStrategy: this.determineGroupingStrategy(groupedPRs),
      groupIdentifier: this.determineGroupIdentifier(groupedPRs),
    }

    core.info(`Updating ${groupedPRs.length} PRs in grouped update`)

    for (const pr of groupedPRs) {
      // Skip current PR if configured to do so
      if (pr.isCurrent && this.config.skipCurrentPR) {
        core.info(`Skipping current PR #${pr.number} to avoid duplicate updates`)
        continue
      }

      const prResult = {
        prNumber: pr.number,
        success: false,
        operation: 'both' as const,
        error: undefined as string | undefined,
      }

      try {
        core.info(`Updating PR #${pr.number}: ${pr.title}`)

        // Update PR description if enabled
        if (this.config.updateDescriptions) {
          try {
            await updatePRDescriptionFn(
              this.octokit,
              this.owner,
              this.repo,
              pr.number,
              changesetContent,
              releases,
              dependencies,
              categorizationResult,
              multiPackageResult,
            )
            core.debug(`Successfully updated description for PR #${pr.number}`)
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            core.warning(`Failed to update description for PR #${pr.number}: ${errorMessage}`)
            if (this.config.failureStrategy === 'stop') {
              throw error
            }
          }
        }

        // Create PR comment if enabled
        if (this.config.createComments) {
          try {
            await createPRCommentFn(
              this.octokit,
              this.owner,
              this.repo,
              pr.number,
              changesetContent,
              releases,
              changesetPath,
              dependencies,
              categorizationResult,
              multiPackageResult,
            )
            core.debug(`Successfully created comment for PR #${pr.number}`)
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            core.warning(`Failed to create comment for PR #${pr.number}: ${errorMessage}`)
            if (this.config.failureStrategy === 'stop') {
              throw error
            }
          }
        }

        prResult.success = true
        result.updatedPRs++
        core.info(`Successfully updated PR #${pr.number}`)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        core.error(`Failed to update PR #${pr.number}: ${errorMessage}`)
        prResult.error = errorMessage
        result.failedPRs++

        if (this.config.failureStrategy === 'stop') {
          break
        }
      }

      result.prResults.push(prResult)
    }

    core.info(
      `Grouped PR update completed: ${result.updatedPRs} successful, ${result.failedPRs} failed`,
    )

    return result
  }

  /**
   * Extract branch pattern for searching related PRs
   */
  private extractBranchPattern(branchName: string): string | null {
    // Handle common Renovate branch patterns
    if (branchName.startsWith('renovate/')) {
      const parts = branchName.split('-')
      if (parts.length > 2) {
        // Keep the first two parts and add wildcard
        // e.g., renovate/npm-typescript-5.x -> renovate/npm-*
        return `${parts[0]}-${parts[1]}-*`
      }
    }

    return null
  }

  /**
   * Extract dependencies from PR title
   */
  private extractDependenciesFromPRTitle(title: string): string[] {
    const dependencies: string[] = []

    // Look for common patterns in Renovate PR titles
    const patterns = [
      /update (\S+) to/gi,
      /bump (\S+) from/gi,
      /(\S+) from \d+\.\d+\.\d+ to \d+\.\d+\.\d+/gi,
    ]

    for (const pattern of patterns) {
      let match = pattern.exec(title)
      while (match !== null) {
        if (match[1] && !dependencies.includes(match[1])) {
          dependencies.push(match[1])
        }
        match = pattern.exec(title)
      }
    }

    return dependencies
  }

  /**
   * Check if a PR is a Renovate PR based on branch name and title
   */
  private isRenovatePR(branchName: string, title: string): boolean {
    const branchLower = branchName.toLowerCase()
    const titleLower = title.toLowerCase()

    return (
      branchLower.startsWith('renovate/') ||
      branchLower.startsWith('dependabot/') ||
      titleLower.includes('update') ||
      titleLower.includes('bump') ||
      titleLower.includes('renovate')
    )
  }

  /**
   * Remove duplicate PRs from the list
   */
  private deduplicatePRs(prs: GroupedPR[]): GroupedPR[] {
    const seen = new Set<number>()
    return prs.filter(pr => {
      if (seen.has(pr.number)) {
        return false
      }
      seen.add(pr.number)
      return true
    })
  }

  /**
   * Determine the grouping strategy used
   */
  private determineGroupingStrategy(
    groupedPRs: GroupedPR[],
  ): 'none' | 'branch-pattern' | 'group-name' | 'dependencies' {
    if (groupedPRs.length <= 1) return 'none'
    if (groupedPRs.some(pr => pr.groupName)) return 'group-name'
    if (groupedPRs.some(pr => pr.head.includes('group'))) return 'branch-pattern'
    return 'dependencies'
  }

  /**
   * Determine the group identifier
   */
  private determineGroupIdentifier(groupedPRs: GroupedPR[]): string | undefined {
    // Try group name first
    const groupName = groupedPRs.find(pr => pr.groupName)?.groupName
    if (groupName) return groupName

    // Fall back to common branch prefix
    const branches = groupedPRs.map(pr => pr.head)
    const commonPrefix = this.findCommonPrefix(branches)
    return commonPrefix || undefined
  }

  /**
   * Find common prefix among branch names
   */
  private findCommonPrefix(strings: string[]): string {
    if (strings.length === 0) return ''
    if (strings.length === 1) return strings[0] || ''

    let prefix = strings[0] || ''
    for (let i = 1; i < strings.length; i++) {
      const current = strings[i] || ''
      while (prefix && !current.startsWith(prefix)) {
        prefix = prefix.slice(0, -1)
      }
    }

    return prefix
  }
}

/**
 * Create GroupedPRManager instance from action inputs
 */
export function createGroupedPRManager(
  octokit: Octokit,
  owner: string,
  repo: string,
): GroupedPRManager {
  const config: GroupedPRConfig = {
    enabled: core.getBooleanInput('update-grouped-prs') || false,
    maxPRs: Number.parseInt(core.getInput('max-grouped-prs') || '10', 10),
    updateDescriptions: core.getBooleanInput('update-pr-description') || false,
    createComments: core.getBooleanInput('comment-pr') || false,
    failureStrategy:
      (core.getInput('grouped-pr-failure-strategy') as 'continue' | 'stop') || 'continue',
    skipCurrentPR: core.getBooleanInput('skip-current-pr-in-group') || true,
  }

  return new GroupedPRManager(octokit, owner, repo, config)
}
