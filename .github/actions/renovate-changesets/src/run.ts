import {promises as fs} from 'node:fs'
import path from 'node:path'
import * as core from '@actions/core'
import {setEmptyOutputs, setErrorOutputs} from './action-outputs'
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

    if (await hasChangesetOnDisk(initialization.workingDirectory)) {
      core.info('Changeset files already exist on disk at HEAD, skipping changeset creation')
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

export async function hasChangesetOnDisk(workingDirectory: string): Promise<boolean> {
  const changesetDirectory = path.join(workingDirectory, '.changeset')

  try {
    const readdir = fs.readdir
    if (typeof readdir !== 'function') return false
    const entries = await readdir(changesetDirectory, {withFileTypes: true})
    return entries.some(
      entry => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md',
    )
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false
    throw error
  }
}
