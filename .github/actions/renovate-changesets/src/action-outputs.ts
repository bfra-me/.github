import * as core from '@actions/core'

interface ChangesetOutputs {
  changesetsCreated: number
  changesetFiles: string[]
  updateType: string
  dependencies: string[]
  changesetSummary: string
}

interface MultiPackageOutputs {
  strategy: string
  workspacePackagesCount: number
  packageRelationshipsCount: number
  affectedPackages: string[]
  reasoning: string[]
}

interface CategorizationOutputs {
  primaryCategory: string
  allCategories: string[]
  summary: Record<string, unknown>
  securityUpdates: number
  breakingChanges: number
  highPriorityUpdates: number
  averageRiskLevel: number
  confidence: string
}

interface GitOperationOutputs {
  commitSuccess: boolean
  commitSha: string
  committedFiles: string[]
  gitError: string
  pushSuccess: boolean
  pushError: string
  conflictsResolved: boolean
  conflictResolution: string
  branchUpdated: boolean
  retryAttempts: number
}

interface PRManagementOutputs {
  prDescriptionUpdated: boolean
  prDescriptionError: string
  prCommentCreated: boolean
  prCommentError: string
}

interface GroupedPROutputs {
  enabled: boolean
  found: number
  updated: number
  failed: number
  strategy: string
  identifier: string
  results: unknown[]
}

export function setEmptyOutputs(): void {
  core.setOutput('changesets-created', '0')
  core.setOutput('changeset-files', JSON.stringify([]))
  core.setOutput('primary-category', '')
  core.setOutput('all-categories', JSON.stringify([]))
  core.setOutput('categorization-summary', JSON.stringify({}))
  core.setOutput('security-updates', '0')
  core.setOutput('breaking-changes', '0')
  core.setOutput('high-priority-updates', '0')
  core.setOutput('average-risk-level', '0')
  core.setOutput('categorization-confidence', 'low')
}

export function setChangesetOutputs(data: ChangesetOutputs): void {
  core.setOutput('changesets-created', data.changesetsCreated.toString())
  core.setOutput('changeset-files', JSON.stringify(data.changesetFiles))
  core.setOutput('update-type', data.updateType)
  core.setOutput('dependencies', JSON.stringify(data.dependencies))
  core.setOutput('changeset-summary', data.changesetSummary)
}

export function setMultiPackageOutputs(data: MultiPackageOutputs): void {
  core.setOutput('multi-package-strategy', data.strategy)
  core.setOutput('workspace-packages-count', data.workspacePackagesCount.toString())
  core.setOutput('package-relationships-count', data.packageRelationshipsCount.toString())
  core.setOutput('affected-packages', JSON.stringify(data.affectedPackages))
  core.setOutput('multi-package-reasoning', JSON.stringify(data.reasoning))
}

export function setCategorizationOutputs(data: CategorizationOutputs): void {
  core.setOutput('primary-category', data.primaryCategory)
  core.setOutput('all-categories', JSON.stringify(data.allCategories))
  core.setOutput('categorization-summary', JSON.stringify(data.summary))
  core.setOutput('security-updates', data.securityUpdates.toString())
  core.setOutput('breaking-changes', data.breakingChanges.toString())
  core.setOutput('high-priority-updates', data.highPriorityUpdates.toString())
  core.setOutput('average-risk-level', data.averageRiskLevel.toString())
  core.setOutput('categorization-confidence', data.confidence)
}

export function setGitOperationOutputs(data: GitOperationOutputs): void {
  core.setOutput('commit-success', data.commitSuccess.toString())
  core.setOutput('commit-sha', data.commitSha)
  core.setOutput('committed-files', JSON.stringify(data.committedFiles))
  core.setOutput('git-error', data.gitError)
  core.setOutput('push-success', data.pushSuccess.toString())
  core.setOutput('push-error', data.pushError)
  core.setOutput('conflicts-resolved', data.conflictsResolved.toString())
  core.setOutput('conflict-resolution', data.conflictResolution)
  core.setOutput('branch-updated', data.branchUpdated.toString())
  core.setOutput('retry-attempts', data.retryAttempts.toString())
}

export function setGitOperationErrorOutputs(): void {
  core.setOutput('commit-success', 'false')
  core.setOutput('commit-sha', '')
  core.setOutput('committed-files', JSON.stringify([]))
  core.setOutput('git-error', '')
  core.setOutput('push-success', 'false')
  core.setOutput('push-error', '')
  core.setOutput('conflicts-resolved', 'false')
  core.setOutput('conflict-resolution', '')
  core.setOutput('branch-updated', 'false')
  core.setOutput('retry-attempts', '0')
}

export function setPRManagementOutputs(data: PRManagementOutputs): void {
  core.setOutput('pr-description-updated', data.prDescriptionUpdated.toString())
  core.setOutput('pr-description-error', data.prDescriptionError)
  core.setOutput('pr-comment-created', data.prCommentCreated.toString())
  core.setOutput('pr-comment-error', data.prCommentError)
}

export function setPRManagementErrorOutputs(): void {
  core.setOutput('pr-description-updated', 'false')
  core.setOutput('pr-description-error', '')
  core.setOutput('pr-comment-created', 'false')
  core.setOutput('pr-comment-error', '')
}

export function setGroupedPROutputs(data: GroupedPROutputs): void {
  core.setOutput('grouped-prs-enabled', data.enabled.toString())
  core.setOutput('grouped-prs-found', data.found.toString())
  core.setOutput('grouped-prs-updated', data.updated.toString())
  core.setOutput('grouped-prs-failed', data.failed.toString())
  core.setOutput('grouped-pr-strategy', data.strategy)
  core.setOutput('grouped-pr-identifier', data.identifier)
  core.setOutput('grouped-pr-results', JSON.stringify(data.results))
}

export function setGroupedPRErrorOutputs(): void {
  core.setOutput('grouped-prs-updated', '0')
  core.setOutput('grouped-prs-failed', '0')
  core.setOutput('grouped-pr-strategy', 'none')
  core.setOutput('grouped-pr-identifier', '')
  core.setOutput('grouped-pr-results', JSON.stringify([]))
}

export function setErrorOutputs(): void {
  setChangesetOutputs({
    changesetsCreated: 0,
    changesetFiles: [],
    updateType: '',
    dependencies: [],
    changesetSummary: '',
  })

  setMultiPackageOutputs({
    strategy: 'single',
    workspacePackagesCount: 0,
    packageRelationshipsCount: 0,
    affectedPackages: [],
    reasoning: [],
  })

  setCategorizationOutputs({
    primaryCategory: '',
    allCategories: [],
    summary: {},
    securityUpdates: 0,
    breakingChanges: 0,
    highPriorityUpdates: 0,
    averageRiskLevel: 0,
    confidence: 'low',
  })

  setGitOperationErrorOutputs()
  setPRManagementErrorOutputs()
}
