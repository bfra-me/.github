import {promises as fs} from 'node:fs'
import process from 'node:process'
import * as core from '@actions/core'
import writeChangeset from '@changesets/write'
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

  let config = DEFAULT_CONFIG

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
): string {
  if (template) {
    return template
      .replaceAll('{updateType}', updateType)
      .replaceAll('{dependencies}', dependencies.join(', '))
      .replaceAll('{version}', version || 'latest')
  }

  const depList =
    dependencies.length > 1
      ? `${dependencies.slice(0, -1).join(', ')} and ${dependencies.at(-1)}`
      : dependencies[0] || 'dependencies'

  const versionText = version ? ` to ${version}` : ''

  return `Update ${updateType} ${depList}${versionText}`
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

    const eventData = JSON.parse(await fs.readFile(eventPath, 'utf8'))

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
    const config = await getConfig()

    // Filter out excluded patterns
    const filteredFiles = config.excludePatterns
      ? changedFiles.filter(file => !matchesPatterns(file, config.excludePatterns!))
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
    )

    // Generate changeset
    const changesetPath = await writeChangeset(
      {
        releases: [
          {
            name: repo,
            type: changesetType,
          },
        ],
        summary: changesetContent,
      },
      workingDirectory,
    )

    core.info(`Created changeset: ${changesetPath}`)
    core.setOutput('changesets-created', '1')
    core.setOutput('changeset-files', JSON.stringify([changesetPath]))
  } catch (error) {
    core.setFailed(`Action failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

run()
