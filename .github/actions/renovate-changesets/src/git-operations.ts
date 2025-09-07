import process from 'node:process'
import * as core from '@actions/core'
import {getExecOutput} from '@actions/exec'

export interface GitConfig {
  /** GitHub token for authentication (GitHub App token preferred) */
  token: string
  /** Whether to commit changeset files back to the branch */
  commitBack: boolean
  /** Template for commit messages */
  commitMessageTemplate: string
  /** Working directory for git operations */
  workingDirectory: string
  /** Repository owner */
  owner: string
  /** Repository name */
  repo: string
  /** Branch name to push to (e.g., renovate/npm-typescript-5.x) */
  branchName: string
}

export interface CommitResult {
  /** Whether the commit was successful */
  success: boolean
  /** Commit SHA if successful */
  commitSha?: string
  /** Error message if failed */
  error?: string
  /** List of files that were committed */
  committedFiles: string[]
  /** Whether the push to remote was successful */
  pushSuccess?: boolean
  /** Error message if push failed */
  pushError?: string
}

/**
 * GitOperations class handles git operations for committing changeset files
 * back to Renovate branches using GitHub App authentication.
 *
 * Implements TASK-028: Git operations for committing changeset files
 * Implements TASK-029: GitHub App authentication for Git operations
 *
 * Follows security requirements:
 * - SEC-003: Implement secure GitHub App authentication pattern
 * - PAT-001: Use the existing bfra-me[bot] GitHub App authentication pattern
 */
export class GitOperations {
  private readonly config: GitConfig

  constructor(config: GitConfig) {
    this.config = config
  }

  /**
   * Configure git user for commits using bfra-me[bot] identity
   * Following the same pattern used in renovate-changeset.yaml workflow
   */
  async configureGitUser(): Promise<void> {
    core.info('Configuring git user for bfra-me[bot]')

    try {
      // Set git user email and name to match bfra-me[bot] GitHub App
      await getExecOutput(
        'git',
        ['config', 'user.email', '118100583+bfra-me[bot]@users.noreply.github.com'],
        {
          cwd: this.config.workingDirectory,
        },
      )

      await getExecOutput('git', ['config', 'user.name', 'bfra-me[bot]'], {
        cwd: this.config.workingDirectory,
      })

      core.info('Successfully configured git user as bfra-me[bot]')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      core.error(`Failed to configure git user: ${errorMessage}`)
      throw new Error(`Git user configuration failed: ${errorMessage}`)
    }
  }

  /**
   * Check if there are any changes to commit in the working directory
   */
  async hasChanges(): Promise<boolean> {
    try {
      const {stdout} = await getExecOutput('git', ['status', '--porcelain'], {
        cwd: this.config.workingDirectory,
      })

      return stdout.trim().length > 0
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      core.warning(`Failed to check git status: ${errorMessage}`)
      return false
    }
  }

