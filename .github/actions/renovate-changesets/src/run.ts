import {promises as fs} from 'node:fs'
import path from 'node:path'
import * as core from '@actions/core'
import {setEmptyOutputs, setErrorOutputs, setSkippedOutputs} from './action-outputs'
import {analyzeRunContext} from './run-analysis'
import {generateChangesetsFromAnalysis} from './run-generation'
import {initializeRun} from './run-init'
import {runPostGenerationOperations} from './run-pr'

export async function run(): Promise<void> {
  try {
    const initialization = await initializeRun()
    if (initialization == null) {
      return
    }

    if (
      await hasChangesetFromThisPullRequest(
        initialization.workingDirectory,
        initialization.changedFiles,
      )
    ) {
      core.info('This pull request already carries a changeset, skipping changeset creation')
      setEmptyOutputs()
      return
    }

    const analysis = analyzeRunContext(
      initialization.changedFiles,
      initialization.enhancedDependencies,
      initialization.prContext,
      initialization.config,
    )

    if (analysis.filteredFiles.length === 0) {
      core.info('No relevant files changed, skipping')
      return
    }

    const generation = await generateChangesetsFromAnalysis({
      config: initialization.config,
      owner: initialization.owner,
      repo: initialization.repo,
      prNumber: initialization.pr.number,
      prContext: initialization.prContext,
      prBody: initialization.pr.body ?? initialization.prContext.prBody,
      prTitle: initialization.pr.title || '',
      workingDirectory: initialization.workingDirectory,
      changedFiles: initialization.changedFiles,
      enhancedDependencies: initialization.enhancedDependencies,
      impactAssessment: analysis.impactAssessment,
      categorizationResult: analysis.categorizationResult,
      updateType: analysis.updateType,
      changesetType: analysis.changesetType,
    })

    if (generation == null) {
      setSkippedOutputs()
      return
    }

    await runPostGenerationOperations({
      config: initialization.config,
      octokit: initialization.octokit,
      owner: initialization.owner,
      repo: initialization.repo,
      branchName: initialization.branchName,
      workingDirectory: initialization.workingDirectory,
      pr: initialization.pr,
      prContext: initialization.prContext,
      changesetContent: generation.changesetContent,
      releases: generation.releases,
      dependencyNames: generation.dependencyNames,
      changesetPath: generation.changesetPath,
      categorizationResult: generation.categorizationResult,
      multiPackageResult: generation.multiPackageResult,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined

    core.error(`Action failed: ${errorMessage}`)
    if (errorStack != null) {
      core.debug(`Error stack: ${errorStack}`)
    }

    setErrorOutputs()
    core.setFailed(`Action failed: ${errorMessage}`)
  }
}

/**
 * Reports whether this pull request already carries a changeset that still exists on disk.
 *
 * Two failure modes have to be avoided at once, and they pull in opposite directions.
 *
 * Asking "does any changeset exist" is wrong: `.changeset/` normally holds every unreleased
 * changeset in the repository, so on this repo it is never empty between releases. That check would
 * skip every run and the action would silently stop producing changesets entirely.
 *
 * Asking the GitHub API's changed-file list alone is also wrong: Renovate force-pushes to rebase,
 * which erases a changeset committed by an earlier run while the API list still reports it. That
 * check would skip regeneration and the pull request would merge with no changeset.
 *
 * So both signals are required. The changed-file list identifies which changesets belong to this
 * pull request, and disk confirms one of them survived.
 */
export async function hasChangesetFromThisPullRequest(
  workingDirectory: string,
  changedFiles: string[],
): Promise<boolean> {
  const changesetFiles = changedFiles.filter(
    file => file.startsWith('.changeset/') && file.endsWith('.md') && !file.endsWith('README.md'),
  )
  if (changesetFiles.length === 0) return false

  const stat = fs.stat
  if (typeof stat !== 'function') return false

  for (const file of changesetFiles) {
    try {
      const entry = await stat(path.join(workingDirectory, file))
      if (entry.isFile()) return true
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue
      throw error
    }
  }

  return false
}
