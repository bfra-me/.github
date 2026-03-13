import {describe, expect, it} from 'vitest'

const extractDependenciesFromTitle = (title: string): string[] => {
  const patterns = [/update (?:dependency )?([\w\-./@]+)/gi, /bump ([\w\-./@]+)/gi]

  const dependencies: string[] = []
  for (const pattern of patterns) {
    const matches = [...title.matchAll(pattern)]
    for (const match of matches) {
      if (match[1] && !dependencies.includes(match[1])) {
        dependencies.push(match[1])
      }
    }
  }

  return dependencies
}

describe('extractDependenciesFromTitle fallback logic', () => {
  it('extracts dependency name from renovate update title', () => {
    expect(
      extractDependenciesFromTitle('chore(deps): update pnpm/action-setup action to v4.4.0'),
    ).toEqual(['pnpm/action-setup'])
  })

  it('does not include generic "update" token', () => {
    expect(
      extractDependenciesFromTitle('chore(deps): update pnpm/action-setup action to v4.4.0'),
    ).not.toContain('update')
  })

  it('extracts scoped package from bump title', () => {
    expect(
      extractDependenciesFromTitle('chore(deps): bump @types/node from 22.13.14 to 22.13.15'),
    ).toEqual(['@types/node'])
  })

  it('extracts dependency name when title uses "update dependency" phrasing', () => {
    expect(
      extractDependenciesFromTitle(
        'chore(deps): update dependency bfra-me/renovate-action to v8.87.6',
      ),
    ).toEqual(['bfra-me/renovate-action'])
  })
})
