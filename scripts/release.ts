import {Buffer} from 'node:buffer'
import fs from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {exec, getExecOutput} from '@actions/exec'
import {read as readChangesetsConfig} from '@changesets/config'
import {shouldSkipPackage} from '@changesets/should-skip-package'
import {getPackages, type Package, type Tool} from '@manypkg/get-packages'
import {toString as mdastToString} from 'mdast-util-to-string'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import {unified} from 'unified'

const BumpLevels = {
  dep: 0,
  patch: 1,
  minor: 2,
  major: 3,
} as const

async function isPrivateRootPackage(pkg: Package, tool: Tool) {
  return (tool.type === 'root' || (await tool.isMonorepoRoot(pkg.dir))) && !!pkg.packageJson.private
}

async function getUntaggedPackages(packages: Package[], cwd: string, tool: Tool) {
  const packageWithTags = await Promise.all(
    packages.map(async pkg => {
      const isPrivateRoot = await isPrivateRootPackage(pkg, tool)
      const tagName = isPrivateRoot
        ? `v${pkg.packageJson.version}`
        : `${pkg.packageJson.name}@${pkg.packageJson.version}`
      const tagExists =
        (await getExecOutput('git', ['tag', '-l', tagName], {cwd})).stdout.trim() !== ''
      const remoteTagExists =
        (
          await getExecOutput('git', ['ls-remote', '--tags', 'origin', '-l', tagName], {cwd})
        ).stdout.trim() !== ''

      return {
        pkg,
        isMissingTag: !tagExists && !remoteTagExists,
        tagName,
        ...(isPrivateRoot ? {isPrivateRoot} : {}),
      }
    }),
  )
  return packageWithTags
    .filter(({isMissingTag}) => isMissingTag)
    .map(({pkg, tagName, isPrivateRoot}) => ({
      pkg,
      tagName,
      isPrivateRoot,
    }))
}

function isErrorWithCode(err: unknown, code: string) {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === code
}

function getChangelogEntry(changelog: string, version: string) {
  const ast = unified().use(remarkParse).parse(changelog)
  let highestLevel: number = BumpLevels.dep
  const nodes = ast.children
  let headingStartInfo:
    | {
        index: number
        depth: number
      }
    | undefined
  let endIndex: number | undefined

  for (const [i, node] of nodes.entries()) {
    if (node.type === 'heading') {
      const stringified = mdastToString(node)
      const match = stringified.toLowerCase().match(/(major|minor|patch)/)
      if (match !== null) {
        const level = BumpLevels[match[0] as 'major' | 'minor' | 'patch']
        highestLevel = Math.max(level, highestLevel)
      }
      if (headingStartInfo === undefined && stringified === version) {
        headingStartInfo = {
          index: i,
          depth: node.depth,
        }
        continue
      }
      if (
        endIndex === undefined &&
        headingStartInfo !== undefined &&
        headingStartInfo.depth === node.depth
      ) {
        endIndex = i
        break
      }
    }
  }
  if (headingStartInfo) {
    ast.children = ast.children.slice(headingStartInfo.index + 1, endIndex)
  }
  return {
    content: unified().use(remarkStringify).stringify(ast),
    highestLevel,
  }
}

