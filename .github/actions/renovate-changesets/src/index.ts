import {promises as fs} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import * as core from '@actions/core'
import {getExecOutput} from '@actions/exec'
import {Octokit} from '@octokit/rest'
import {load} from 'js-yaml'

interface Config {
  updateTypes: {
    [key: string]: {
      changesetType: 'patch' | 'minor' | 'major'
      filePatterns: string[]
      template?: string
    }
  }
  defaultChangesetType: 'patch' | 'minor' | 'major'
  excludePatterns?: string[]
  branchPrefix?: string
  skipBranchPrefixCheck?: boolean
  sort?: boolean
  dryRun?: boolean
  commentPR?: boolean
}

const DEFAULT_CONFIG: Config = {
  updateTypes: {
    'github-actions': {
      changesetType: 'patch',
      filePatterns: [
        '.github/workflows/**/*.yaml',
        '.github/workflows/**/*.yml',
        '.github/actions/**/action.yaml',
        '.github/actions/**/action.yml',
      ],
    },
    npm: {
      changesetType: 'patch',
      filePatterns: [
        '**/package.json',
        '**/package-lock.json',
        '**/pnpm-lock.yaml',
        '**/yarn.lock',
      ],
    },
    docker: {
      changesetType: 'patch',
      filePatterns: ['**/Dockerfile', '**/docker-compose.yaml', '**/docker-compose.yml'],
    },
  },
  defaultChangesetType: 'patch',
}

async function getConfig(): Promise<Config> {
  const configFile = core.getInput('config-file')
  const configInline = core.getInput('config')

  // Read from action inputs, with fallback to environment variables
  const branchPrefix = core.getInput('branch-prefix') || process.env.BRANCH_PREFIX || 'renovate/'
  const skipBranchPrefixCheck =
    core.getBooleanInput('skip-branch-prefix-check') || process.env.SKIP_BRANCH_CHECK === 'TRUE'
  const sort = core.getBooleanInput('sort') || process.env.SORT_CHANGESETS === 'TRUE'
  const dryRun = core.getBooleanInput('dry-run')
  const commentPR = core.getBooleanInput('comment-pr')

  let config = {
    ...DEFAULT_CONFIG,
    branchPrefix,
    skipBranchPrefixCheck,
    sort,
    dryRun,
    commentPR,
  }

  if (configFile) {
    try {
      const fileContent = await fs.readFile(configFile, 'utf8')
      const fileConfig = load(fileContent) as Partial<Config>
      config = {...config, ...fileConfig}
    } catch (error) {
      core.warning(`Failed to read config file ${configFile}: ${error}`)
    }
  } else if (configInline) {
    try {
      const inlineConfig = load(configInline) as Partial<Config>
      config = {...config, ...inlineConfig}
    } catch (error) {
      core.warning(`Failed to parse inline config: ${error}`)
    }
  }

  return config
}

function matchesPatterns(filePath: string, patterns: string[]): boolean {
  return patterns.some(pattern => {
    const regex = new RegExp(pattern.replaceAll('**', '.*').replaceAll('*', '[^/]*'))
    return regex.test(filePath)
  })
}

function detectUpdateType(changedFiles: string[], config: Config): string | undefined {
  for (const [updateType, settings] of Object.entries(config.updateTypes)) {
    if (changedFiles.some(file => matchesPatterns(file, settings.filePatterns))) {
      return updateType
    }
  }
  return undefined
}

function extractDependencyInfo(
  prTitle: string,
  prBody: string,
): {dependencies: string[]; version?: string} {
  const dependencies: string[] = []
  let version: string | undefined

  // Extract from PR title (Renovate format: "chore(deps): update dependency-name to v1.2.3")
  const titleMatch = prTitle.match(/update\s+([@\w\-./]+)\s+to\s+v?(\S+)/i)
  if (titleMatch) {
    if (titleMatch[1]) {
      dependencies.push(titleMatch[1])
    }
    version = titleMatch[2]
  }

  // Extract from PR body
  const bodyDeps = prBody.match(/(?:updates?|upgrade?)\s+\S+/gi)
  if (bodyDeps) {
    dependencies.push(...bodyDeps.map(dep => dep.replace(/^(?:updates?|upgrade?)\s+/i, '')))
  }

  return {dependencies: [...new Set(dependencies)], version}
}

