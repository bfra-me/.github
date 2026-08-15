import type {ExtractedRenovateUpdates, ExtractedUpdate} from '../extract/renovate-body-extractor.js'

const SEMVER_PATTERN =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u
const SECURITY_COMMIT_SUFFIX = /\[security\]\s*$/iu

export type BumpType = 'patch' | 'minor' | 'major'
export type UpdateCategory = BumpType | 'security'

export interface ClassificationResult {
  bumpType: BumpType
  updateCategory: UpdateCategory
  isSecurityUpdate: boolean
}

interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease: string | undefined
}

/**
 * Classify extracted Renovate updates without consulting PR body prose.
 *
 * A non-semver or downward transition is conservatively treated as major: a
 * false major is visible and reviewable, while an under-bump can publish an
 * incorrect release. Prerelease changes with the same core version are patch
 * changes, including prerelease-to-stable promotion.
 */
export function classifyRenovateUpdates(extracted: ExtractedRenovateUpdates): ClassificationResult {
  const bumpType = extracted.updates.reduce<BumpType>(
    (highest, update) => maxBump(highest, classifyVersionTransition(update)),
    'patch',
  )
  const isSecurityUpdate = hasSecuritySignal(extracted)

  return {
    bumpType,
    updateCategory: isSecurityUpdate ? 'security' : bumpType,
    isSecurityUpdate,
  }
}

function classifyVersionTransition(update: ExtractedUpdate): BumpType {
  const current = parseSemver(update.currentVersion)
  const next = parseSemver(update.newVersion)

  if (current == null || next == null) return 'major'
  if (next.major !== current.major) return 'major'
  if (next.minor !== current.minor) return next.minor > current.minor ? 'minor' : 'major'
  if (next.patch !== current.patch) return next.patch > current.patch ? 'patch' : 'major'

  if (current.prerelease == null && next.prerelease != null) return 'major'
  return comparePrerelease(current.prerelease, next.prerelease) <= 0 ? 'patch' : 'major'
}

function parseSemver(value: string): ParsedVersion | undefined {
  const match = value.trim().match(SEMVER_PATTERN)
  if (match == null) return undefined

  const [, major, minor, patch, prerelease] = match
  if (major == null || minor == null || patch == null) return undefined

  return {
    major: Number.parseInt(major, 10),
    minor: Number.parseInt(minor, 10),
    patch: Number.parseInt(patch, 10),
    prerelease,
  }
}

function maxBump(left: BumpType, right: BumpType): BumpType {
  const rank: Record<BumpType, number> = {patch: 0, minor: 1, major: 2}
  return rank[right] > rank[left] ? right : left
}

function comparePrerelease(current: string | undefined, next: string | undefined): number {
  if (current === next) return 0
  if (current == null) return 1
  if (next == null) return -1

  const currentIdentifiers = current.split('.')
  const nextIdentifiers = next.split('.')
  const length = Math.max(currentIdentifiers.length, nextIdentifiers.length)

  for (let index = 0; index < length; index++) {
    const currentIdentifier = currentIdentifiers[index]
    const nextIdentifier = nextIdentifiers[index]
    if (currentIdentifier === nextIdentifier) continue
    if (currentIdentifier == null) return -1
    if (nextIdentifier == null) return 1

    const currentNumber = toPrereleaseNumber(currentIdentifier)
    const nextNumber = toPrereleaseNumber(nextIdentifier)
    if (currentNumber != null && nextNumber != null) return currentNumber - nextNumber
    if (currentNumber != null) return -1
    if (nextNumber != null) return 1
    return currentIdentifier < nextIdentifier ? -1 : 1
  }

  return 0
}

function toPrereleaseNumber(identifier: string): number | undefined {
  return /^\d+$/u.test(identifier) ? Number.parseInt(identifier, 10) : undefined
}

function hasSecuritySignal(extracted: ExtractedRenovateUpdates): boolean {
  if (/vulnerability/iu.test(extracted.branchName)) return true
  if (extracted.commitMessage != null && SECURITY_COMMIT_SUFFIX.test(extracted.commitMessage))
    return true

  return extracted.labels.some(label => label.trim().toLowerCase() === 'vulnerabilityalerts')
}
