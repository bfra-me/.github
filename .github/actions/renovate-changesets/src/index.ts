import {promises as fs} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import * as core from '@actions/core'
import {getExecOutput} from '@actions/exec'
import {Octokit} from '@octokit/rest'
import {load} from 'js-yaml'
import {minimatch} from 'minimatch'

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
  const commentPR = core.getBooleanInput('comment-pr')
  const defaultChangesetType = (core.getInput('default-changeset-type') || 'patch') as
    | 'patch'
    | 'minor'
    | 'major'

  // Validate changeset type
  if (!['patch', 'minor', 'major'].includes(defaultChangesetType)) {
    throw new Error(
      `Invalid default-changeset-type: ${defaultChangesetType}. Must be one of: patch, minor, major`,
    )
  }

  const excludePatternsInput = core.getInput('exclude-patterns')
  const excludePatterns = excludePatternsInput
    ? excludePatternsInput.split(',').map(p => p.trim())
    : undefined

  let config = {
    ...DEFAULT_CONFIG,
    branchPrefix,
    skipBranchPrefixCheck,
    sort,
    commentPR,
    defaultChangesetType,
    excludePatterns,
  }

  if (configFile) {
    try {
      const fileContent = await fs.readFile(configFile, 'utf8')
      const fileConfig = load(fileContent) as Partial<Config>
      if (fileConfig && typeof fileConfig === 'object') {
        config = {...config, ...fileConfig}
        core.info(`Loaded configuration from file: ${configFile}`)
      } else {
        core.warning(`Invalid configuration format in file: ${configFile}`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      core.warning(`Failed to read config file ${configFile}: ${errorMessage}`)
    }
  } else if (configInline) {
    try {
      const inlineConfig = load(configInline) as Partial<Config>
      if (inlineConfig && typeof inlineConfig === 'object') {
        config = {...config, ...inlineConfig}
        core.info('Loaded inline configuration')
      } else {
        core.warning('Invalid inline configuration format')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      core.warning(`Failed to parse inline config: ${errorMessage}`)
    }
  }

  return config
}

function matchesPatterns(filePath: string, patterns: string[]): boolean {
  return patterns.some(pattern => minimatch(filePath, pattern, {dot: true}))
}

function isValidBranch(
  branchName: string,
  branchPrefix: string,
  skipBranchPrefixCheck: boolean,
): boolean {
  if (skipBranchPrefixCheck) {
    return true
  }
  return branchName.startsWith(branchPrefix)
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
): Promise<void> {
  try {
    const title = `Changeset Summary`
    const changesetInfo = `A changeset has been created at \`.changeset/${changesetPath}\`.`

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

  try {
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
    await fs.mkdir(changesetDir, {recursive: true})

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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    core.error(`Failed to create changeset: ${errorMessage}`)
    throw new Error(`Failed to create changeset: ${errorMessage}`)
  }
}

async function run(): Promise<void> {
  try {
    // Get repository and PR information from environment first (like original behavior)
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

    // Now validate inputs that we actually need for GitHub API and file operations
    const token = core.getInput('token')
    const workingDirectory = core.getInput('working-directory')

    if (!token) {
      throw new Error('GitHub token is required')
    }

    if (!workingDirectory) {
      throw new Error('Working directory is required')
    }

    // Validate working directory exists
    try {
      await fs.access(workingDirectory)
    } catch {
      throw new Error(`Working directory does not exist: ${workingDirectory}`)
    }

    const octokit = new Octokit({auth: token})

    // Get PR files
    const {data: files} = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pr.number,
    })

    const changedFiles = files.map(file => file.filename)
    core.info(`Changed files: ${changedFiles.join(', ')}`)
    core.info(`Using config: ${JSON.stringify(config, null, 2)}`)

    if (changedFiles.some(file => file.startsWith('.changeset/'))) {
      core.info('Changeset files already exist, skipping changeset creation')
      core.setOutput('changesets-created', '0')
      core.setOutput('changeset-files', JSON.stringify([]))
      return
    }

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
    const changesetPath = await writeRenovateChangeset(
      {
        releases,
        summary: changesetContent,
      },
      workingDirectory,
    )

    // Check if a changeset was actually created (not a duplicate)
    const changesetExists = changesetPath !== 'existing'

    if (!changesetExists) {
      core.info(`Changeset already exists: ${changesetPath}`)
    }

    // Set outputs
    core.setOutput('changesets-created', changesetExists ? '1' : '0')
    core.setOutput(
      'changeset-files',
      JSON.stringify(changesetExists ? [`.changeset/${changesetPath}`] : []),
    )
    core.setOutput('update-type', updateType || 'dependencies')
    core.setOutput('dependencies', JSON.stringify(dependencies))
    core.setOutput('changeset-summary', changesetContent)

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
      )
    }
  } catch (error) {
    // Enhanced error handling with detailed error information
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined

    core.error(`Action failed: ${errorMessage}`)
    if (errorStack) {
      core.debug(`Error stack: ${errorStack}`)
    }

    // Set error outputs for debugging
    core.setOutput('changesets-created', '0')
    core.setOutput('changeset-files', JSON.stringify([]))
    core.setOutput('update-type', '')
    core.setOutput('dependencies', JSON.stringify([]))
    core.setOutput('changeset-summary', '')

    core.setFailed(`Action failed: ${errorMessage}`)
  }
}

run()
