import type {RenovateUpdateType} from '../renovate-parser.js'
import type {ActionVersion} from './gha-types.js'

export function parseActionVersion(ref: string): ActionVersion {
  const version: ActionVersion = {
    original: ref,
    isCommitSha: false,
    isBranch: false,
    isTag: false,
  }

  if (/^[a-f0-9]{40}$/i.test(ref)) {
    version.isCommitSha = true
    return version
  }

  const semverMatch = ref.match(
    /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([a-zA-Z0-9.-]+))?(?:\+([a-zA-Z0-9.-]+))?$/,
  )
  if (semverMatch && semverMatch[1]) {
    version.isTag = true
    version.major = Number.parseInt(semverMatch[1], 10)
    version.minor = semverMatch[2] ? Number.parseInt(semverMatch[2], 10) : 0
    version.patch = semverMatch[3] ? Number.parseInt(semverMatch[3], 10) : 0
    version.prerelease = semverMatch[4]
    version.build = semverMatch[5]
    return version
  }

  version.isBranch = true
  return version
}

export function calculateSemverImpact(
  currentRef?: string,
  newRef?: string,
): 'major' | 'minor' | 'patch' | 'prerelease' | 'none' {
  if (!currentRef || !newRef) {
    return 'patch'
  }

  const currentVersion = parseActionVersion(currentRef)
  const newVersion = parseActionVersion(newRef)

  if (currentVersion.isCommitSha && newVersion.isCommitSha) {
    return 'patch'
  }

  if (currentVersion.isBranch || newVersion.isBranch) {
    return 'minor'
  }

  if (
    currentVersion.isTag &&
    newVersion.isTag &&
    currentVersion.major !== undefined &&
    newVersion.major !== undefined
  ) {
    if (currentVersion.major !== newVersion.major) {
      return 'major'
    }

    if (currentVersion.minor !== newVersion.minor) {
      return 'minor'
    }

    if (currentVersion.patch !== newVersion.patch) {
      return 'patch'
    }

    if (currentVersion.prerelease !== newVersion.prerelease) {
      return 'prerelease'
    }
  }

  return 'none'
}

export function determineUpdateType(currentRef?: string, newRef?: string): RenovateUpdateType {
  const semverImpact = calculateSemverImpact(currentRef, newRef)

  switch (semverImpact) {
    case 'major':
      return 'major'
    case 'minor':
      return 'minor'
    case 'patch':
      return 'patch'
    case 'prerelease':
      return 'minor'
    default:
      return 'patch'
  }
}

export function isSecurityRelatedAction(actionName: string): boolean {
  const securityActions = [
    'ossf/scorecard-action',
    'github/codeql-action',
    'actions/dependency-review-action',
    'securecodewarrior/github-action-add-sarif',
    'securecodewarrior/github-action-add-vulnerable-dependency',
    'step-security/harden-runner',
  ]

  return securityActions.some(secAction => actionName.includes(secAction))
}

export function isReusableWorkflow(uses: string): boolean {
  return uses.includes('.yaml') || uses.includes('.yml')
}
