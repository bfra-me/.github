import type {Octokit} from '@octokit/rest'
import * as core from '@actions/core'
import {diffCollections} from '../diff.js'
import {normalizeColor} from '../normalize.js'

interface LabelConfig {
  name: string
  color?: string
  description?: string
}

interface CurrentLabel {
  name: string
  color: string
  description?: string | null
}

interface ComparableLabel {
  name: string
  color?: string
  description?: string | null
}

function hasLabelConfig(value: unknown): value is LabelConfig {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return 'name' in value && typeof value.name === 'string'
}

function toComparableCurrentLabel(label: CurrentLabel): ComparableLabel {
  return {
    ...label,
    color: normalizeColor(label.color) ?? label.color,
    description: label.description ?? '',
  }
}

function toComparableDesiredLabel(label: LabelConfig): ComparableLabel {
  return {
    ...label,
    color: normalizeColor(label.color),
    description: label.description ?? '',
  }
}

function labelsDiffer(current: ComparableLabel, desired: ComparableLabel): boolean {
  return current.color !== desired.color || current.description !== desired.description
}

/** Summary output is report-only; a failed write must not fail a run whose mutations already applied. */
async function writeLabelsSummary(message: string): Promise<void> {
  try {
    await core.summary.addHeading('Labels', 3).addRaw(message, true).write()
  } catch (error) {
    core.warning(
      `Failed to write labels step summary: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export async function labelsPlugin(
  octokit: Octokit,
  owner: string,
  repo: string,
  config: unknown,
): Promise<void> {
  if (!Array.isArray(config)) {
    core.warning('labels config must be an array, skipping')
    return
  }

  const desiredLabels = config.filter(hasLabelConfig)
  const currentLabels: CurrentLabel[] = []

  for await (const response of octokit.paginate.iterator(octokit.rest.issues.listLabelsForRepo, {
    owner,
    repo,
    per_page: 100,
  })) {
    currentLabels.push(...response.data)
  }

  const comparableCurrentLabels = currentLabels.map(toComparableCurrentLabel)
  const comparableDesiredLabels = desiredLabels.map(toComparableDesiredLabel)
  const keyFn = (label: {name: string}): string => label.name.toLowerCase()

  const {add, update, remove} = diffCollections(
    comparableCurrentLabels,
    comparableDesiredLabels,
    keyFn,
  )
  const currentByName = new Map(comparableCurrentLabels.map(label => [keyFn(label), label]))
  const labelsToUpdate = update.filter(label => {
    const currentLabel = currentByName.get(keyFn(label))
    return currentLabel != null && labelsDiffer(currentLabel, label)
  })

  for (const label of add) {
    core.info(`Creating label: ${label.name}`)
    await octokit.rest.issues.createLabel({
      owner,
      repo,
      name: label.name,
      color: normalizeColor(label.color) ?? '',
      description: label.description ?? '',
    })
  }

  for (const label of labelsToUpdate) {
    core.info(`Updating label: ${label.name}`)
    await octokit.rest.issues.updateLabel({
      owner,
      repo,
      name: label.name,
      color: normalizeColor(label.color) ?? '',
      description: label.description ?? '',
    })
  }

  if (remove.length > 0) {
    const remaining = currentLabels.length - remove.length + add.length

    if (remove.length > remaining) {
      const removedNames = remove.map(label => label.name)
      core.warning(
        `Skipping deletion of ${remove.length} label(s) (${removedNames.join(', ')}): ` +
          `deletions would exceed the number of labels remaining (${remaining}). ` +
          `Check the '_extends' base config or local 'labels:' config for missing entries.`,
      )

      await writeLabelsSummary(
        `Skipped deleting ${remove.length} label(s) because deletions exceed the labels ` +
          `remaining (${remaining}): ${removedNames.join(', ')}`,
      )
    } else {
      const deletedNames: string[] = []
      const failedNames: string[] = []

      for (const label of remove) {
        core.warning(`Deleting label: ${label.name}`)
        try {
          await octokit.rest.issues.deleteLabel({owner, repo, name: label.name})
          deletedNames.push(label.name)
        } catch (error) {
          failedNames.push(label.name)
          core.warning(
            `Failed to delete label "${label.name}": ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }

      const summaryLines: string[] = []
      if (deletedNames.length > 0) {
        summaryLines.push(`Deleted ${deletedNames.length} label(s): ${deletedNames.join(', ')}`)
      }
      if (failedNames.length > 0) {
        summaryLines.push(
          `Failed to delete ${failedNames.length} label(s): ${failedNames.join(', ')}`,
        )
      }

      if (summaryLines.length > 0) {
        await writeLabelsSummary(summaryLines.join('\n'))
      }
    }
  }
}
