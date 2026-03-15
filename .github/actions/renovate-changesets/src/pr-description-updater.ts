import type {Octokit} from '@octokit/rest'
import * as core from '@actions/core'
import {createChangesetInfoSection} from './changeset-info-formatter'

export async function updatePRDescription(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
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
): Promise<void> {
  try {
    const {data: currentPR} = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    })

    const originalDescription = currentPR.body || ''

    const changesetSection = createChangesetInfoSection(
      changesetContent,
      releases,
      dependencies,
      categorizationResult,
      multiPackageResult,
    )

    const changesetMarker = '<!-- CHANGESET_INFO -->'
    const changesetEndMarker = '<!-- /CHANGESET_INFO -->'

    let newDescription: string

    if (originalDescription.includes(changesetMarker)) {
      const startIndex = originalDescription.indexOf(changesetMarker)
      const endIndex = originalDescription.indexOf(changesetEndMarker)

      if (endIndex === -1) {
        newDescription = `${originalDescription}\n\n${changesetSection}`
      } else {
        newDescription =
          originalDescription.slice(0, startIndex) +
          changesetSection +
          originalDescription.slice(endIndex + changesetEndMarker.length)
      }
    } else {
      newDescription = `${originalDescription}\n\n${changesetSection}`
    }

    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      body: newDescription,
    })

    core.info(`Updated PR #${prNumber} description with changeset information`)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    core.warning(`Failed to update PR description: ${errorMessage}`)
    throw error
  }
}