async function main() {
  const cwd = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

  const config = await readChangesetsConfig(cwd)
  if (!config) {
    throw new Error('No changesets config found')
  }

  const allExistingTags = new Set(
    (await getExecOutput('git', ['tag'], {cwd})).stdout.trim().split('\n').filter(Boolean),
  )
  const {packages, tool} = await getPackages(cwd)
  const taggablePackages = packages.filter(
    pkg =>
      !shouldSkipPackage(pkg, {
        ignore: config.ignore,
        allowPrivatePackages: config.privatePackages && config.privatePackages.tag,
      }),
  )

  // Get the release SHA
  const releaseSha = Buffer.from(
    (await getExecOutput('git', ['rev-parse', 'HEAD'], {cwd})).stdout.trim(),
  )
  const releasedPackages: {pkg: Package; tagName: string}[] = []

  for (const {pkg, tagName, isPrivateRoot} of await getUntaggedPackages(
    taggablePackages,
    cwd,
    tool,
  )) {
    if (allExistingTags.has(tagName)) {
      console.log('Skipping tag (already exists):', tagName)
    } else {
      const exitCode = // Create a new tag
        await exec(
          'gh',
          [
            'api',
            `repos/{owner}/{repo}/git/refs`,
            '-f',
            `ref=refs/tags/${tagName}`,
            '-f',
            `sha=${releaseSha}`,
          ],
          {cwd},
        )
      if (exitCode !== 0) {
        throw new Error(`Failed to create tag ${tagName} with exit code ${exitCode}`)
      }

      console.log('New tag:', tagName)
      releasedPackages.push({pkg, tagName})

      // If a private root or monorepo root package, also create or update a floating major branch.
      if (isPrivateRoot) {
        // HACK: For monorepo root packages, output the tag name in `<packageName>@<packageVersion>` format to be picked up by the Changesets action.
        if (await tool.isMonorepoRoot(pkg.dir)) {
          console.log('New tag:', `${pkg.packageJson.name}@${pkg.packageJson.version}`)
        }

        const [majorVersion] = pkg.packageJson.version.split('.')
        const majorVersionRef = `refs/heads/v${majorVersion}`

        // Push to a floating major branch, e.g., version 2.1.3 is pushed to `refs/heads/v2`
        const {exitCode: branchExitCode} = await getExecOutput(
          'gh',
          ['api', `repos/{owner}/{repo}/git/${majorVersionRef}`],
          {
            cwd,
            ignoreReturnCode: true,
          },
        )
        if (branchExitCode === 0) {
          // Update existing branch
          await exec(
            'gh',
            [
              'api',
              `repos/{owner}/{repo}/git/${majorVersionRef}`,
              '-XPATCH',
              '-f',
              `sha=${releaseSha}`,
              '-F',
              'force=true',
            ],
            {cwd},
          )
        } else {
          // Create a new floating major branch
          await exec(
            'gh',
            [
              'api',
              `repos/{owner}/{repo}/git/refs`,
              '-f',
              `ref=${majorVersionRef}`,
              '-f',
              `sha=${releaseSha}`,
            ],
            {cwd},
          )
        }

        console.log(`Created tag ${tagName} and updated branch ${majorVersionRef}`)
      }
    }
  }

  for (const {pkg, tagName} of releasedPackages) {
    const changelogPath = path.join(pkg.dir, 'CHANGELOG.md')
    let changelog
    try {
      changelog = await fs.readFile(changelogPath, 'utf8')
    } catch (error) {
      if (isErrorWithCode(error, 'ENOENT')) {
        // if we can't find a changelog, the user has probably disabled changelogs
        return
      }
      throw error
    }
    const changelogEntry = getChangelogEntry(changelog, pkg.packageJson.version)
    if (changelogEntry.content.trim() === '') {
      console.log(`No changelog entry found for ${tagName} in ${changelogPath}, skipping release.`)
      continue
    }

    // Write the changelog entry to a temporary file for the `gh release` command
    const notesPath = path.join(await fs.mkdtemp(path.join(tmpdir(), 'release-')), 'notes.md')
    await fs.writeFile(notesPath, changelogEntry.content)

    const isPrerelease = pkg.packageJson.version.includes('-')
    await exec(
      'gh',
      [
        'release',
        'create',
        tagName,
        '--fail-on-no-commits',
        '--verify-tag',
        '--target',
        `${releaseSha}`,
        '--title',
        tagName,
        '--notes-file',
        notesPath,
        ...(isPrerelease ? ['--prerelease'] : []),
      ].filter(Boolean),
      {cwd},
    )
    console.log(`Created release for ${tagName} targetting ${releaseSha}`)

    await fs.unlink(notesPath)
  }
}

main()
