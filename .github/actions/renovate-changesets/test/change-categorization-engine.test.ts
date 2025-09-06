import type {RenovateDependency} from '../src/renovate-parser'
import type {DependencyImpact, ImpactAssessment} from '../src/semver-impact-assessor'

import {describe, expect, it} from 'vitest'
import {ChangeCategorizationEngine} from '../src/change-categorization-engine'

describe('ChangeCategorizationEngine', () => {
  const createMockDependency = (
    name: string,
    currentVersion?: string,
    newVersion?: string,
    options: Partial<RenovateDependency> = {},
  ): RenovateDependency => ({
    name,
    currentVersion,
    newVersion,
    manager: 'npm',
    updateType: 'minor',
    isSecurityUpdate: false,
    isGrouped: false,
    ...options,
  })

  const createMockImpact = (
    name: string,
    options: Partial<DependencyImpact> = {},
  ): DependencyImpact => ({
    name,
    currentVersion: '1.0.0',
    newVersion: '1.1.0',
    versionChange: 'minor',
    semverImpact: 'minor',
    isBreaking: false,
    isSecurityUpdate: false,
    isDowngrade: false,
    isPrerelease: false,
    confidence: 'high',
    reasoning: [],
    ...options,
  })

  const createMockAssessment = (
    dependencies: DependencyImpact[],
    options: Partial<ImpactAssessment> = {},
  ): ImpactAssessment => ({
    dependencies,
    overallImpact: 'minor',
    recommendedChangesetType: 'minor',
    isSecurityUpdate: false,
    hasBreakingChanges: false,
    hasDowngrades: false,
    hasPreleases: false,
    confidence: 'high',
    reasoning: [],
    totalVulnerabilities: 0,
    highSeverityVulnerabilities: 0,
    criticalBreakingChanges: 0,
    overallRiskScore: 25,
    ...options,
  })

  describe('basic categorization', () => {
    it('should categorize patch updates correctly', () => {
      const engine = new ChangeCategorizationEngine()
      const dependencies = [createMockDependency('test-pkg', '1.0.0', '1.0.1')]
      const impacts = [
        createMockImpact('test-pkg', {
          versionChange: 'patch',
          semverImpact: 'patch',
        }),
      ]
      const assessment = createMockAssessment(impacts, {
        overallImpact: 'patch',
        recommendedChangesetType: 'patch',
      })

      const result = engine.categorizeChanges(dependencies, assessment)

      expect(result.primaryCategory).toBe('patch')
      expect(result.allCategories).toEqual(['patch'])
      expect(result.summary.patchUpdates).toBe(1)
      expect(result.summary.totalDependencies).toBe(1)
      expect(result.recommendedChangesetType).toBe('patch')
    })

    it('should categorize minor updates correctly', () => {
      const engine = new ChangeCategorizationEngine()
      const dependencies = [createMockDependency('test-pkg', '1.0.0', '1.1.0')]
      const impacts = [
        createMockImpact('test-pkg', {
          versionChange: 'minor',
          semverImpact: 'minor',
        }),
      ]
      const assessment = createMockAssessment(impacts, {
        overallImpact: 'minor',
        recommendedChangesetType: 'minor',
      })

      const result = engine.categorizeChanges(dependencies, assessment)

      expect(result.primaryCategory).toBe('minor')
      expect(result.allCategories).toEqual(['minor'])
      expect(result.summary.minorUpdates).toBe(1)
      expect(result.recommendedChangesetType).toBe('minor')
    })

    it('should categorize major updates correctly', () => {
      const engine = new ChangeCategorizationEngine()
      const dependencies = [createMockDependency('test-pkg', '1.0.0', '2.0.0')]
      const impacts = [
        createMockImpact('test-pkg', {
          versionChange: 'major',
          semverImpact: 'major',
        }),
      ]
      const assessment = createMockAssessment(impacts, {
        overallImpact: 'major',
        recommendedChangesetType: 'major',
      })

      const result = engine.categorizeChanges(dependencies, assessment)

      expect(result.primaryCategory).toBe('major')
      expect(result.allCategories).toEqual(['major'])
      expect(result.summary.majorUpdates).toBe(1)
      expect(result.dependencies).toHaveLength(1)
      const firstDep = result.dependencies[0]
      expect(firstDep?.isHighPriority).toBe(true)
      expect(result.recommendedChangesetType).toBe('major')
    })
  })

  describe('security update categorization', () => {
    it('should prioritize security updates over version impact', () => {
      const engine = new ChangeCategorizationEngine()
      const dependencies = [
        createMockDependency('test-pkg', '1.0.0', '1.0.1', {
          isSecurityUpdate: true,
          securitySeverity: 'high',
        }),
      ]
      const impacts = [
        createMockImpact('test-pkg', {
          versionChange: 'patch',
          semverImpact: 'patch',
          isSecurityUpdate: true,
          securitySeverity: 'high',
        }),
      ]
      const assessment = createMockAssessment(impacts, {
        isSecurityUpdate: true,
        overallImpact: 'patch',
        recommendedChangesetType: 'patch',
      })

      const result = engine.categorizeChanges(dependencies, assessment)

      expect(result.primaryCategory).toBe('security')
      expect(result.allCategories).toEqual(['security'])
      expect(result.summary.securityUpdates).toBe(1)
      const firstDep = result.dependencies[0]
      expect(firstDep?.isHighPriority).toBe(true)
      expect(firstDep?.riskLevel).toBe('high')
    })

    it('should handle critical security updates with elevated risk', () => {
      const engine = new ChangeCategorizationEngine()
      const dependencies = [
        createMockDependency('test-pkg', '1.0.0', '1.0.1', {
          isSecurityUpdate: true,
          securitySeverity: 'critical',
        }),
      ]
      const impacts = [
        createMockImpact('test-pkg', {
          isSecurityUpdate: true,
          securitySeverity: 'critical',
        }),
      ]
      const assessment = createMockAssessment(impacts, {isSecurityUpdate: true})

      const result = engine.categorizeChanges(dependencies, assessment)

      const firstDep = result.dependencies[0]
      expect(firstDep?.riskLevel).toBe('critical')
      expect(result.summary.averageRiskLevel).toBe(100)
      expect(result.recommendedChangesetType).toBe('minor')
    })

    it('should handle low severity security updates', () => {
      const engine = new ChangeCategorizationEngine()
      const dependencies = [
        createMockDependency('test-pkg', '1.0.0', '1.0.1', {
          isSecurityUpdate: true,
          securitySeverity: 'low',
        }),
      ]
      const impacts = [
        createMockImpact('test-pkg', {
          isSecurityUpdate: true,
          securitySeverity: 'low',
        }),
      ]
      const assessment = createMockAssessment(impacts, {isSecurityUpdate: true})

      const result = engine.categorizeChanges(dependencies, assessment)

      const firstDep = result.dependencies[0]
      expect(firstDep?.riskLevel).toBe('low')
      expect(result.recommendedChangesetType).toBe('patch')
    })
  })

  describe('breaking change detection', () => {
    it('should identify breaking changes and elevate priority', () => {
      const engine = new ChangeCategorizationEngine()
      const dependencies = [createMockDependency('test-pkg', '1.0.0', '2.0.0')]
      const impacts = [
        createMockImpact('test-pkg', {
          versionChange: 'major',
          semverImpact: 'major',
          isBreaking: true,
        }),
      ]
      const assessment = createMockAssessment(impacts, {
        hasBreakingChanges: true,
        overallImpact: 'major',
        recommendedChangesetType: 'major',
      })

      const result = engine.categorizeChanges(dependencies, assessment)

      const firstDep = result.dependencies[0]
      expect(firstDep?.isHighPriority).toBe(true)
      expect(firstDep?.riskLevel).toBe('high')
      expect(result.summary.breakingChanges).toBe(1)
      expect(result.recommendedChangesetType).toBe('major')
    })

    it('should handle breaking changes in non-major updates', () => {
      const engine = new ChangeCategorizationEngine()
      const dependencies = [createMockDependency('test-pkg', '1.0.0', '1.1.0')]
      const impacts = [
        createMockImpact('test-pkg', {
          versionChange: 'minor',
          semverImpact: 'minor',
          isBreaking: true,
        }),
      ]
      const assessment = createMockAssessment(impacts, {hasBreakingChanges: true})

      const result = engine.categorizeChanges(dependencies, assessment)

      const firstDep = result.dependencies[0]
      expect(firstDep?.category).toBe('minor')
      expect(firstDep?.secondaryCategories).toContain('major')
      expect(firstDep?.isHighPriority).toBe(true)
    })
  })

  describe('multiple dependencies categorization', () => {
    it('should handle mixed update types with correct prioritization', () => {
      const engine = new ChangeCategorizationEngine()
      const dependencies = [
        createMockDependency('security-pkg', '1.0.0', '1.0.1', {
          isSecurityUpdate: true,
          securitySeverity: 'high',
        }),
        createMockDependency('major-pkg', '1.0.0', '2.0.0'),
        createMockDependency('minor-pkg', '1.0.0', '1.1.0'),
        createMockDependency('patch-pkg', '1.0.0', '1.0.1'),
      ]
      const impacts = [
        createMockImpact('security-pkg', {
          isSecurityUpdate: true,
          securitySeverity: 'high',
          semverImpact: 'patch',
        }),
        createMockImpact('major-pkg', {
          versionChange: 'major',
          semverImpact: 'major',
        }),
        createMockImpact('minor-pkg', {
          versionChange: 'minor',
          semverImpact: 'minor',
        }),
        createMockImpact('patch-pkg', {
          versionChange: 'patch',
          semverImpact: 'patch',
        }),
      ]
      const assessment = createMockAssessment(impacts, {
        isSecurityUpdate: true,
        overallImpact: 'major',
      })

      const result = engine.categorizeChanges(dependencies, assessment)

      expect(result.primaryCategory).toBe('security')
      expect(result.allCategories).toEqual(['security', 'major', 'minor', 'patch'])
      expect(result.summary.totalDependencies).toBe(4)
      expect(result.summary.securityUpdates).toBe(1)
      expect(result.summary.majorUpdates).toBe(1)
      expect(result.summary.minorUpdates).toBe(1)
      expect(result.summary.patchUpdates).toBe(1)
    })

    it('should calculate correct average risk level', () => {
      const engine = new ChangeCategorizationEngine()
      const dependencies = [
        createMockDependency('low-risk', '1.0.0', '1.0.1'),
        createMockDependency('high-risk', '1.0.0', '2.0.0'),
      ]
      const impacts = [
        createMockImpact('low-risk', {semverImpact: 'patch'}),
        createMockImpact('high-risk', {semverImpact: 'major', isBreaking: true}),
      ]
      const assessment = createMockAssessment(impacts)

      const result = engine.categorizeChanges(dependencies, assessment)

      // low: 25, high: 75, average: 50
      expect(result.summary.averageRiskLevel).toBe(50)
    })
  })

  describe('manager-specific rules', () => {
    it('should apply GitHub Actions manager rules', () => {
      const engine = new ChangeCategorizationEngine({
        managerCategoryRules: {
          'github-actions': {
            categoryOverrides: {major: 'minor'},
            riskAdjustment: 0.8,
          },
        },
      })
      const dependencies = [
        createMockDependency('actions/checkout', '3.0.0', '4.0.0', {
          manager: 'github-actions',
        }),
      ]
      const impacts = [
        createMockImpact('actions/checkout', {
          versionChange: 'major',
          semverImpact: 'major',
        }),
      ]
      const assessment = createMockAssessment(impacts)

      const result = engine.categorizeChanges(dependencies, assessment)

      const firstDep = result.dependencies[0]
      expect(firstDep?.category).toBe('minor')
      expect(firstDep?.reasoning).toContain(
        'Manager-specific override: github-actions major → minor',
      )
    })

    it('should apply risk adjustment factors', () => {
      const engine = new ChangeCategorizationEngine({
        managerCategoryRules: {
          npm: {
            riskAdjustment: 2, // Double risk
          },
        },
      })
      const dependencies = [createMockDependency('test-pkg', '1.0.0', '1.1.0', {manager: 'npm'})]
      const impacts = [createMockImpact('test-pkg', {semverImpact: 'minor'})]
      const assessment = createMockAssessment(impacts)

      const result = engine.categorizeChanges(dependencies, assessment)

      const firstDep = result.dependencies[0]
      expect(firstDep?.riskLevel).toBe('medium') // Elevated from low
      expect(firstDep?.reasoning).toContain('Risk adjusted for npm manager')
    })
  })

  describe('prerelease handling', () => {
    it('should lower priority for prerelease versions', () => {
      const engine = new ChangeCategorizationEngine({
        prereleaseAsLowerPriority: true,
      })
      const dependencies = [createMockDependency('test-pkg', '1.0.0', '2.0.0-alpha.1')]
      const impacts = [
        createMockImpact('test-pkg', {
          versionChange: 'major',
          semverImpact: 'major',
          isPrerelease: true,
        }),
      ]
      const assessment = createMockAssessment(impacts)

      const result = engine.categorizeChanges(dependencies, assessment)

      const firstDep = result.dependencies[0]
      expect(firstDep?.isHighPriority).toBe(false)
      expect(firstDep?.reasoning).toContain('Pre-release version')
    })
  })

  describe('downgrades handling', () => {
    it('should handle version downgrades correctly', () => {
      const engine = new ChangeCategorizationEngine()
      const dependencies = [createMockDependency('test-pkg', '2.0.0', '1.9.0')]
      const impacts = [
        createMockImpact('test-pkg', {
          versionChange: 'minor',
          semverImpact: 'minor',
          isDowngrade: true,
          confidence: 'medium',
        }),
      ]
      const assessment = createMockAssessment(impacts)

      const result = engine.categorizeChanges(dependencies, assessment)

      const firstDep = result.dependencies[0]
      expect(firstDep?.confidence).toBe('low') // Lowered due to downgrade
      expect(firstDep?.riskLevel).toBe('medium') // Elevated due to downgrade
      expect(firstDep?.reasoning).toContain('Version downgrade detected')
    })
  })

  describe('confidence calculation', () => {
    it('should calculate overall confidence correctly', () => {
      const engine = new ChangeCategorizationEngine()
      const dependencies = [
        createMockDependency('high-conf', '1.0.0', '1.1.0'),
        createMockDependency('medium-conf', '1.0.0', '1.1.0'),
        createMockDependency('low-conf', '1.0.0', '1.1.0'),
      ]
      const impacts = [
        createMockImpact('high-conf', {confidence: 'high'}),
        createMockImpact('medium-conf', {confidence: 'medium'}),
        createMockImpact('low-conf', {confidence: 'low'}),
      ]
      const assessment = createMockAssessment(impacts)

      const result = engine.categorizeChanges(dependencies, assessment)

      expect(result.confidence).toBe('medium') // Average of high, medium, low
    })
  })

  describe('edge cases', () => {
    it('should handle empty dependencies list', () => {
      const engine = new ChangeCategorizationEngine()
      const dependencies: RenovateDependency[] = []
      const impacts: DependencyImpact[] = []
      const assessment = createMockAssessment(impacts, {
        overallImpact: 'patch',
        recommendedChangesetType: 'patch',
      })

      const result = engine.categorizeChanges(dependencies, assessment)

      expect(result.primaryCategory).toBe('patch')
      expect(result.allCategories).toEqual([])
      expect(result.summary.totalDependencies).toBe(0)
      expect(result.summary.averageRiskLevel).toBe(0)
    })

    it('should throw error for missing impact assessment', () => {
      const engine = new ChangeCategorizationEngine()
      const dependencies = [createMockDependency('test-pkg', '1.0.0', '1.1.0')]
      const impacts: DependencyImpact[] = [] // Empty impacts for non-empty dependencies
      const assessment = createMockAssessment(impacts)

      expect(() => {
        engine.categorizeChanges(dependencies, assessment)
      }).toThrow('No impact assessment found for dependency: test-pkg')
    })
  })

  describe('complex scenarios', () => {
    it('should handle security updates with breaking changes', () => {
      const engine = new ChangeCategorizationEngine()
      const dependencies = [
        createMockDependency('security-breaking', '1.0.0', '2.0.0', {
          isSecurityUpdate: true,
          securitySeverity: 'critical',
        }),
      ]
      const impacts = [
        createMockImpact('security-breaking', {
          versionChange: 'major',
          semverImpact: 'major',
          isSecurityUpdate: true,
          securitySeverity: 'critical',
          isBreaking: true,
        }),
      ]
      const assessment = createMockAssessment(impacts, {
        isSecurityUpdate: true,
        hasBreakingChanges: true,
      })

      const result = engine.categorizeChanges(dependencies, assessment)

      const firstDep = result.dependencies[0]
      expect(firstDep?.category).toBe('security')
      expect(firstDep?.secondaryCategories).toContain('major')
      expect(firstDep?.isHighPriority).toBe(true)
      expect(firstDep?.riskLevel).toBe('critical')
      expect(result.summary.securityUpdates).toBe(1)
      expect(result.summary.breakingChanges).toBe(1)
    })

    it('should recommend appropriate changeset types for mixed scenarios', () => {
      const engine = new ChangeCategorizationEngine()
      const dependencies = [
        createMockDependency('breaking-pkg', '1.0.0', '2.0.0'),
        createMockDependency('regular-pkg', '1.0.0', '1.1.0'),
      ]
      const impacts = [
        createMockImpact('breaking-pkg', {
          versionChange: 'major',
          semverImpact: 'major',
          isBreaking: true,
        }),
        createMockImpact('regular-pkg', {
          versionChange: 'minor',
          semverImpact: 'minor',
        }),
      ]
      const assessment = createMockAssessment(impacts, {
        hasBreakingChanges: true,
        overallImpact: 'major',
        recommendedChangesetType: 'major',
      })

      const result = engine.categorizeChanges(dependencies, assessment)

      expect(result.recommendedChangesetType).toBe('major')
      expect(result.primaryCategory).toBe('major')
      expect(result.allCategories).toEqual(['major', 'minor'])
    })
  })
})
