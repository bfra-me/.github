import type {ChangesetInfo, MultiPackageChangesetConfig} from './types'
import {promises as fs} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import * as core from '@actions/core'
import {getExecOutput} from '@actions/exec'
import write from '@changesets/write'

export async function writeChangesetFiles(
  changesets: ChangesetInfo[],
  config: MultiPackageChangesetConfig,
): Promise<string[]> {
  const filesCreated: string[] = []

  const changesetDir = path.join(config.workingDirectory, '.changeset')
  await fs.mkdir(changesetDir, {recursive: true})

  for (const changeset of changesets) {
    const filePath = path.join(changesetDir, changeset.filename)

    try {
      await fs.access(filePath)
      core.info(`Changeset already exists: ${changeset.filename}`)
      continue
    } catch {}

    try {
      if (config.useOfficialChangesets && !isTestEnvironment()) {
        const changesetForWrite = {
          summary: changeset.summary,
          releases: changeset.releases,
        }

        const uniqueId = await write(changesetForWrite, config.workingDirectory)
        const generatedPath = path.join(changesetDir, `${uniqueId}.md`)

        const changesetContent = await fs.readFile(generatedPath, 'utf8')
        await fs.writeFile(filePath, changesetContent, 'utf8')
        await fs.unlink(generatedPath)

        core.info(`Created changeset using @changesets/write: ${changeset.filename}`)
      } else {
        const frontmatter = changeset.releases
          .map(release => `'${release.name}': ${release.type}`)
          .join('\n')

        const content = `---
${frontmatter}
---

${changeset.summary}
`
        await fs.writeFile(filePath, content, 'utf8')
        core.info(`Created changeset manually: ${changeset.filename}`)
      }

      filesCreated.push(`.changeset/${changeset.filename}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      core.warning(`Failed to create changeset ${changeset.filename}: ${errorMessage}`)
    }
  }

  return filesCreated
}

export async function getGitShortSha(): Promise<string> {
  try {
    const {stdout: shortSha} = await getExecOutput('git', ['rev-parse', '--short', 'HEAD'])
    return shortSha.trim()
  } catch (error) {
    core.warning(`Failed to get git SHA: ${error instanceof Error ? error.message : String(error)}`)
    return 'unknown'
  }
}

export function isTestEnvironment(): boolean {
  return Boolean(process.env.VITEST || process.env.NODE_ENV === 'test')
}
