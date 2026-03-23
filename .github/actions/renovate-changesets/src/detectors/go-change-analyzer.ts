import type {Octokit} from '@octokit/rest'
import type {GoModDependencyChange} from './go-detector-types.js'
import {parseGoModChanges, parseGoSumChanges} from './go-change-parser.js'

export function isGoModFile(filename: string): boolean {
  const parts = filename.split('/')
  const base = parts.at(-1)
  return base === 'go.mod' || base === 'go.sum'
}

export async function analyzeGoModFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  filename: string,
): Promise<GoModDependencyChange[]> {
  const changes: GoModDependencyChange[] = []

  try {
    const {data: comparison} = await octokit.rest.repos.compareCommits({
      owner,
      repo,
      base: `refs/pull/${prNumber}/base`,
      head: `refs/pull/${prNumber}/head`,
    })

    const fileData = comparison.files?.find(file => file.filename === filename)
    if (!fileData || !fileData.patch) {
      return changes
    }

    if (filename.endsWith('go.mod')) {
      changes.push(...parseGoModChanges(filename, fileData.patch))
    } else if (filename.endsWith('go.sum')) {
      changes.push(...parseGoSumChanges(filename, fileData.patch))
    }

    return changes
  } catch (error) {
    console.warn(`Error analyzing Go mod file ${filename}: ${error}`)
    return changes
  }
}

export function deduplicateGoChanges(changes: GoModDependencyChange[]): GoModDependencyChange[] {
  const seen = new Set<string>()
  return changes.filter(change => {
    const key = `${change.name}:${change.modFile}:${change.currentVersion}:${change.newVersion}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}