function generateChangesetContent(
  updateType: string,
  dependencies: string[],
  version: string | undefined,
  template?: string,
  shouldSort = false,
): string {
  if (template) {
    return template
      .replaceAll('{updateType}', updateType)
      .replaceAll('{dependencies}', dependencies.join(', '))
      .replaceAll('{version}', version || 'latest')
  }

  let sortedDependencies = dependencies
  if (shouldSort) {
    sortedDependencies = [...dependencies].sort()
  }

  // Create more descriptive changeset content
  if (sortedDependencies.length === 0) {
    return `Update ${updateType} dependencies${version ? ` to ${version}` : ''}`
  }

  if (sortedDependencies.length === 1) {
    const dep = sortedDependencies[0]
    return `Update ${updateType} dependency \`${dep}\`${version ? ` to \`${version}\`` : ''}`
  }

  // Multiple dependencies
  const depList = sortedDependencies.map(dep => `\`${dep}\``).join(', ')
  return `Update ${updateType} dependencies: ${depList}${version ? ` to \`${version}\`` : ''}`
}

function isValidBranch(branchName: string, branchPrefix: string, skipCheck: boolean): boolean {
  if (skipCheck) {
    return true
  }
  return branchName.startsWith(branchPrefix)
}

function sortChangesetReleases(
  releases: {name: string; type: 'patch' | 'minor' | 'major'}[],
): {name: string; type: 'patch' | 'minor' | 'major'}[] {
  return [...releases].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Creates a comment on a pull request with changeset details
 */
async function createPRComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  changesetContent: string,
  releases: {name: string; type: 'patch' | 'minor' | 'major'}[],
  changesetPath: string,
  isDryRun = false,
): Promise<void> {
  try {
    const dryRunPrefix = isDryRun ? '**[DRY RUN]** ' : ''
    const title = `${dryRunPrefix}Changeset Summary`
    const changesetInfo = isDryRun
      ? `This is a preview of the changeset that would be created.`
      : `A changeset has been created at \`.changeset/${changesetPath}\`.`

    // Format releases in a readable format
    const formattedReleases = releases
      .map(release => `- **${release.name}**: ${release.type}`)
      .join('\n')

    const comment = [
      `## ${title}`,
      '',
      changesetInfo,
      '',
      '### Summary',
      '```',
      changesetContent,
      '```',
      '',
      '### Releases',
      formattedReleases,
      '',
    ].join('\n')

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: comment,
    })

    core.info(`Created PR comment with changeset details on PR #${prNumber}`)
  } catch (error) {
    core.warning(
      `Failed to create PR comment: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

async function writeRenovateChangeset(
  changeset: {releases: {name: string; type: string}[]; summary: string},
  workingDirectory: string,
): Promise<string> {
  const changesetDir = path.join(workingDirectory, '.changeset')

  // Get git short SHA for naming
  const {stdout: shortSha} = await getExecOutput('git', ['rev-parse', '--short', 'HEAD'])
  const changesetName = `renovate-${shortSha.trim()}.md`
  const changesetPath = path.join(changesetDir, changesetName)

  // Check if changeset already exists
  try {
    await fs.access(changesetPath)
    core.info(`Changeset already exists: ${changesetName}`)
    return 'existing'
  } catch {
    // File doesn't exist, proceed with creation
  }

  // Ensure .changeset directory exists
  try {
    await fs.mkdir(changesetDir, {recursive: true})
  } catch (error: any) {
    throw error
  }

  // Create changeset content
  const frontmatter = changeset.releases
    .map(release => `'${release.name}': ${release.type}`)
    .join('\n')

  const content = `---
${frontmatter}
---

${changeset.summary}
`

  // Write the changeset file
  await fs.writeFile(changesetPath, content, 'utf8')
  core.info(`Created changeset: ${changesetName}`)

  return changesetName
}

async function run(): Promise<void> {
  try {
    const token = core.getInput('token')
    const workingDirectory = core.getInput('working-directory')

    const octokit = new Octokit({auth: token})

    // Get repository and PR information from environment
    const repository = process.env.GITHUB_REPOSITORY
    const eventPath = process.env.GITHUB_EVENT_PATH

    if (!repository || !eventPath) {
      core.info('Missing repository or event information, skipping')
      return
    }

    let eventData: any
    try {
      eventData = JSON.parse(await fs.readFile(eventPath, 'utf8'))
    } catch {
      core.warning('Unable to parse event data, continuing without some validations')
      eventData = {}
    }

    // Only process pull requests from Renovate
    if (!eventData.pull_request) {
      core.info('Not a pull request, skipping')
      return
    }

    const pr = eventData.pull_request
    const isRenovatePR = ['renovate[bot]', 'bfra-me[bot]'].includes(pr.user.login)

    if (!isRenovatePR) {
      core.info('Not a Renovate PR, skipping')
      return
    }

    const config = await getConfig()

    // Check branch name if required
    const branchName = pr.head?.ref
    if (!branchName) {
      core.info('Unable to determine branch name, skipping')
      return
    }

    if (
      !isValidBranch(
        branchName,
        config.branchPrefix || 'renovate/',
        config.skipBranchPrefixCheck || false,
      )
    ) {
      core.info(
        `Branch ${branchName} does not match expected prefix ${config.branchPrefix || 'renovate/'}, skipping`,
      )
      return
    }

    const [owner, repo] = repository.split('/')

    if (!owner || !repo) {
      core.setFailed('Could not determine repository owner or name.')
      return
    }

    // Get PR files
    const {data: files} = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pr.number,
    })

    const changedFiles = files.map(file => file.filename)
    core.info(`Changed files: ${changedFiles.join(', ')}`)
    core.info(`Using config: ${JSON.stringify(config, null, 2)}`)

    // Filter out excluded patterns
    const excludePatterns = config.excludePatterns || []
    const filteredFiles = excludePatterns
      ? changedFiles.filter(file => !matchesPatterns(file, excludePatterns))
      : changedFiles

    if (filteredFiles.length === 0) {
      core.info('No relevant files changed, skipping')
      return
    }

    const updateType = detectUpdateType(filteredFiles, config)
    if (!updateType) {
      core.info('No matching update type found, using default')
    }

    const settings = updateType ? config.updateTypes[updateType] : undefined
    const changesetType = settings?.changesetType || config.defaultChangesetType

    const {dependencies, version} = extractDependencyInfo(pr.title, pr.body || '')
    const changesetContent = generateChangesetContent(
      updateType || 'dependencies',
      dependencies,
      version,
      settings?.template,
      config.sort,
    )

    // Prepare releases for changeset
    let releases = [
      {
        name: repo,
        type: changesetType,
      },
    ]

    // Sort releases if requested
    if (config.sort) {
      releases = sortChangesetReleases(releases)
    }

    // Generate changeset
    let changesetPath: string

    if (config.dryRun) {
      // In dry-run mode, log what would be written but don't create any files
      core.info('DRY RUN MODE: Would have written changeset with the following content:')
      core.info(`Summary: ${changesetContent}`)
      core.info(`Releases: ${JSON.stringify(releases, null, 2)}`)

      // Use a placeholder path for dry run
      changesetPath = 'dry-run/changeset.md'
      core.info(
        `DRY RUN MODE: Would have created changeset at: ${workingDirectory}/.changeset/${changesetPath}`,
      )

      core.setOutput('changesets-created', '0') // No files actually created
      core.setOutput('changeset-files', JSON.stringify([]))

      // Create PR comment with changeset preview if enabled
      if (config.commentPR) {
        await createPRComment(
          octokit,
          owner,
          repo,
          pr.number,
          changesetContent,
          releases,
          changesetPath,
          true,
        )
      }
    } else {
      // Normal mode - actually write the changeset
      changesetPath = await writeRenovateChangeset(
        {
          releases,
          summary: changesetContent,
        },
        workingDirectory,
      )

      // Check if a changeset was actually created (not a duplicate)
      const changesetExists = changesetPath !== 'existing'

      if (changesetExists) {
        // Log message removed to avoid redundancy with writeRenovateChangeset
      } else {
        core.info(`Changeset already exists: ${changesetPath}`)
      }
      core.setOutput('changesets-created', changesetExists ? '1' : '0')
      core.setOutput(
        'changeset-files',
        JSON.stringify(changesetExists ? [`.changeset/${changesetPath}`] : []),
      )

      // Create PR comment with changeset details if enabled
      if (config.commentPR) {
        await createPRComment(
          octokit,
          owner,
          repo,
          pr.number,
          changesetContent,
          releases,
          changesetPath,
          false,
        )
      }
    }
  } catch (error) {
    core.setFailed(`Action failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

run()
