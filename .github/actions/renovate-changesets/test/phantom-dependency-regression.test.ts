import type {Octokit} from '@octokit/rest'
import {describe, expect, it} from 'vitest'

import {
  extractDependenciesFromPR,
  extractStructuredBodySections,
} from '../src/parser/renovate-dependency-extractor.js'
import {extractPRContext} from '../src/renovate-parser.js'
import {createMockCommit, createMockPRFile, mockedOctokit} from './setup.js'

const octokit = mockedOctokit as unknown as Octokit
const checkoutPatch =
  '@@ -1 +1 @@\n- uses: actions/checkout@v4.2.1\n+ uses: actions/checkout@v4.2.2'
const multiDepPatch =
  '@@ -1,2 +1,2 @@\n- uses: actions/checkout@v4.2.1\n- uses: github/codeql-action@v4.32.0\n+ uses: actions/checkout@v4.2.2\n+ uses: github/codeql-action@v4.33.0'
const caseInsensitivePatch =
  '@@ -1 +1 @@\n- uses: github/codeql-action@v4.32.0\n+ uses: github/codeql-action@v4.33.0'

const pr1770Body = `This PR contains the following updates:

| Package | Type | Update | Change |
|---|---|---|---|
| [bfra-me/renovate-action](https://github.com/bfra-me/renovate-action) | action | major | \`8.87.9\` → \`9.0.0\` |

---

### Release Notes
<details>
<summary>bfra-me/renovate-action</summary>

##### Miscellaneous Chores
- **deps:** update github/codeql-action action to v4.33.0
</details>`
const releaseNotesOnlyBody = [
  '---',
  '',
  '### Release Notes',
  '<details>',
  '- update github/codeql-action action to v4.33.0',
  '</details>',
].join('\n')
const topLevelDependencyList = [
  '- update dependency actions/checkout to v4.2.2',
  '- update github/codeql-action action to v4.33.0',
].join('\n')

async function extractContext(options: {
  title: string
  body: string
  commits?: {commit: {message: string}}[]
  patch?: string
}): Promise<Awaited<ReturnType<typeof extractPRContext>>> {
  mockedOctokit.rest.pulls.listFiles.mockResolvedValue({
    data: [createMockPRFile({filename: '.github/workflows/main.yaml', patch: options.patch})],
  })
  mockedOctokit.rest.pulls.listCommits.mockResolvedValue({
    data: options.commits ?? [createMockCommit({commit: {message: options.title}})],
  })

  return extractPRContext(octokit, 'test-owner', 'test-repo', 1770, {
    title: options.title,
    body: options.body,
    user: {login: 'renovate[bot]'},
    head: {ref: 'renovate/test-branch'},
  })
}

describe('extractStructuredBodySections', () => {
  it('should keep update table from Renovate PR body', () => {
    const cleanedBody = extractStructuredBodySections(pr1770Body)
    expect(cleanedBody).toContain('bfra-me/renovate-action')
    expect(cleanedBody).toContain('8.87.9')
  })

  it('should strip content inside <details> blocks', () => {
    const body = [
      '- update dependency actions/checkout to v4.2.2',
      '<details>',
      '- update github/codeql-action action to v4.33.0',
      '</details>',
    ].join('\n')
    expect(extractStructuredBodySections(body)).toBe(
      '- update dependency actions/checkout to v4.2.2',
    )
  })

  it('should strip content after ### Release Notes', () => {
    expect(extractStructuredBodySections(pr1770Body)).not.toContain('github/codeql-action')
  })

  it('should strip content after ### Configuration', () => {
    const body = [
      '- update dependency actions/checkout to v4.2.2',
      '',
      '---',
      '',
      '### Configuration',
      '- update github/codeql-action action to v4.33.0',
    ].join('\n')
    expect(extractStructuredBodySections(body)).toBe(
      '- update dependency actions/checkout to v4.2.2',
    )
  })

  it('should handle empty body', () => {
    expect(extractStructuredBodySections('')).toBe('')
  })

  it('should return full body when no Renovate markers present', () => {
    const body = [
      '- update dependency actions/checkout to v4.2.2',
      '- bump lodash from 4.17.20 to 4.17.21',
    ].join('\n')
    expect(extractStructuredBodySections(body)).toBe(body)
  })
})

