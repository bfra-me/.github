import type {Octokit} from '@octokit/rest'
import * as core from '@actions/core'
import {diffCollections} from '../diff.js'

interface RulesetConfig {
  name: string
  [key: string]: unknown
}

interface CurrentRuleset {
  id: number
  name: string
}

interface RulesetIdentity {
  id?: number
  name: string
}

function getRulesetKey(ruleset: {name: string}): string {
  return ruleset.name.toLowerCase()
}

export async function rulesetsPlugin(
  octokit: Octokit,
  owner: string,
  repo: string,
  config: unknown,
): Promise<void> {
  if (!Array.isArray(config)) {
    core.warning('rulesets config must be an array, skipping')
    return
  }

  if (config.length === 0) {
    return
  }

  const response = await octokit.rest.repos.getRepoRulesets({owner, repo})
  const currentRulesets = response.data.filter(isCurrentRuleset)
  const desiredRulesets = config.filter(isRulesetConfig)
  const desiredRulesetsByName = new Map(
    desiredRulesets.map(ruleset => [getRulesetKey(ruleset), ruleset]),
  )
  const currentRulesetIdentities: RulesetIdentity[] = currentRulesets.map(ruleset => ({
    id: ruleset.id,
    name: ruleset.name,
  }))
  const desiredRulesetIdentities: RulesetIdentity[] = desiredRulesets.map(ruleset => ({
    name: ruleset.name,
  }))
  const {add, update, remove} = diffCollections(
    currentRulesetIdentities,
    desiredRulesetIdentities,
    getRulesetKey,
  )
  const currentRulesetsByName = new Map(
    currentRulesets.map(ruleset => [getRulesetKey(ruleset), ruleset]),
  )

  for (const ruleset of add) {
    const desiredRuleset = desiredRulesetsByName.get(getRulesetKey(ruleset))

    if (desiredRuleset == null) {
      continue
    }

    core.info(`Creating ruleset: ${desiredRuleset.name}`)
    await octokit.rest.repos.createRepoRuleset({
      owner,
      repo,
      ...desiredRuleset,
    } as Parameters<(typeof octokit.rest.repos)['createRepoRuleset']>[0])
  }

  for (const ruleset of update) {
    const currentRuleset = currentRulesetsByName.get(getRulesetKey(ruleset))
    const desiredRuleset = desiredRulesetsByName.get(getRulesetKey(ruleset))

    if (currentRuleset != null && desiredRuleset != null) {
      core.info(`Updating ruleset: ${desiredRuleset.name} (id: ${currentRuleset.id})`)
      await octokit.rest.repos.updateRepoRuleset({
        owner,
        repo,
        ruleset_id: currentRuleset.id,
        ...desiredRuleset,
      } as Parameters<(typeof octokit.rest.repos)['updateRepoRuleset']>[0])
    }
  }

  for (const ruleset of remove) {
    if (ruleset.id != null) {
      core.info(`Deleting ruleset: ${ruleset.name} (id: ${ruleset.id})`)
      await octokit.rest.repos.deleteRepoRuleset({
        owner,
        repo,
        ruleset_id: ruleset.id,
      })
    }
  }
}

function isRulesetConfig(value: unknown): value is RulesetConfig {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return 'name' in value && typeof value.name === 'string'
}

function isCurrentRuleset(value: unknown): value is CurrentRuleset {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return (
    'id' in value &&
    typeof value.id === 'number' &&
    'name' in value &&
    typeof value.name === 'string'
  )
}