  /**
   * Get list of changed changeset files
   */
  async getChangedChangesetFiles(): Promise<string[]> {
    try {
      const {stdout} = await getExecOutput('git', ['status', '--porcelain'], {
        cwd: this.config.workingDirectory,
      })

      const changedFiles = stdout
        .trim()
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => line.slice(3)) // Remove git status prefix (e.g., "A  ", "M  ")
        .filter(file => file.startsWith('.changeset/') && file.endsWith('.md'))

      return changedFiles
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      core.warning(`Failed to get changed files: ${errorMessage}`)
      return []
    }
  }

  /**
   * Stage changeset files for commit
   */
  async stageChangesetFiles(changesetFiles: string[]): Promise<void> {
    if (changesetFiles.length === 0) {
      core.info('No changeset files to stage')
      return
    }

    try {
      core.info(`Staging ${changesetFiles.length} changeset files`)

      // Stage all changeset files
      for (const file of changesetFiles) {
        await getExecOutput('git', ['add', file], {
          cwd: this.config.workingDirectory,
        })
        core.debug(`Staged changeset file: ${file}`)
      }

      core.info('Successfully staged all changeset files')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      core.error(`Failed to stage changeset files: ${errorMessage}`)
      throw new Error(`Git staging failed: ${errorMessage}`)
    }
  }

  /**
   * Generate commit message from template with placeholder replacement
   */
  generateCommitMessage(changesetFiles: string[]): string {
    let message = this.config.commitMessageTemplate

    // Replace placeholders with actual values
    message = message.replace('{{count}}', changesetFiles.length.toString())
    message = message.replace('{{files}}', changesetFiles.join(', '))

    // Add more context if only one file
    if (changesetFiles.length === 1) {
      message = message.replace('{{file}}', changesetFiles[0] || 'unknown')
    } else {
      message = message.replace('{{file}}', `${changesetFiles.length} files`)
    }

    return message
  }

  /**
   * Commit staged changeset files with appropriate message
   */
  async commitChanges(changesetFiles: string[]): Promise<CommitResult> {
    if (changesetFiles.length === 0) {
      return {
        success: false,
        error: 'No changeset files to commit',
        committedFiles: [],
      }
    }

    try {
      // Generate commit message
      const commitMessage = this.generateCommitMessage(changesetFiles)
      core.info(`Committing with message: ${commitMessage}`)

      // Create the commit
      await getExecOutput('git', ['commit', '-m', commitMessage], {
        cwd: this.config.workingDirectory,
      })

      // Get the commit SHA
      const {stdout: commitSha} = await getExecOutput('git', ['rev-parse', 'HEAD'], {
        cwd: this.config.workingDirectory,
      })

      const result: CommitResult = {
        success: true,
        commitSha: commitSha.trim(),
        committedFiles: changesetFiles,
      }

      core.info(`Successfully committed changeset files. Commit SHA: ${result.commitSha}`)
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      core.error(`Failed to commit changeset files: ${errorMessage}`)

      return {
        success: false,
        error: errorMessage,
        committedFiles: [],
      }
    }
  }

  /**
   * Setup git remote with authentication token for push operations
   * TASK-030: Implement automatic commit back to Renovate branches
   */
  async setupRemoteWithAuth(): Promise<void> {
    try {
      core.info('Setting up authenticated remote for push operations')

      // Get current remote URL to check if it needs authentication setup
      const {stdout: remoteUrl} = await getExecOutput('git', ['remote', 'get-url', 'origin'], {
        cwd: this.config.workingDirectory,
      })

      // If the remote is already using HTTPS with token, we're good
      if (remoteUrl.includes('x-access-token')) {
        core.info('Remote already configured with authentication')
        return
      }

      // Setup authenticated remote URL
      const authenticatedUrl = `https://x-access-token:${this.config.token}@github.com/${this.config.owner}/${this.config.repo}.git`

      await getExecOutput('git', ['remote', 'set-url', 'origin', authenticatedUrl], {
        cwd: this.config.workingDirectory,
      })

      core.info('Successfully configured authenticated remote')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      core.error(`Failed to setup authenticated remote: ${errorMessage}`)
      throw new Error(`Remote authentication setup failed: ${errorMessage}`)
    }
  }

  /**
   * Push commits to the remote Renovate branch
   * TASK-030: Implement automatic commit back to Renovate branches
   */
  async pushToRemoteBranch(): Promise<{success: boolean; error?: string}> {
    try {
      core.info(`Pushing commits to remote branch: ${this.config.branchName}`)

      // First, setup the authenticated remote
      await this.setupRemoteWithAuth()

      // Verify we're on the correct branch
      const {stdout: currentBranch} = await getExecOutput('git', ['branch', '--show-current'], {
        cwd: this.config.workingDirectory,
      })

      if (currentBranch.trim() !== this.config.branchName) {
        core.warning(
          `Current branch (${currentBranch.trim()}) doesn't match target branch (${this.config.branchName})`,
        )
      }

      // Push to the remote branch
      await getExecOutput('git', ['push', 'origin', `HEAD:${this.config.branchName}`], {
        cwd: this.config.workingDirectory,
      })

      core.info(`Successfully pushed commits to remote branch: ${this.config.branchName}`)
      return {success: true}
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      core.error(`Failed to push to remote branch: ${errorMessage}`)
      return {success: false, error: errorMessage}
    }
  }

  /**
   * Main method to commit changeset files back to the current branch
   * Implements the complete flow: configure user → check changes → stage → commit
   */
  async commitChangesetFiles(): Promise<CommitResult> {
    if (!this.config.commitBack) {
      core.info('Commit back disabled, skipping git operations')
      return {
        success: true,
        committedFiles: [],
        error: 'Commit back disabled',
      }
    }

    try {
      core.info('Starting git operations to commit changeset files')

      // Configure git user with bfra-me[bot] identity
      await this.configureGitUser()

      // Check if there are any changes
      const hasChanges = await this.hasChanges()
      if (!hasChanges) {
        core.info('No changes detected, nothing to commit')
        return {
          success: true,
          committedFiles: [],
        }
      }

      // Get list of changed changeset files
      const changesetFiles = await this.getChangedChangesetFiles()
      if (changesetFiles.length === 0) {
        core.info('No changeset files detected in changes')
        return {
          success: true,
          committedFiles: [],
        }
      }

      // Stage changeset files
      await this.stageChangesetFiles(changesetFiles)

      // Commit the changes
      const result = await this.commitChanges(changesetFiles)

      if (result.success) {
        core.info(
          `Git operations completed successfully. Committed ${result.committedFiles.length} files.`,
        )

        // TASK-030: Push changeset files back to Renovate branch automatically
        core.info('Attempting to push changeset files to remote branch')
        const pushResult = await this.pushToRemoteBranch()

        // Update result with push information
        result.pushSuccess = pushResult.success
        result.pushError = pushResult.error

        if (pushResult.success) {
          core.info(
            `Successfully pushed changeset files to remote branch: ${this.config.branchName}`,
          )
        } else {
          core.warning(`Push to remote branch failed: ${pushResult.error}`)
          // Note: We don't fail the entire operation if push fails, as the commit was successful
        }
      } else {
        core.error(`Git operations failed: ${result.error}`)
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      core.error(`Git operations failed: ${errorMessage}`)

      return {
        success: false,
        error: errorMessage,
        committedFiles: [],
      }
    }
  }

  /**
   * Validate git configuration and authentication
   * Checks if git is properly configured and can access the repository
   */
  async validateGitSetup(): Promise<boolean> {
    try {
      core.info('Validating git setup and authentication')

      // Check if we're in a git repository
      await getExecOutput('git', ['rev-parse', '--git-dir'], {
        cwd: this.config.workingDirectory,
      })

      // Check if we have write access by testing a simple operation
      const {stdout: currentBranch} = await getExecOutput('git', ['branch', '--show-current'], {
        cwd: this.config.workingDirectory,
      })

      core.info(`Git setup validated. Current branch: ${currentBranch.trim()}`)
      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      core.error(`Git setup validation failed: ${errorMessage}`)
      return false
    }
  }
}

/**
 * Create GitOperations instance from action inputs and environment
 * TASK-030: Updated to include repository and branch information for push operations
 */
export function createGitOperations(
  workingDirectory: string,
  owner: string,
  repo: string,
  branchName: string,
): GitOperations {
  const config: GitConfig = {
    token: core.getInput('token') || process.env.GITHUB_TOKEN || '',
    commitBack: core.getBooleanInput('commit-back'),
    commitMessageTemplate:
      core.getInput('commit-message-template') ||
      'chore: add changeset for renovate updates\n\nAdded {{count}} changeset file(s): {{files}}',
    workingDirectory,
    owner,
    repo,
    branchName,
  }

  // Validate required inputs
  if (config.commitBack && !config.token) {
    throw new Error('GitHub token is required when commit-back is enabled')
  }

  return new GitOperations(config)
}
