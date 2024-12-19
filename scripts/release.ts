import {Buffer} from 'node:buffer'
import {dirname, join} from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'
import {exec, getExecOutput} from '@actions/exec'
import {version} from '../package.json'

const tag = `v${version}`
const [major] = version.split('.')

process.chdir(join(dirname(fileURLToPath(import.meta.url)), '..'))

async function main() {
  const {exitCode, stderr} = await getExecOutput(
    'git',
    ['ls-remote', '--exit-code', 'origin', '--tags', `refs/tags/${tag}`],
    {ignoreReturnCode: true},
  )
  if (exitCode === 0) {
    console.log(`Tag ${tag} already exists`)
    return
  }
  if (exitCode !== 2) {
    throw new Error(`git ls-remote exited with ${exitCode}:\n${stderr}`)
  }

  // https://github.com/changesets/changesets/blob/main/docs/command-line-options.md#tag
  await exec('changeset', ['tag'])

  // Get the release SHA
  const {stdout} = await getExecOutput('git', ['rev-parse', 'HEAD'])
  const sha = Buffer.from(stdout.trim())
  const ref = `refs/heads/v${major}`

  // Push to a floating major branch, e.g., version 2.1.3 is pushed to `refs/heads/v2`
  const {exitCode: branchExitCode} = await getExecOutput(
    'gh',
    ['api', `repos/${process.env.GH_REPO}/git/${ref}`],
    {
      ignoreReturnCode: true,
    },
  )
  if (branchExitCode === 0) {
    // Update existing branch
    await exec('gh', [
      'api',
      `repos/${process.env.GH_REPO}/git/${ref}`,
      '-XPATCH',
      '-f',
      `sha=${sha}`,
      '-F',
      'force=true',
    ])
  } else {
    // Create a new floating major branch
    await exec('gh', [
      'api',
      `repos/${process.env.GH_REPO}/git/refs`,
      '-f',
      `ref=${ref}`,
      '-f',
      `sha=${sha}`,
    ])
  }
}

await main()
