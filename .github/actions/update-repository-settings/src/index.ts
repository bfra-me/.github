import * as core from '@actions/core'
import * as github from '@actions/github'
import {Octokit} from '@octokit/rest'
import {loadConfig} from './config.js'
import {applySettings} from './plugins/index.js'

export async function run(): Promise<void> {
  const token = core.getInput('token', {required: true})
  const settingsPath = core.getInput('settings') || '.github/settings.yml'
  const octokit = new Octokit({auth: token})
  const {owner, repo} = github.context.repo

  core.info('Loading repository settings...')
  const config = await loadConfig(octokit, owner, repo, settingsPath)

  core.info('Applying repository settings...')
  await applySettings(octokit, owner, repo, config)

  core.info('Repository settings applied successfully')
}

run().catch(error => {
  core.setFailed(error instanceof Error ? error.message : String(error))
})