describe('extractDependenciesFromPR body scoping', () => {
  it('should NOT extract dependencies from release notes in PR body', () => {
    const deps = extractDependenciesFromPR(
      'chore(deps): update bfra-me/renovate-action to v9',
      pr1770Body,
      '',
      'github-actions',
    )
    const names = deps.map(dep => dep.name)
    expect(names).toContain('bfra-me/renovate-action')
    expect(names).not.toContain('github/codeql-action')
  })

  it('should still extract from title even when body has release notes', () => {
    const deps = extractDependenciesFromPR(
      'chore(deps): update actions/checkout action to v4',
      releaseNotesOnlyBody,
      '',
      'github-actions',
    )
    expect(deps.map(dep => dep.name)).toContain('actions/checkout')
  })

  it('should still extract from commit messages', () => {
    const deps = extractDependenciesFromPR(
      '',
      releaseNotesOnlyBody,
      'chore(deps): update pnpm/action-setup action to v4.4.0',
      'github-actions',
    )
    expect(deps.map(dep => dep.name)).toContain('pnpm/action-setup')
    expect(deps.map(dep => dep.name)).not.toContain('github/codeql-action')
  })
})

describe('phantom dependency filtering', () => {
  it('should keep deps that appear in PR title and deduplicate merged matches', async () => {
    const context = await extractContext({
      title: 'chore(deps): update bfra-me/renovate-action to v9',
      body: pr1770Body,
      patch: '@@ -1 +1 @@\n-old\n+new',
    })
    expect(context.dependencies.map(dep => dep.name)).toEqual(['bfra-me/renovate-action'])
  })

  it('should keep deps that appear in file patches', async () => {
    const context = await extractContext({
      title: 'chore(deps): update dependencies',
      body: topLevelDependencyList,
      patch: checkoutPatch,
    })
    expect(context.dependencies.map(dep => dep.name)).toEqual(['actions/checkout'])
  })

  it('should be case-insensitive', async () => {
    const context = await extractContext({
      title: 'chore(deps): update dependencies',
      body: '- update GitHub/CodeQL-Action action to v4.33.0',
      patch: caseInsensitivePatch,
    })
    expect(context.dependencies.map(dep => dep.name)).toEqual(['GitHub/CodeQL-Action'])
  })

  it('should keep all deps when patches are empty (fail-open)', async () => {
    const context = await extractContext({
      title: 'chore(deps): update dependencies',
      body: topLevelDependencyList,
      patch: undefined,
    })
    expect(context.dependencies.map(dep => dep.name)).toEqual([
      'actions/checkout',
      'github/codeql-action',
    ])
  })
})

describe('isGroupedUpdate after phantom filtering', () => {
  it('should be false when only one real dep remains after filtering phantoms', async () => {
    const context = await extractContext({
      title: 'chore(deps): update dependencies',
      body: topLevelDependencyList,
      patch: checkoutPatch,
    })
    expect(context.isGroupedUpdate).toBe(false)
  })

  it('should be true when title contains "group"', async () => {
    const context = await extractContext({
      title: 'chore(deps): update dependency group',
      body: topLevelDependencyList,
      patch: checkoutPatch,
    })
    expect(context.isGroupedUpdate).toBe(true)
  })

  it('should be true when multiple real deps exist', async () => {
    const context = await extractContext({
      title: 'chore(deps): update dependencies',
      body: topLevelDependencyList,
      patch: multiDepPatch,
    })
    expect(context.dependencies.map(dep => dep.name)).toEqual([
      'actions/checkout',
      'github/codeql-action',
    ])
    expect(context.isGroupedUpdate).toBe(true)
  })
})

describe('manager preservation through deduplication', () => {
  it('should default to provided manager when name inference fails', () => {
    const titleDeps = extractDependenciesFromPR(
      'chore(deps): update dependency react to v19',
      '',
      '',
      'unknown',
    )
    expect(titleDeps.length).toBeGreaterThan(0)
    expect(titleDeps[0]?.manager).toBe('unknown')
  })

  it('should use provided manager when explicitly set', () => {
    const deps = extractDependenciesFromPR(
      'chore(deps): update dependency react to v19',
      '',
      '',
      'npm',
    )
    expect(deps.length).toBeGreaterThan(0)
    expect(deps[0]?.manager).toBe('npm')
  })

  it('should upgrade unknown manager from commit-derived deps', async () => {
    mockedOctokit.rest.pulls.get.mockResolvedValue({
      data: {base: {sha: 'base'}, head: {sha: 'head'}},
    } as any)
    mockedOctokit.rest.repos.getContent.mockRejectedValue(new Error('not found'))
    mockedOctokit.rest.pulls.listFiles.mockResolvedValue({
      data: [
        createMockPRFile({
          filename: 'package.json',
          patch: '@@ -1 +1 @@\n-"react": "^18.0.0"\n+"react": "^19.0.0"',
        }),
      ],
    } as any)
    mockedOctokit.rest.pulls.listCommits.mockResolvedValue({
      data: [createMockCommit({commit: {message: 'chore(npm): update dependency react to v19'}})],
    } as any)

    const context = await extractPRContext(octokit, 'test-owner', 'test-repo', 1, {
      title: 'chore(deps): update dependency react to v19',
      user: {login: 'renovate[bot]'},
      head: {ref: 'renovate/react-19.x'},
    })

    const reactDep = context.dependencies.find(d => d.name === 'react')
    expect(reactDep).toBeDefined()
    expect(reactDep?.manager).not.toBe('unknown')
  })
})

