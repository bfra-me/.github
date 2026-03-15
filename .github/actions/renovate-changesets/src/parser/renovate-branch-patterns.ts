import type {BranchPatterns} from './renovate-parser-types.js'

import {minimatch} from 'minimatch'

const DEFAULT_BRANCH_PATTERNS: BranchPatterns = {
  renovate: [
    'renovate/**',
    'renovate/*',
    'chore/renovate-**',
    'chore/update-**',
    'deps/renovate-**',
    'update/**',
    'bump/**',
  ],
  dependabot: ['dependabot/**', 'dependabot/*'],
  custom: [],
}

export function createBranchPatterns(
  customBranchPatterns?: Partial<BranchPatterns>,
): BranchPatterns {
  const {custom = [], ...overrides} = customBranchPatterns ?? {}
  return {...DEFAULT_BRANCH_PATTERNS, ...overrides, custom}
}

export function isRenovateBranch(branchName: string, branchPatterns: BranchPatterns): boolean {
  return [...branchPatterns.renovate, ...branchPatterns.dependabot, ...branchPatterns.custom].some(
    pattern => minimatch(branchName, pattern, {dot: true}),
  )
}

export function getBranchType(
  branchName: string,
  branchPatterns: BranchPatterns,
): 'renovate' | 'dependabot' | 'custom' | 'unknown' {
  if (branchPatterns.renovate.some(pattern => minimatch(branchName, pattern, {dot: true}))) {
    return 'renovate'
  }

  if (branchPatterns.dependabot.some(pattern => minimatch(branchName, pattern, {dot: true}))) {
    return 'dependabot'
  }

  if (branchPatterns.custom.some(pattern => minimatch(branchName, pattern, {dot: true}))) {
    return 'custom'
  }

  return 'unknown'
}
