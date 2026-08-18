import {describe, expect, it} from 'vitest'
import {classifyRenovateUpdates} from '../src/classify/renovate-classifier'
import {adaptClassifiedUpdates} from '../src/compatibility-adapter'
import {extractRenovateUpdates} from '../src/extract/renovate-body-extractor'
import {mixedManagersBody, securityBody} from './extract/fixtures'

describe('adaptClassifiedUpdates', () => {
  it('retains each extracted row manager for compatibility dependencies', () => {
    const extracted = extractRenovateUpdates({
      prNumber: 4002,
      body: mixedManagersBody,
      branchName: 'renovate/all-non-major',
    })
    const classification = classifyRenovateUpdates(extracted)

    const result = adaptClassifiedUpdates(extracted, classification, ['@consumer/root'])

    expect(result.dependencies.map(dependency => dependency.manager)).toEqual([
      'npm',
      'npm',
      'npm',
      'github-actions',
    ])
  })
  it('preserves extracted package and version data while deriving compatibility analysis fields', () => {
    const extracted = extractRenovateUpdates({
      prNumber: 4001,
      body: securityBody,
      branchName: 'renovate/vulnerability-express-4.x',
    })
    const classification = classifyRenovateUpdates(extracted)

    const result = adaptClassifiedUpdates(extracted, classification, ['@consumer/root'])

    expect(result.dependencies).toMatchObject([
      {
        name: 'express',
        currentVersion: '4.18.2',
        newVersion: '4.19.2',
        updateType: 'minor',
        isSecurityUpdate: true,
      },
    ])
    expect(result.releases).toEqual([{name: '@consumer/root', type: 'minor'}])
    expect(result.categorizationResult).toEqual({
      primaryCategory: 'security',
      allCategories: ['security'],
      summary: {
        securityUpdates: 1,
        breakingChanges: 0,
        highPriorityUpdates: 0,
        averageRiskLevel: 50,
      },
      confidence: 'medium',
    })
  })

  it('keeps lockfile maintenance dependency names empty', () => {
    const extracted = {
      prNumber: 4003,
      branchName: 'renovate/lock-file-maintenance',
      manager: 'npm' as const,
      labels: [],
      updates: [],
      operation: {kind: 'lockfile-maintenance' as const, packageManagers: ['pnpm' as const]},
    }
    const classification = classifyRenovateUpdates(extracted)

    expect(
      adaptClassifiedUpdates(extracted, classification, ['@consumer/root']).dependencyNames,
    ).toEqual([])
  })
})
