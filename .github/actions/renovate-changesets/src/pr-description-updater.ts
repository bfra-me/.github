import type {Octokit} from '@octokit/rest'
import * as core from '@actions/core'

export interface CategorizationInfo {
  primaryCategory: string
  allCategories: string[]
  summary: {
    securityUpdates: number
    breakingChanges: number
    highPriorityUpdates: number
    averageRiskLevel: number
  }
  confidence: string
}

export interface MultiPackageInfo {
  strategy: string
  reasoning: string[]
}

export interface ReleaseEntry {
  name: string
  type: 'patch' | 'minor' | 'major'
}

export function appendSharedChangesetSections(
  sections: string[],
  dependencies: string[],
  releases: ReleaseEntry[],
  categorizationResult: CategorizationInfo,
  multiPackageResult: MultiPackageInfo,
): void {
  if (dependencies.length > 0) {
    sections.push('### 📦 Dependencies Updated')
    for (const dep of dependencies) {
      sections.push(`- ${dep}`)
    }
    sections.push('')
  }

  if (releases.length > 0) {
    sections.push('### 🚀 Packages to Release')
    for (const release of releases) {
      const icon = release.type === 'major' ? '🔴' : release.type === 'minor' ? '🟡' : '🟢'
      sections.push(`- ${icon} **${release.name}**: ${release.type}`)
    }
    sections.push('')
  }

  sections.push('### 📊 Update Analysis')
  sections.push(`- **Primary Category**: ${categorizationResult.primaryCategory}`)
  sections.push(`- **All Categories**: ${categorizationResult.allCategories.join(', ')}`)
  sections.push(`- **Confidence**: ${categorizationResult.confidence}`)

  if (categorizationResult.summary.securityUpdates > 0) {
    sections.push(`- **🔒 Security Updates**: ${categorizationResult.summary.securityUpdates}`)
  }
  if (categorizationResult.summary.breakingChanges > 0) {
    sections.push(`- **⚠️ Breaking Changes**: ${categorizationResult.summary.breakingChanges}`)
  }
  if (categorizationResult.summary.highPriorityUpdates > 0) {
    sections.push(`- **🔥 High Priority**: ${categorizationResult.summary.highPriorityUpdates}`)
  }

  sections.push(`- **Risk Level**: ${categorizationResult.summary.averageRiskLevel}/100`)
  sections.push('')

  if (multiPackageResult.strategy !== 'single') {
    sections.push('### 🏗️ Multi-Package Strategy')
    sections.push(`- **Strategy**: ${multiPackageResult.strategy}`)
    if (multiPackageResult.reasoning.length > 0) {
      sections.push('- **Reasoning**:')
      for (const reason of multiPackageResult.reasoning) {
        sections.push(`  - ${reason}`)
      }
    }
    sections.push('')
  }
}

export function createChangesetInfoSection(
  changesetContent: string,
  releases: ReleaseEntry[],
  dependencies: string[],
  categorizationResult: CategorizationInfo,
  multiPackageResult: MultiPackageInfo,
): string {
  const sections: string[] = ['<!-- CHANGESET_INFO -->', '## 📋 Changeset Information', '']

  sections.push('### Summary')
  sections.push(changesetContent)
  sections.push('')

  appendSharedChangesetSections(
    sections,
    dependencies,
    releases,
    categorizationResult,
    multiPackageResult,
  )

  sections.push('<!-- /CHANGESET_INFO -->')

  return sections.join('\n')
}

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
