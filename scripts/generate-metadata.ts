import {writeFile} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {Octokit} from '@octokit/rest'
import {dump} from 'js-yaml'

interface MetadataConfig {
  repositories: {
    with_renovate: string[]
  }
}

async function generateMetadata() {
  // Initialize Octokit with the GH_TOKEN
  const octokit = new Octokit({
    auth: process.env.GH_TOKEN,
  })

  // Get organization name from environment or config
  const orgName = process.env.GITHUB_REPOSITORY?.split('/')[0] || '@bfra-me'

  try {
    const repos = await octokit.paginate(octokit.repos.listForOrg, {
      org: orgName,
      per_page: 100,
    })

    const metadata: MetadataConfig = {
      repositories: {
        with_renovate: [],
      },
    }

    // Check each repository for renovate.yaml
    for (const repo of repos) {
      try {
        await octokit.repos.getContent({
          owner: orgName,
          repo: repo.name,
          path: '.github/workflows/renovate.yaml',
        })

        // If we get here, the file exists
        metadata.repositories.with_renovate.push(repo.name)
      } catch {
        // File doesn't exist, skip
        continue
      }
    }

    // Write metadata to YAML file
    const yamlContent = dump(metadata)
    await writeFile(path.join(process.cwd(), 'metadata', 'renovate.yaml'), yamlContent)

    console.log('Successfully generated renovate metadata')
  } catch (error) {
    console.error('Error generating metadata:', error)
    process.exit(1)
  }
}

// Run the script
generateMetadata()
