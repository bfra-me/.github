import type {Octokit} from '@octokit/rest'

import type {
  BranchPatterns,
  ConventionalCommit,
  RenovateManagerType,
  RenovatePRContext,
} from './parser/renovate-parser-types.js'
import {
  createBranchPatterns,
  getBranchType,
  isRenovateBranch,
} from './parser/renovate-branch-patterns.js'
import {
  extractDependenciesFromPR,
  parseDependenciesFromText,
} from './parser/renovate-dependency-extractor.js'
import {
  detectManagerFromFilename as classifyManagerFromFilename,
  detectManagerFromFiles,
  detectManagerFromScope,
  getSupportedManagers,
} from './parser/renovate-manager-detector.js'
import {extractPRContext, type PullRequestData} from './parser/renovate-pr-context-extractor.js'
import {parseCommitMessage} from './parser/renovate-title-parser.js'
import {
  detectUpdateTypeFromVersions,
  extractGroupName,
  extractSecuritySeverity,
  isGroupedUpdate,
  isSecurityUpdate,
} from './parser/renovate-update-classifier.js'

export type {
  BranchPatterns,
  ConventionalCommit,
  RenovateDependency,
  RenovateManagerType,
  RenovatePRContext,
  RenovateSecurityType,
  RenovateUpdateType,
} from './parser/renovate-parser-types.js'

export type {PullRequestData}

export class RenovateParser {
  private branchPatterns: BranchPatterns

  constructor(customBranchPatterns?: Partial<BranchPatterns>) {
    this.branchPatterns = createBranchPatterns(customBranchPatterns)
  }

  isRenovateBranch(branchName: string): boolean {
    return isRenovateBranch(branchName, this.branchPatterns)
  }

  getBranchType(branchName: string): 'renovate' | 'dependabot' | 'custom' | 'unknown' {
    return getBranchType(branchName, this.branchPatterns)
  }

  parseCommitMessage(commitMessage: string): ConventionalCommit {
    return parseCommitMessage(commitMessage)
  }

  detectManagerFromScope(scope?: string): RenovateManagerType {
    return detectManagerFromScope(scope)
  }

  async extractPRContext(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    prData: PullRequestData,
  ): Promise<RenovatePRContext> {
    return extractPRContext(octokit, owner, repo, prNumber, prData)
  }

  private _detectManagerFromFilename(filename: string): RenovateManagerType {
    return classifyManagerFromFilename(filename)
  }

  get detectManagerFromFilename() {
    return this._detectManagerFromFilename.bind(this)
  }

  get extractDependenciesFromPR() {
    return extractDependenciesFromPR
  }

  get parseDependenciesFromText() {
    return parseDependenciesFromText
  }

  get detectManagerFromFiles() {
    return detectManagerFromFiles
  }

  get detectUpdateTypeFromVersions() {
    return detectUpdateTypeFromVersions
  }

  get isSecurityUpdate() {
    return isSecurityUpdate
  }

  get isGroupedUpdate() {
    return isGroupedUpdate
  }

  get extractGroupName() {
    return extractGroupName
  }

  get extractSecuritySeverity() {
    return extractSecuritySeverity
  }

  parseSemanticCommit(commitMessage: string): ConventionalCommit {
    return this.parseCommitMessage(commitMessage)
  }

  getSupportedManagers(): RenovateManagerType[] {
    return getSupportedManagers()
  }

  isManagerSupported(manager: string): manager is RenovateManagerType {
    return this.getSupportedManagers().includes(manager as RenovateManagerType)
  }
}
