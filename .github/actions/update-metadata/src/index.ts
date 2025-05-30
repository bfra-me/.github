import {promises as fs} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import * as core from '@actions/core'
import {Octokit} from '@octokit/rest'
import {dump} from 'js-yaml'

interface MetadataConfig {
  repositories: {
    'with-renovate': string[]
  }
}

async function generateMetadata(token: string): Promise<void> {
  const octokit = new Octokit({auth: token})
  const orgName = process.env.GITHUB_REPOSITORY?.split('/')[0] || 'bfra-me'

  const repos = await octokit.paginate(octokit.repos.listForOrg, {
    org: orgName,
    per_page: 100,
  })

  const metadata: MetadataConfig = {
    repositories: {
      'with-renovate': [],
    },
  }

  for (const repo of repos) {
    try {
      await octokit.repos.getContent({
        owner: orgName,
        repo: repo.name,
        path: '.github/workflows/renovate.yaml',
      })
      metadata.repositories['with-renovate'].push(repo.name)
    } catch {
      continue
    }
  }

  const metadataDir = path.join(process.cwd(), 'metadata')
  await fs.mkdir(metadataDir, {recursive: true})

  const yamlContent = dump(metadata)
  await fs.writeFile(path.join(metadataDir, 'renovate.yaml'), yamlContent)
}

async function run() {
  try {
    const token = core.getInput('token', {required: true})
    await generateMetadata(token)
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}

run()
