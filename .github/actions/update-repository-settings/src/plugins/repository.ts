import type {Octokit} from '@octokit/rest'
import * as core from '@actions/core'
import {normalizeCommaDelimited} from '../normalize.js'

interface RepoConfig {
  topics?: unknown
  enable_automated_security_fixes?: unknown
  enable_vulnerability_alerts?: unknown
  [key: string]: unknown
}

const REPOSITORY_UPDATE_FIELDS = [
  'name',
  'description',
  'homepage',
  'private',
  'visibility',
  'has_issues',
  'has_projects',
  'has_wiki',
  'has_downloads',
  'default_branch',
  'allow_squash_merge',
  'allow_merge_commit',
  'allow_rebase_merge',
  'allow_auto_merge',
  'delete_branch_on_merge',
  'allow_update_branch',
] as const

export async function repositoryPlugin(
  octokit: Octokit,
  owner: string,
  repo: string,
  config: unknown,
): Promise<void> {
  if (
    config === null ||
    config === undefined ||
    typeof config !== 'object' ||
    Array.isArray(config)
  ) {
    core.warning('repository config must be an object, skipping')
    return
  }

  const repoConfig = config as RepoConfig

  const updateParams: Record<string, unknown> = {owner, repo}
  for (const field of REPOSITORY_UPDATE_FIELDS) {
    if (field in repoConfig && repoConfig[field] !== undefined) {
      updateParams[field] = repoConfig[field]
    }
  }

  if (Object.keys(updateParams).length > 2) {
    core.info('Updating repository settings')
    await octokit.rest.repos.update(
      updateParams as Parameters<(typeof octokit.rest.repos)['update']>[0],
    )
  }

  if ('topics' in repoConfig) {
    const topics = normalizeCommaDelimited(repoConfig.topics)
    core.info(`Setting repository topics: ${topics.join(', ')}`)
    await octokit.rest.repos.replaceAllTopics({owner, repo, names: topics})
  }

  if ('enable_automated_security_fixes' in repoConfig) {
    const enableAutomatedSecurityFixes = repoConfig.enable_automated_security_fixes
    if (enableAutomatedSecurityFixes === true) {
      core.info('Enabling automated security fixes')
      await octokit.request('PUT /repos/{owner}/{repo}/automated-security-fixes', {owner, repo})
    } else if (enableAutomatedSecurityFixes === false) {
      core.info('Disabling automated security fixes')
      await octokit.request('DELETE /repos/{owner}/{repo}/automated-security-fixes', {owner, repo})
    }
  }

  if ('enable_vulnerability_alerts' in repoConfig) {
    const enableVulnerabilityAlerts = repoConfig.enable_vulnerability_alerts
    if (enableVulnerabilityAlerts === true) {
      core.info('Enabling vulnerability alerts')
      await octokit.request('PUT /repos/{owner}/{repo}/vulnerability-alerts', {owner, repo})
    } else if (enableVulnerabilityAlerts === false) {
      core.info('Disabling vulnerability alerts')
      await octokit.request('DELETE /repos/{owner}/{repo}/vulnerability-alerts', {owner, repo})
    }
  }
}
