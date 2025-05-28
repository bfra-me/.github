import {type Buffer} from 'node:buffer'
import {promises as fs} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as github from '@actions/github'
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
    // const nodeVersion = core.getInput('node-version') // unused
    const autofix = core.getInput('autofix') === 'true'
    const prBranch = core.getInput('pr-branch')
    const commitMessage = core.getInput('commit-message')
    const prTitle = core.getInput('pr-title')
    const prBody = core.getInput('pr-body')
    const skipChangeset = core.getInput('skip-changeset') === 'true'

    await exec.exec('node', ['-v'])
    await exec.exec('pnpm', ['install'])

    await generateMetadata(token)

    let unstaged = ''
    await exec.exec('git', ['status', '--porcelain'], {
      listeners: {
        stdout: (data: Buffer) => {
          unstaged += data.toString()
        },
      },
    })
    core.setOutput('unstaged-changes', unstaged.trim())

    if (autofix) await exec.exec('pnpm', ['fix'])

    if (unstaged.trim() && !skipChangeset) {
      const changeset = `---\n'@bfra.me/.github': patch\n---\nUpdate repository metadata files based on the latest organization scan.\n`
      const filename = `.changeset/update-metadata-${Date.now()}.md`
      await fs.mkdir('.changeset', {recursive: true})
      await fs.writeFile(filename, changeset)
      await exec.exec('git', ['add', filename])
    }

    if (unstaged.trim()) {
      await exec.exec('git', ['checkout', '-B', prBranch])
      await exec.exec('git', ['add', '.'])
      await exec.exec('git', ['commit', '-m', commitMessage])
      await exec.exec('git', ['push', '--force', 'origin', prBranch])
      const octokit = github.getOctokit(token)
      const {data: pr} = await octokit.rest.pulls.create({
        ...github.context.repo,
        title: prTitle,
        head: prBranch,
        base: 'main',
        body: prBody,
      })
      core.setOutput('pr-url', pr.html_url)
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}

export {run}
