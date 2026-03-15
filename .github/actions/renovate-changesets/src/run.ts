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

    if (initialization.changedFiles.some(file => file.startsWith('.changeset/'))) {
      core.info('Changeset files already exist, skipping changeset creation')
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
      prContext: initialization.prContext,
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
      categorizationResult: analysis.categorizationResult,
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
