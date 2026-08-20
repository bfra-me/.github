import type {ChangesetInfo} from '../multi-package-changeset-generator'
import type {ChangesetDeduplicationConfig, ExistingChangesetInfo} from './deduplicator-types'
import {promises as fs} from 'node:fs'
import path from 'node:path'
import * as core from '@actions/core'

type ExistingAnalyzerConfig = Pick<
  ChangesetDeduplicationConfig,
  'maxExistingChangesetAge' | 'workingDirectory'
>

type ParsedExistingChangeset = Pick<ExistingChangesetInfo, 'releases' | 'summary'>

export async function analyzeExistingChangesets(
  config: ExistingAnalyzerConfig,
  changedFiles: string[] = [],
): Promise<ExistingChangesetInfo[]> {
  const existingChangesets: ExistingChangesetInfo[] = []
  const changesetDirectory = path.join(config.workingDirectory, '.changeset')

  try {
    if (!(await directoryExists(changesetDirectory))) {
      return existingChangesets
    }

    // Renovate branches inherit main's pending changesets, so only inspect files added by this PR.
    const prChangesetBasenames = changedFiles
      .filter(f => f.startsWith('.changeset/') && f.endsWith('.md') && !f.endsWith('README.md'))
      .map(f => path.basename(f))

    if (prChangesetBasenames.length === 0) {
      return existingChangesets
    }

    for (const file of prChangesetBasenames) {
      try {
        const filePath = path.join(changesetDirectory, file)
        const stat = await fs.stat(filePath)
        const age = Math.floor((Date.now() - stat.mtime.getTime()) / (1000 * 60 * 60 * 24))
        if (age > config.maxExistingChangesetAge) {
          continue
        }

        const content = await fs.readFile(filePath, 'utf8')
        const parsed = parseExistingChangeset(content)
        if (parsed == null) {
          continue
        }

        existingChangesets.push({
          filename: file,
          filePath,
          content,
          releases: parsed.releases,
          summary: parsed.summary,
          createdAt: stat.mtime,
          age,
        })
      } catch (error) {
        core.warning(
          `Failed to analyze existing changeset ${file}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  } catch (error) {
    core.warning(
      `Failed to read changeset directory: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  return existingChangesets
}

function parseExistingChangeset(content: string): ParsedExistingChangeset | null {
  try {
    const lines = content.split('\n')
    const frontmatterLines: string[] = []
    const summaryLines: string[] = []
    let inFrontmatter = false
    let frontmatterEnded = false

    for (const line of lines) {
      if (line.trim() === '---') {
        if (inFrontmatter) {
          frontmatterEnded = true
          inFrontmatter = false
        } else {
          inFrontmatter = true
        }

        continue
      }

      if (inFrontmatter) {
        frontmatterLines.push(line)
      } else if (frontmatterEnded) {
        summaryLines.push(line)
      }
    }

    return {
      releases: frontmatterLines.flatMap(parseReleaseLine),
      summary: summaryLines.join('\n').trim(),
    }
  } catch {
    return null
  }
}

function parseReleaseLine(line: string): ChangesetInfo['releases'] {
  const match = line.match(/^['"]([^'"]+)['"]:\s*(patch|minor|major)$/)
  if (match?.[1] == null || match[2] == null) {
    return []
  }

  return [{name: match[1], type: match[2] as ChangesetInfo['releases'][number]['type']}]
}

async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath)
    return stat.isDirectory()
  } catch {
    return false
  }
}
