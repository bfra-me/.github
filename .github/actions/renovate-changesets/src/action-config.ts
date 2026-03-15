import {promises as fs} from 'node:fs'
import process from 'node:process'
import * as core from '@actions/core'
import {load} from 'js-yaml'

export interface Config {
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
  updatePRDescription?: boolean
}

export const DEFAULT_CONFIG: Config = {
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
    pip: {
      changesetType: 'patch',
      filePatterns: [
        '**/requirements.txt',
        '**/requirements*.txt',
        '**/pyproject.toml',
        '**/setup.py',
        '**/setup.cfg',
      ],
    },
    pipenv: {
      changesetType: 'patch',
      filePatterns: ['**/Pipfile', '**/Pipfile.lock'],
    },
    poetry: {
      changesetType: 'patch',
      filePatterns: ['**/pyproject.toml', '**/poetry.lock'],
    },
    setuptools: {
      changesetType: 'patch',
      filePatterns: ['**/setup.py', '**/setup.cfg', '**/pyproject.toml'],
    },
    'pip-compile': {
      changesetType: 'patch',
      filePatterns: ['**/requirements*.txt', '**/requirements*.in'],
    },
    pip_setup: {
      changesetType: 'patch',
      filePatterns: ['**/setup.py', '**/requirements.txt'],
    },
    gradle: {
      changesetType: 'patch',
      filePatterns: [
        '**/build.gradle',
        '**/build.gradle.kts',
        '**/gradle.properties',
        '**/gradle/wrapper/gradle-wrapper.properties',
        '**/settings.gradle',
        '**/settings.gradle.kts',
      ],
    },
    maven: {
      changesetType: 'patch',
      filePatterns: ['**/pom.xml', '**/maven-wrapper.properties'],
    },
    'gradle-wrapper': {
      changesetType: 'patch',
      filePatterns: ['**/gradle/wrapper/gradle-wrapper.properties'],
    },
    sbt: {
      changesetType: 'patch',
      filePatterns: ['**/build.sbt', '**/project/build.properties', '**/project/plugins.sbt'],
    },
    gomod: {
      changesetType: 'patch',
      filePatterns: ['**/go.mod', '**/go.sum'],
    },
    go: {
      changesetType: 'patch',
      filePatterns: ['**/go.mod', '**/go.sum'],
    },
    golang: {
      changesetType: 'patch',
      filePatterns: ['**/go.mod', '**/go.sum'],
    },
  },
  defaultChangesetType: 'patch',
}

export async function getConfig(): Promise<Config> {
  const configFile = core.getInput('config-file')
  const configInline = core.getInput('config')

  const branchPrefix = core.getInput('branch-prefix') || process.env.BRANCH_PREFIX || 'renovate/'
  const skipBranchPrefixCheck =
    core.getBooleanInput('skip-branch-prefix-check') || process.env.SKIP_BRANCH_CHECK === 'TRUE'
  const sort = core.getBooleanInput('sort') || process.env.SORT_CHANGESETS === 'TRUE'
  const commentPR = core.getBooleanInput('comment-pr')
  const updatePRDescription = core.getBooleanInput('update-pr-description')
  const defaultChangesetType = (core.getInput('default-changeset-type') || 'patch') as
    | 'patch'
    | 'minor'
    | 'major'

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
    updatePRDescription,
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
