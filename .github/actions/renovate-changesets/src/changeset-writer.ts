import type {ChangesetInfo, MultiPackageChangesetConfig} from './multi-package-gen/types'
import {promises as fs} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import * as core from '@actions/core'
import {getExecOutput} from '@actions/exec'
import write from '@changesets/write'

export interface ChangesetWriteResult {
  filesCreated: string[]
  skippedExisting: string[]
  failed: string[]
}

export async function writeRenovateChangeset(
  changeset: {releases: {name: string; type: string}[]; summary: string},
  workingDirectory: string,
): Promise<string> {
  try {
    // Ensure .changeset directory exists
    const changesetDir = path.join(workingDirectory, '.changeset')
    await fs.mkdir(changesetDir, {recursive: true})

    // Get git short SHA for naming reference
    const {stdout: shortSha} = await getExecOutput('git', ['rev-parse', '--short', 'HEAD'])
    const shaReference = shortSha.trim()
    const expectedChangesetName = `renovate-${shaReference}.md`
    const expectedChangesetPath = path.join(changesetDir, expectedChangesetName)

    // Check if changeset already exists
    try {
      await fs.access(expectedChangesetPath)
      core.info(`Changeset already exists: ${expectedChangesetName}`)
      return 'existing'
    } catch {
      // File doesn't exist, proceed with creation
    }

    const created = await writeOneChangeset(
      changeset,
      expectedChangesetName,
      expectedChangesetPath,
      workingDirectory,
      true,
    )
    if (!created) {
      throw new Error(`Failed to create changeset ${expectedChangesetName}`)
    }

    return expectedChangesetName
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    core.error(`Failed to create changeset: ${errorMessage}`)
    throw new Error(`Failed to create changeset: ${errorMessage}`)
  }
}

export async function writeChangesetFiles(
  changesets: ChangesetInfo[],
  config: MultiPackageChangesetConfig,
): Promise<ChangesetWriteResult> {
  const filesCreated: string[] = []
  const skippedExisting: string[] = []
  const failed: string[] = []
  const changesetDir = path.join(config.workingDirectory, '.changeset')

  await fs.mkdir(changesetDir, {recursive: true})

  for (const changeset of changesets) {
    const filePath = path.join(changesetDir, changeset.filename)

    try {
      await fs.access(filePath)
      core.info(`Changeset already exists: ${changeset.filename}`)
      skippedExisting.push(`.changeset/${changeset.filename}`)
      continue
    } catch {
      // File does not exist; proceed with creation.
    }

    const created = await writeOneChangeset(
      changeset,
      changeset.filename,
      filePath,
      config.workingDirectory,
      config.useOfficialChangesets,
    )
    if (created) {
      filesCreated.push(`.changeset/${changeset.filename}`)
    } else {
      failed.push(`.changeset/${changeset.filename}`)
    }
  }

  return {filesCreated, skippedExisting, failed}
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
  // VITEST is deliberately the runner's own variable, not a generic CI/test flag.
  return Boolean(process.env.VITEST || process.env.NODE_ENV === 'test')
}

async function writeOneChangeset(
  changeset: {releases: {name: string; type: string}[]; summary: string},
  filename: string,
  filePath: string,
  workingDirectory: string,
  useOfficialChangesets: boolean,
): Promise<boolean> {
  const changesetForWrite = {
    summary: changeset.summary,
    releases: changeset.releases.map(release => ({
      name: release.name,
      type: release.type as 'patch' | 'minor' | 'major',
    })),
  }

  if (useOfficialChangesets && !isTestEnvironment()) {
    try {
      const uniqueId = await write(changesetForWrite, workingDirectory)
      const generatedPath = path.join(path.dirname(filePath), `${uniqueId}.md`)
      const changesetContent = await fs.readFile(generatedPath, 'utf8')
      await fs.writeFile(filePath, changesetContent, 'utf8')
      await fs.unlink(generatedPath)
      core.info(`Created changeset using @changesets/write: ${filename}`)
      return true
    } catch (writeError) {
      core.warning(
        `@changesets/write failed, falling back to manual creation: ${writeError instanceof Error ? writeError.message : String(writeError)}`,
      )
    }
  }

  try {
    const frontmatter = changeset.releases
      .map(release => `'${release.name}': ${release.type}`)
      .join('\n')
    const content = `---
${frontmatter}
---

${changeset.summary}
`
    await fs.writeFile(filePath, content, 'utf8')
    core.info(`Created changeset manually: ${filename}`)
    return true
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    core.warning(`Failed to create changeset ${filename}: ${errorMessage}`)
    return false
  }
}
