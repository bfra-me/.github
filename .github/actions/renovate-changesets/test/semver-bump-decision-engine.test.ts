import type {DecisionFactors} from '../src/semver-bump-decision-engine'

import {describe, expect, it} from 'vitest'
import {SemverBumpTypeDecisionEngine} from '../src/semver-bump-decision-engine'

describe('SemverBumpTypeDecisionEngine', () => {
  const createMockFactors = (overrides: Partial<DecisionFactors> = {}): DecisionFactors => ({
    semverImpact: {
      dependencies: [
        {
          name: 'test-package',
          currentVersion: '1.0.0',
          newVersion: '1.1.0',
          versionChange: 'minor',
          semverImpact: 'minor',
          isBreaking: false,
          isSecurityUpdate: false,
          isDowngrade: false,
          isPrerelease: false,
          confidence: 'high',
          reasoning: ['Minor version update'],
        },
      ],
      overallImpact: 'minor',
      recommendedChangesetType: 'minor',
      isSecurityUpdate: false,
      hasBreakingChanges: false,
      hasDowngrades: false,
      hasPreleases: false,
      confidence: 'high',
      reasoning: ['Assessment completed'],
      totalVulnerabilities: 0,
      highSeverityVulnerabilities: 0,
      criticalBreakingChanges: 0,
      overallRiskScore: 10,
    },
    categorization: {
      dependencies: [],
      primaryCategory: 'minor',
      allCategories: ['minor'],
      categorizedGroups: {major: [], minor: [], patch: [], security: []},
      summary: {
        totalDependencies: 1,
        majorUpdates: 0,
        minorUpdates: 1,
        patchUpdates: 0,
        securityUpdates: 0,
        breakingChanges: 0,
        highPriorityUpdates: 0,
        averageRiskLevel: 1,
      },
      confidence: 'high',
      reasoning: ['Categorization completed'],
      recommendedChangesetType: 'minor',
    },
    renovateContext: {
      dependencies: [],
      isRenovateBot: true,
      branchName: 'renovate/test-package',
      prTitle: 'Update test-package',
      prBody: '',
      commitMessages: [],
      isGroupedUpdate: false,
      isSecurityUpdate: false,
      updateType: 'minor',
      manager: 'npm',
      files: [],
    },
    manager: 'npm',
    isGroupedUpdate: false,
    dependencyCount: 1,
    ...overrides,
  })

  describe('basic decision making', () => {
    it('should use categorization recommendation by default', () => {
      const engine = new SemverBumpTypeDecisionEngine()
      const factors = createMockFactors()

      const result = engine.decideBumpType(factors)

      expect(result.bumpType).toBe('minor')
      expect(result.confidence).toBe('high')
      expect(result.primaryReason).toContain('minor bump')
    })

    it('should fall back to semver impact when categorization is unavailable', () => {
      const engine = new SemverBumpTypeDecisionEngine()
      const factors = createMockFactors({
        categorization: {
          ...createMockFactors().categorization,
          recommendedChangesetType: 'patch', // Use patch as fallback when testing unavailable categorization
          confidence: 'low', // Low confidence categorization should fall back to semver
        },
      })

      const result = engine.decideBumpType(factors)

      expect(result.bumpType).toBe('minor')
      expect(result.confidence).toBe('high')
    })

    it('should use default bump type when all recommendations are unclear', () => {
      const engine = new SemverBumpTypeDecisionEngine({
        defaultBumpType: 'patch',
      })
      const factors = createMockFactors({
        semverImpact: {
          ...createMockFactors().semverImpact,
          recommendedChangesetType: 'patch',
          confidence: 'low',
        },
        categorization: {
          ...createMockFactors().categorization,
          recommendedChangesetType: 'patch',
          confidence: 'low',
        },
      })

      const result = engine.decideBumpType(factors)

      expect(result.bumpType).toBe('patch')
    })
  })

  describe('security precedence rules', () => {
    it('should prioritize security updates with appropriate bump type', () => {
      const engine = new SemverBumpTypeDecisionEngine({
        securityTakesPrecedence: true,
        securityMinimumBumps: {
          low: 'patch',
          moderate: 'patch',
          high: 'minor',
          critical: 'major',
        },
      })

      const factors = createMockFactors({
        semverImpact: {
          ...createMockFactors().semverImpact,
          isSecurityUpdate: true,
          dependencies: [
            {
              name: 'vulnerable-package',
              currentVersion: '1.0.0',
              newVersion: '1.0.1',
              versionChange: 'patch',
              semverImpact: 'patch',
              isBreaking: false,
              isSecurityUpdate: true,
              securitySeverity: 'high',
              isDowngrade: false,
              isPrerelease: false,
              confidence: 'high',
              reasoning: ['Security patch'],
            },
          ],
        },
      })

      const result = engine.decideBumpType(factors)

      expect(result.bumpType).toBe('minor') // High security forces minor
      expect(result.influencingFactors).toContain('security-precedence')
      expect(result.reasoningChain).toContain(
        'Security severity: high, minimum bump: minor, result: minor',
      )
    })

    it('should handle critical security updates', () => {
      const engine = new SemverBumpTypeDecisionEngine({
        securityTakesPrecedence: true,
        securityMinimumBumps: {
          low: 'patch',
          moderate: 'patch',
          high: 'minor',
          critical: 'major',
        },
      })

      const factors = createMockFactors({
        semverImpact: {
          ...createMockFactors().semverImpact,
          isSecurityUpdate: true,
          dependencies: [
            {
              name: 'critical-vuln-package',
              currentVersion: '1.0.0',
              newVersion: '1.0.1',
              versionChange: 'patch',
              semverImpact: 'patch',
              isBreaking: false,
              isSecurityUpdate: true,
              securitySeverity: 'critical',
              isDowngrade: false,
              isPrerelease: false,
              confidence: 'high',
              reasoning: ['Critical security patch'],
            },
          ],
        },
      })

      const result = engine.decideBumpType(factors)

      expect(result.bumpType).toBe('major') // Critical security forces major
    })
  })

  describe('breaking change rules', () => {
    it('should force major bump for breaking changes', () => {
      const engine = new SemverBumpTypeDecisionEngine({
        breakingChangesAlwaysMajor: true,
      })

      const factors = createMockFactors({
        semverImpact: {
          ...createMockFactors().semverImpact,
          hasBreakingChanges: true,
          recommendedChangesetType: 'minor',
        },
      })

      const result = engine.decideBumpType(factors)

      expect(result.bumpType).toBe('major')
      expect(result.influencingFactors).toContain('breaking-changes')
      expect(result.overriddenRules).toContain('Overriding minor to major due to breaking changes')
    })

    it('should respect breaking changes always major setting', () => {
      const engine = new SemverBumpTypeDecisionEngine({
        breakingChangesAlwaysMajor: false,
      })

      const factors = createMockFactors({
        semverImpact: {
          ...createMockFactors().semverImpact,
          hasBreakingChanges: true,
          recommendedChangesetType: 'minor',
        },
      })

      const result = engine.decideBumpType(factors)

      expect(result.bumpType).toBe('minor') // Respects the original recommendation
    })
  })

  describe('package manager specific rules', () => {
    it('should apply GitHub Actions manager rules', () => {
      const engine = new SemverBumpTypeDecisionEngine({
        managerSpecificRules: {
          'github-actions': {
            allowDowngrade: true,
            maxBumpType: 'minor',
            defaultBumpType: 'patch',
            majorAsMinor: true,
          },
        },
      })

      const factors = createMockFactors({
        manager: 'github-actions',
        semverImpact: {
          ...createMockFactors().semverImpact,
          recommendedChangesetType: 'major',
        },
        categorization: {
          ...createMockFactors().categorization,
          confidence: 'low', // Low confidence so semver major is preferred
        },
      })

      const result = engine.decideBumpType(factors)

      expect(result.bumpType).toBe('minor') // Major treated as minor for GitHub Actions
      expect(result.influencingFactors).toContain('manager-rules-github-actions')
      expect(result.overriddenRules).toContain(
        'Downgraded major to minor for github-actions manager',
      )
    })

    it('should respect max bump type restrictions', () => {
      const engine = new SemverBumpTypeDecisionEngine({
        managerSpecificRules: {
          docker: {
            allowDowngrade: false,
            maxBumpType: 'patch',
            defaultBumpType: 'patch',
            majorAsMinor: false,
          },
        },
      })

      const factors = createMockFactors({
        manager: 'docker',
        semverImpact: {
          ...createMockFactors().semverImpact,
          recommendedChangesetType: 'major',
        },
        categorization: {
          ...createMockFactors().categorization,
          confidence: 'low', // Low confidence so semver major is preferred
        },
      })

      const result = engine.decideBumpType(factors)

      expect(result.bumpType).toBe('patch') // Restricted to max bump type
      expect(result.overriddenRules).toContain(
        'Restricted major to patch due to docker manager max bump type',
      )
    })
  })

  describe('organization-specific rules', () => {
    it('should apply conservative mode', () => {
      const engine = new SemverBumpTypeDecisionEngine({
        organizationRules: {
          conservativeMode: true,
          preferMinorForMajor: true,
          groupedUpdateHandling: 'conservative',
          dependencyPatternRules: [],
        },
      })

      const factors = createMockFactors({
        semverImpact: {
          ...createMockFactors().semverImpact,
          recommendedChangesetType: 'major',
        },
        categorization: {
          ...createMockFactors().categorization,
          confidence: 'low', // Low confidence so semver major is preferred
        },
      })

      const result = engine.decideBumpType(factors)

      expect(result.bumpType).toBe('minor') // Conservative mode downgrades major to minor
      expect(result.overriddenRules).toContain('Conservative mode: downgraded major to minor')
    })

    it('should apply dependency pattern rules', () => {
      const engine = new SemverBumpTypeDecisionEngine({
        organizationRules: {
          conservativeMode: false,
          preferMinorForMajor: false,
          groupedUpdateHandling: 'highest',
          dependencyPatternRules: [
            {
              pattern: /^@types\//,
              maxBumpType: 'patch',
            },
          ],
        },
      })

      const factors = createMockFactors({
        semverImpact: {
          ...createMockFactors().semverImpact,
          dependencies: [
            {
              name: '@types/node',
              currentVersion: '18.0.0',
              newVersion: '20.0.0',
              versionChange: 'major',
              semverImpact: 'major',
              isBreaking: false,
              isSecurityUpdate: false,
              isDowngrade: false,
              isPrerelease: false,
              confidence: 'high',
              reasoning: ['Major version update'],
            },
          ],
          recommendedChangesetType: 'major',
        },
        categorization: {
          ...createMockFactors().categorization,
          confidence: 'low', // Low confidence so semver major is preferred
        },
      })

      const result = engine.decideBumpType(factors)

      expect(result.bumpType).toBe('patch') // Pattern rule restricts @types/* to patch
      expect(result.overriddenRules).toContain(
        'Pattern rule restricted major to patch for @types/node',
      )
    })
  })

  describe('risk-based adjustments', () => {
    it('should force major bump for high risk scores', () => {
      const engine = new SemverBumpTypeDecisionEngine({
        riskTolerance: {
          patchMaxRisk: 20,
          minorMaxRisk: 50,
          majorRiskThreshold: 80,
        },
      })

      const factors = createMockFactors({
        semverImpact: {
          ...createMockFactors().semverImpact,
          overallRiskScore: 85,
          recommendedChangesetType: 'minor',
        },
      })

      const result = engine.decideBumpType(factors)

      expect(result.bumpType).toBe('major') // High risk forces major
      expect(result.influencingFactors).toContain('risk-assessment')
    })

    it('should upgrade patch to minor for medium risk', () => {
      const engine = new SemverBumpTypeDecisionEngine({
        riskTolerance: {
          patchMaxRisk: 20,
          minorMaxRisk: 50,
          majorRiskThreshold: 80,
        },
      })

      const factors = createMockFactors({
        semverImpact: {
          ...createMockFactors().semverImpact,
          overallRiskScore: 35,
          recommendedChangesetType: 'patch',
        },
      })

      const result = engine.decideBumpType(factors)

      expect(result.bumpType).toBe('minor') // Risk score exceeds patch threshold
    })
  })

  describe('grouped update logic', () => {
    it('should apply conservative grouped update handling', () => {
      const engine = new SemverBumpTypeDecisionEngine({
        organizationRules: {
          conservativeMode: false,
          preferMinorForMajor: false,
          groupedUpdateHandling: 'conservative',
          dependencyPatternRules: [],
        },
      })

      const factors = createMockFactors({
        isGroupedUpdate: true,
        dependencyCount: 5,
        semverImpact: {
          ...createMockFactors().semverImpact,
          recommendedChangesetType: 'major',
        },
      })

      const result = engine.decideBumpType(factors)

      expect(result.bumpType).toBe('minor') // Conservative grouped update downgrades major to minor
      expect(result.influencingFactors).toContain('grouped-update')
    })

    it('should apply majority grouped update handling', () => {
      const engine = new SemverBumpTypeDecisionEngine({
        organizationRules: {
          conservativeMode: false,
          preferMinorForMajor: false,
          groupedUpdateHandling: 'majority',
          dependencyPatternRules: [],
        },
      })

      const factors = createMockFactors({
        isGroupedUpdate: true,
        dependencyCount: 5,
        semverImpact: {
          ...createMockFactors().semverImpact,
          dependencies: [
            {
              name: 'pkg1',
              versionChange: 'patch',
              semverImpact: 'patch',
              isBreaking: false,
              isSecurityUpdate: false,
              isDowngrade: false,
              isPrerelease: false,
              confidence: 'high',
              reasoning: [],
            },
            {
              name: 'pkg2',
              versionChange: 'patch',
              semverImpact: 'patch',
              isBreaking: false,
              isSecurityUpdate: false,
              isDowngrade: false,
              isPrerelease: false,
              confidence: 'high',
              reasoning: [],
            },
            {
              name: 'pkg3',
              versionChange: 'minor',
              semverImpact: 'minor',
              isBreaking: false,
              isSecurityUpdate: false,
              isDowngrade: false,
              isPrerelease: false,
              confidence: 'high',
              reasoning: [],
            },
          ],
          recommendedChangesetType: 'minor',
        },
      })

      const result = engine.decideBumpType(factors)

      expect(result.bumpType).toBe('patch') // Majority of dependencies are patch
    })
  })

  describe('confidence calculation', () => {
    it('should have high confidence for simple cases', () => {
      const engine = new SemverBumpTypeDecisionEngine()
      const factors = createMockFactors()

      const result = engine.decideBumpType(factors)

      expect(result.confidence).toBe('high')
    })

    it('should have lower confidence for complex grouped updates', () => {
      const engine = new SemverBumpTypeDecisionEngine()
      const factors = createMockFactors({
        isGroupedUpdate: true,
        dependencyCount: 10,
        semverImpact: {
          ...createMockFactors().semverImpact,
          confidence: 'medium',
        },
      })

      const result = engine.decideBumpType(factors)

      expect(result.confidence).toBe('medium')
    })

    it('should have low confidence when impact assessment is uncertain', () => {
      const engine = new SemverBumpTypeDecisionEngine()
      const factors = createMockFactors({
        semverImpact: {
          ...createMockFactors().semverImpact,
          confidence: 'low',
        },
      })

      const result = engine.decideBumpType(factors)

      expect(result.confidence).toBe('low')
    })
  })

  describe('risk assessment', () => {
    it('should calculate appropriate risk levels', () => {
      const engine = new SemverBumpTypeDecisionEngine()
      const factors = createMockFactors({
        semverImpact: {
          ...createMockFactors().semverImpact,
          hasBreakingChanges: true,
          isSecurityUpdate: true,
          overallRiskScore: 15, // Lower base score to get medium after adjustments
        },
        isGroupedUpdate: true,
        dependencyCount: 3,
      })

      const result = engine.decideBumpType(factors)

      expect(result.riskAssessment.level).toBe('medium')
      expect(result.riskAssessment.factors).toContain('breaking changes detected')
      expect(result.riskAssessment.factors).toContain('security update')
      expect(result.riskAssessment.factors).toContain('grouped update')
      expect(result.riskAssessment.score).toBeGreaterThan(15)
    })
  })

  describe('reasoning and alternatives', () => {
    it('should provide clear reasoning for decisions', () => {
      const engine = new SemverBumpTypeDecisionEngine()
      const factors = createMockFactors({
        semverImpact: {
          ...createMockFactors().semverImpact,
          isSecurityUpdate: true,
        },
      })

      const result = engine.decideBumpType(factors)

      expect(result.primaryReason).toContain('security update')
      expect(result.reasoningChain.length).toBeGreaterThan(0)
      expect(result.reasoningChain[0]).toBe('Starting semver bump type decision analysis')
    })

    it('should generate alternatives when different analyzers disagree', () => {
      const engine = new SemverBumpTypeDecisionEngine()
      const factors = createMockFactors({
        semverImpact: {
          ...createMockFactors().semverImpact,
          recommendedChangesetType: 'patch',
        },
        categorization: {
          ...createMockFactors().categorization,
          recommendedChangesetType: 'minor',
        },
      })

      const result = engine.decideBumpType(factors)

      expect(result.alternatives.length).toBeGreaterThan(0)
      expect(result.alternatives.some(alt => alt.bumpType === 'patch')).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('should handle empty dependencies gracefully', () => {
      const engine = new SemverBumpTypeDecisionEngine()
      const factors = createMockFactors({
        dependencyCount: 0,
        semverImpact: {
          ...createMockFactors().semverImpact,
          dependencies: [],
        },
      })

      const result = engine.decideBumpType(factors)

      expect(result.bumpType).toBe('minor') // Falls back to categorization
      expect(result.confidence).toBeDefined()
    })

    it('should handle conflicting rules appropriately', () => {
      const engine = new SemverBumpTypeDecisionEngine({
        breakingChangesAlwaysMajor: true,
        managerSpecificRules: {
          'github-actions': {
            allowDowngrade: true,
            maxBumpType: 'minor',
            defaultBumpType: 'patch',
            majorAsMinor: true,
          },
        },
      })

      const factors = createMockFactors({
        manager: 'github-actions',
        semverImpact: {
          ...createMockFactors().semverImpact,
          hasBreakingChanges: true,
          recommendedChangesetType: 'major',
        },
      })

      const result = engine.decideBumpType(factors)

      // Breaking changes should force major, but manager rule should downgrade it
      expect(result.bumpType).toBe('minor')
      expect(result.overriddenRules.length).toBeGreaterThan(0)
    })
  })
})
