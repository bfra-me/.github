import type {ChangesetInfo, MultiPackageChangesetConfig} from './multi-package-gen/types'
import {promises as fs} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import * as core from '@actions/core'
import {getExecOutput} from '@actions/exec'
import write from '@changesets/write'

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

    // TASK-021: Use @changesets/write for changeset generation (with fallback for compatibility)
    const changesetForWrite = {
      summary: changeset.summary,
      releases: changeset.releases.map(release => ({
        name: release.name,
        type: release.type as 'patch' | 'minor' | 'major',
      })),
    }

    // The Vitest runner sets VITEST itself; prefer that deliberate runner variable over a generic
    // CI flag that could be set accidentally. NODE_ENV remains as the existing compatibility fallback.
    // Try to use @changesets/write, but fallback to manual creation for test environments
    const isTestEnvironment = process.env.VITEST || process.env.NODE_ENV === 'test'

    if (isTestEnvironment) {
      core.info('Test environment detected, using manual changeset creation for compatibility')
    } else {
      try {
        // Use @changesets/write to create a temporary changeset
        const uniqueId = await write(changesetForWrite, workingDirectory)

        // Read the generated content and move it to our expected location
        const generatedPath = path.join(changesetDir, `${uniqueId}.md`)
        const changesetContent = await fs.readFile(generatedPath, 'utf8')

        // Write to our expected filename and clean up the temporary one
        await fs.writeFile(expectedChangesetPath, changesetContent, 'utf8')
        await fs.unlink(generatedPath)

        core.info(`Created changeset using @changesets/write: ${expectedChangesetName}`)
        return expectedChangesetName
      } catch (writeError) {
        core.warning(
          `@changesets/write failed, falling back to manual creation: ${writeError instanceof Error ? writeError.message : String(writeError)}`,
        )
      }
    }

    // Fallback: Create changeset content manually (maintains backward compatibility)
    const frontmatter = changeset.releases
      .map(release => `'${release.name}': ${release.type}`)
      .join('\n')

    const content = `---
${frontmatter}
---

${changeset.summary}
`

    // Write the changeset file directly
    await fs.writeFile(expectedChangesetPath, content, 'utf8')
    core.info(`Created changeset manually: ${expectedChangesetName}`)
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
    } catch {
      // File does not exist; proceed with creation.
    }

    try {
      if (config.useOfficialChangesets && !isTestEnvironment()) {
        const uniqueId = await write(
          {summary: changeset.summary, releases: changeset.releases},
          config.workingDirectory,
        )
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
  // VITEST is deliberately the runner's own variable, not a generic CI/test flag.
  return Boolean(process.env.VITEST || process.env.NODE_ENV === 'test')
}