describe('phantom filter with partial patch availability', () => {
  it('should fail open when any file lacks a patch field', async () => {
    mockedOctokit.rest.pulls.get.mockResolvedValue({
      data: {base: {sha: 'base'}, head: {sha: 'head'}},
    } as any)
    mockedOctokit.rest.repos.getContent.mockRejectedValue(new Error('not found'))
    mockedOctokit.rest.pulls.listFiles.mockResolvedValue({
      data: [
        createMockPRFile({filename: 'package.json', patch: undefined}),
        createMockPRFile({
          filename: 'pnpm-lock.yaml',
          patch: '@@ -1 +1 @@\n+some-unrelated-content',
        }),
      ],
    } as any)
    mockedOctokit.rest.pulls.listCommits.mockResolvedValue({
      data: [createMockCommit({commit: {message: 'chore(npm): update dependency react to v19'}})],
    } as any)

    const context = await extractPRContext(octokit, 'test-owner', 'test-repo', 1, {
      title: 'chore(deps): update dependency react to v19',
      body: 'Updates react from 18 to 19',
      user: {login: 'renovate[bot]'},
      head: {ref: 'renovate/react-19.x'},
    })

    expect(context.dependencies.length).toBeGreaterThan(0)
    expect(context.dependencies.some(d => d.name === 'react')).toBe(true)
  })

  it('should fail open when a file has an empty patch string', async () => {
    mockedOctokit.rest.pulls.get.mockResolvedValue({
      data: {base: {sha: 'base'}, head: {sha: 'head'}},
    } as any)
    mockedOctokit.rest.repos.getContent.mockRejectedValue(new Error('not found'))
    mockedOctokit.rest.pulls.listFiles.mockResolvedValue({
      data: [
        createMockPRFile({filename: 'package.json', patch: ''}),
        createMockPRFile({filename: 'other.yaml', patch: '@@ -1 +1 @@\n+unrelated'}),
      ],
    } as any)
    mockedOctokit.rest.pulls.listCommits.mockResolvedValue({
      data: [createMockCommit({commit: {message: 'chore(npm): update dependency react to v19'}})],
    } as any)

    const context = await extractPRContext(octokit, 'test-owner', 'test-repo', 1, {
      title: 'chore(deps): update dependency react to v19',
      user: {login: 'renovate[bot]'},
      head: {ref: 'renovate/react-19.x'},
    })

    expect(context.dependencies.length).toBeGreaterThan(0)
  })

  it('should still filter phantoms when all files have patches', async () => {
    mockedOctokit.rest.pulls.get.mockResolvedValue({
      data: {base: {sha: 'base'}, head: {sha: 'head'}},
    } as any)
    mockedOctokit.rest.repos.getContent.mockRejectedValue(new Error('not found'))
    mockedOctokit.rest.pulls.listFiles.mockResolvedValue({
      data: [
        createMockPRFile({
          filename: '.github/workflows/ci.yaml',
          patch:
            '@@ -1 +1 @@\n-uses: bfra-me/renovate-action@old\n+uses: bfra-me/renovate-action@new',
        }),
      ],
    } as any)
    mockedOctokit.rest.pulls.listCommits.mockResolvedValue({
      data: [
        createMockCommit({
          commit: {message: 'chore(github-actions): update bfra-me/renovate-action to v9'},
        }),
      ],
    } as any)

    const context = await extractPRContext(octokit, 'test-owner', 'test-repo', 1, {
      title: 'chore(deps): update bfra-me/renovate-action to v9',
      body: pr1770Body,
      user: {login: 'renovate[bot]'},
      head: {ref: 'renovate/bfra-me-renovate-action-9.x'},
    })

    expect(context.dependencies.some(d => d.name === 'bfra-me/renovate-action')).toBe(true)
    expect(context.dependencies.some(d => d.name === 'github/codeql-action')).toBe(false)
  })
})
