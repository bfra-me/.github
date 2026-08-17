import type {WorkspacePackage} from '../../src/multi-package/types.js'
import {promises as fs} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {
  analyzePackageJson,
  discoverOtherWorkspaceTypes,
  discoverWorkspaceChildren,
  discoverWorkspacePackages,
  expandWorkspacePattern,
} from '../../src/multi-package/workspace-discovery.js'

const roots: string[] = []

describe('workspace discovery contracts', () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => fs.rm(root, {recursive: true, force: true})))
  })

  it('expands arbitrary workspace globs to package directories', async () => {
    const root = await createWorkspace({
      'libs/a/package.json': packageJson('@scope/a'),
      'packages/nested/package.json': packageJson('@scope/nested'),
      'packages/nested/plugins/package.json': packageJson('@scope/plugins'),
      'packages/nested/plugins/one/package.json': packageJson('@scope/one'),
      'packages/nested/plugin/package.json': packageJson('@scope/plugin'),
      'packages/nested/other/package.json': packageJson('@scope/other'),
      'packages/nested/node_modules/hidden/package.json': packageJson('@scope/hidden'),
    })

    await expect(expandWorkspacePattern('libs/*', root)).resolves.toEqual(['libs/a'])
    await expect(expandWorkspacePattern('packages/**', root)).resolves.toEqual([
      'packages/nested',
      'packages/nested/other',
      'packages/nested/plugin',
      'packages/nested/plugins',
      'packages/nested/plugins/one',
    ])
    await expect(expandWorkspacePattern('packages/*/plugins', root)).resolves.toEqual([
      'packages/nested/plugins',
    ])
    await expect(expandWorkspacePattern('libs/a', root)).resolves.toEqual(['libs/a'])
  })

  it('supports nested workspace globs and filters node_modules packages', async () => {
    const root = await createWorkspace({
      'packages/a/plugins/one/package.json': packageJson('@scope/one'),
      'packages/a/node_modules/hidden/package.json': packageJson('@scope/hidden'),
    })

    await expect(expandWorkspacePattern('packages/*/plugins/*', root)).resolves.toEqual([
      'packages/a/plugins/one',
    ])
    await expect(discoverWorkspaceChildren(['packages/**'], config(root))).resolves.toEqual([
      expect.objectContaining({name: '@scope/one'}),
    ])
  })

  it('normalizes Yarn object-form workspaces and detects object-form roots', async () => {
    const root = await createWorkspace({
      'package.json': JSON.stringify({
        name: 'root',
        version: '1.0.0',
        workspaces: {packages: ['packages/*']},
      }),
      'packages/app/package.json': packageJson('@scope/app'),
    })

    const analyzed = await analyzePackageJson(path.join(root, 'package.json'), root, true)
    expect(analyzed?.workspaces).toEqual(['packages/*'])
    await expect(discoverWorkspacePackages(config(root))).resolves.toEqual([
      expect.objectContaining({name: 'root'}),
      expect.objectContaining({name: '@scope/app'}),
    ])
  })

  it('subtracts negated workspace patterns', async () => {
    const root = await createWorkspace({
      'packages/public/package.json': packageJson('@scope/public'),
      'packages/internal-secret/package.json': packageJson('@scope/secret'),
    })

    await expect(
      discoverWorkspaceChildren(['packages/*', '!packages/internal-*'], config(root)),
    ).resolves.toEqual([expect.objectContaining({name: '@scope/public'})])
  })

  it('deduplicates packages and warns when truncating', async () => {
    const files: Record<string, string> = {
      'package.json': JSON.stringify({
        name: 'root',
        version: '1.0.0',
        workspaces: ['packages/pkg-1', 'packages/pkg-0'],
      }),
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
    }
    for (let index = 0; index < 3; index += 1) {
      files[`packages/pkg-${index}/package.json`] = packageJson(`@scope/pkg-${index}`)
    }
    const root = await createWorkspace(files)
    const {warning} = await import('@actions/core')

    const result = await discoverWorkspacePackages({...config(root), maxPackagesToAnalyze: 3})
    expect(new Set(result.map(pkg => pkg.packageJsonPath)).size).toBe(result.length)
    expect(result).toHaveLength(3)
    expect(result.map(pkg => pkg.name)).toEqual(['root', '@scope/pkg-1', '@scope/pkg-0'])
    expect(result[1]?.packageJsonPath).toBe(path.join(root, 'packages/pkg-1/package.json'))
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('4 workspace packages'))
  })

  it('normalizes Lerna object-form packages', async () => {
    const root = await createWorkspace({
      'lerna.json': JSON.stringify({packages: {packages: ['libs/*']}}),
      'libs/tool/package.json': packageJson('@scope/tool'),
    })
    const packages: WorkspacePackage[] = []

    await discoverOtherWorkspaceTypes(packages, config(root))

    expect(packages).toEqual([expect.objectContaining({name: '@scope/tool'})])
  })
})

function config(workspaceRoot: string) {
  return {
    workspaceRoot,
    detectWorkspaces: true,
    analyzeInternalDependencies: true,
    enforceVersionConsistency: true,
    maxPackagesToAnalyze: 50,
    versionConsistencyPatterns: [],
    internalPackagePatterns: [],
  }
}

function packageJson(name: string): string {
  return JSON.stringify({name, version: '1.0.0'})
}

async function createWorkspace(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-discovery-contract-'))
  roots.push(root)
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath)
    await fs.mkdir(path.dirname(filePath), {recursive: true})
    await fs.writeFile(filePath, content)
  }
  return root
}
