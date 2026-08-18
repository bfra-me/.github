import type {ExtractedRenovateUpdates, ExtractedUpdate} from '../extract/renovate-body-extractor.js'

// Accepts one to three numeric components with optional leading zeros, because two of the four
// supported ecosystems do not use strict semver: Docker tags look like `22.04` or `3.19`, and
// GitHub Actions pins look like `4`. Requiring three components classified every one of those as
// unparseable, and therefore as a major bump.
const VERSION_PATTERN =
  /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u
const SECURITY_COMMIT_SUFFIX = /\[security\]\s*$/iu
// Renovate's `vulnerabilityAlerts.labels` is user-configured, so the label text varies by repo.
// Match the conventional values rather than the config option name.
const SECURITY_LABELS = new Set(['security', 'vulnerability'])

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
  if (extracted.operation?.kind === 'lockfile-maintenance') {
    return {bumpType: 'patch', updateCategory: 'patch', isSecurityUpdate: false}
  }

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
  if (update.isRollback) return 'patch'
  // A digest refresh repins the same reference and carries no semver signal, so it is a patch.
  // Falling through to version parsing would classify it major, because a SHA is unparseable.
  if (update.isDigest) return 'patch'

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
  // This repeats extractor range stripping intentionally for direct classifier inputs; `v` is
  // also accepted here because the classifier normalizes version tags independently.
  const match = value
    .trim()
    .replace(/^[<>=~^v]+/iu, '')
    .match(VERSION_PATTERN)
  if (match == null) return undefined

  const [, major, minor, patch, prerelease] = match
  if (major == null) return undefined

  return {
    major: Number.parseInt(major, 10),
    minor: minor == null ? 0 : Number.parseInt(minor, 10),
    patch: patch == null ? 0 : Number.parseInt(patch, 10),
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

  return extracted.labels.some(label => SECURITY_LABELS.has(label.trim().toLowerCase()))
}
