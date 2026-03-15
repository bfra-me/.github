import type {ConventionalCommit} from './renovate-parser-types.js'
import {detectManagerFromCommit, detectManagerFromScope} from './renovate-manager-detector.js'
import {detectUpdateTypeFromCommit} from './renovate-update-classifier.js'

const CONVENTIONAL_COMMIT_PATTERN =
  /^(?<type>\w+)(?:\((?<scope>[^)]+)\))?: (?<description>.+)(?:\n\n(?<body>[\s\S]*?))?$/m

const DEPENDENCY_PATTERNS = [
  /update action ([@\w/.-]+)/gi,
  /update (?:dependency )?([@\w/.-]+)/gi,
  /bump ([@\w/.-]+)/gi,
  /upgrade ([@\w/.-]+)/gi,
  /\[([@\w/.-]+)\]/g,
]

export function parseCommitMessage(commitMessage: string): ConventionalCommit {
  const match = commitMessage.match(CONVENTIONAL_COMMIT_PATTERN)

  if (match?.groups == null) {
    return {
      type: 'chore',
      description: commitMessage.split('\n')[0] || commitMessage,
      body: commitMessage.includes('\n')
        ? commitMessage.split('\n').slice(1).join('\n')
        : undefined,
      isBreaking: commitMessage.includes('BREAKING CHANGE'),
    }
  }

  const type = match.groups.type ?? 'chore'
  const scope = match.groups.scope
  const description = match.groups.description ?? ''
  const body = match.groups.body
  const isBreaking = commitMessage.includes('BREAKING CHANGE') || description.startsWith('!')
  const renovateInfo = extractRenovateInfoFromCommit(commitMessage, scope)

  return {
    type,
    scope,
    description: description.replace(/^!/, ''),
    body,
    isBreaking,
    renovateInfo,
  }
}

function extractRenovateInfoFromCommit(
  commitMessage: string,
  scope?: string,
): ConventionalCommit['renovateInfo'] {
  const manager = detectManagerFromScope(scope) || detectManagerFromCommit(commitMessage)
  const dependencies = extractDependenciesFromCommit(commitMessage)
  const updateType = detectUpdateTypeFromCommit(commitMessage)

  if (manager !== 'unknown' || dependencies.length > 0) {
    return {manager, dependencies, updateType}
  }

  return undefined
}

function extractDependenciesFromCommit(commitMessage: string): string[] {
  const dependencies: string[] = []

  for (const pattern of DEPENDENCY_PATTERNS) {
    let match = pattern.exec(commitMessage)
    while (match != null) {
      if (match[1] != null && !dependencies.includes(match[1])) {
        dependencies.push(match[1])
      }
      match = pattern.exec(commitMessage)
    }
  }

  return dependencies
}
