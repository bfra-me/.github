/**
 * Tests for the ChangesetSummaryGenerator
 *
 * @since 2025-09-05 (TASK-022)
 */

import type {CategorizationResult} from '../src/change-categorization-engine'
import type {RenovatePRContext} from '../src/renovate-parser'
import type {ImpactAssessment} from '../src/semver-impact-assessor'
import {beforeEach, describe, expect, it} from 'vitest'

import {ChangesetSummaryGenerator, DEFAULT_SUMMARY_CONFIG} from '../src/changeset-summary-generator'

describe('ChangesetSummaryGenerator', () => {
  let generator: ChangesetSummaryGenerator
  let mockPRContext: RenovatePRContext
  let mockImpactAssessment: ImpactAssessment
  let mockCategorizationResult: CategorizationResult

  beforeEach(() => {
    generator = new ChangesetSummaryGenerator()

    mockPRContext = {
      dependencies: [
        {
          name: 'test-package',
          currentVersion: '1.0.0',
          newVersion: '2.0.0',
          manager: 'npm',
          updateType: 'major',
          isSecurityUpdate: false,
          isGrouped: false,
        },
      ],
      isRenovateBot: true,
      branchName: 'renovate/test-package-2.x',
      prTitle: 'Update test-package to v2.0.0',
      prBody: '',
      commitMessages: ['chore(deps): update test-package to v2.0.0'],
      isGroupedUpdate: false,
      isSecurityUpdate: false,
      updateType: 'major',
      manager: 'npm',
      files: [{filename: 'package.json', status: 'modified', additions: 1, deletions: 1}],
    }

    mockImpactAssessment = {
      dependencies: [
        {
          name: 'test-package',
          currentVersion: '1.0.0',
          newVersion: '2.0.0',
          versionChange: 'major',
          semverImpact: 'major',
          isBreaking: false,
          isSecurityUpdate: false,
          isDowngrade: false,
          isPrerelease: false,
          confidence: 'high',
          reasoning: [],
        },
      ],
      overallImpact: 'major',
      recommendedChangesetType: 'major',
      isSecurityUpdate: false,
      hasBreakingChanges: false,
      hasDowngrades: false,
      hasPreleases: false,
      confidence: 'high',
      reasoning: [],
      totalVulnerabilities: 0,
      highSeverityVulnerabilities: 0,
      criticalBreakingChanges: 0,
      overallRiskScore: 50,
    }

    mockCategorizationResult = {
      dependencies: [],
      primaryCategory: 'major',
      allCategories: ['major'],
      categorizedGroups: {
        major: [],
        minor: [],
        patch: [],
        security: [],
      },
      summary: {
        totalDependencies: 1,
        majorUpdates: 1,
        minorUpdates: 0,
        patchUpdates: 0,
        securityUpdates: 0,
        breakingChanges: 0,
        highPriorityUpdates: 0,
        averageRiskLevel: 50,
      },
      confidence: 'high',
      recommendedChangesetType: 'major',
      reasoning: [],
    }
  })

  describe('default configuration', () => {
    it('should use default configuration values', () => {
      // @ts-expect-error - Accessing private property for testing
      expect(generator.config).toEqual(DEFAULT_SUMMARY_CONFIG)
    })

    it('should allow configuration override', () => {
      const customGenerator = new ChangesetSummaryGenerator({
        useEmojis: false,
        maxDependenciesToList: 10,
      })

      // @ts-expect-error - Accessing private property for testing
      expect(customGenerator.config.useEmojis).toBe(false)
      // @ts-expect-error - Accessing private property for testing
      expect(customGenerator.config.maxDependenciesToList).toBe(10)
      // @ts-expect-error - Accessing private property for testing
      expect(customGenerator.config.includeVersionDetails).toBe(
        DEFAULT_SUMMARY_CONFIG.includeVersionDetails,
      )
    })
  })

  describe('npm dependency summaries', () => {
    it('should generate basic npm dependency summary', () => {
      const summary = generator.generateSummary(
        mockPRContext,
        mockImpactAssessment,
        mockCategorizationResult,
        'npm',
        ['test-package'],
      )

      expect(summary).toContain('📦')
      expect(summary).toContain('Update npm dependency `test-package`')
      expect(summary).toContain('from `1.0.0` to `2.0.0`')
    })

    it('should generate security update summary for npm', () => {
      mockPRContext.isSecurityUpdate = true
      mockImpactAssessment.isSecurityUpdate = true
      mockImpactAssessment.totalVulnerabilities = 2
      mockImpactAssessment.highSeverityVulnerabilities = 1

      const summary = generator.generateSummary(
        mockPRContext,
        mockImpactAssessment,
        mockCategorizationResult,
        'npm',
        ['test-package'],
      )

      expect(summary).toContain('🔒')
      expect(summary).toContain('Security update for npm dependency')
      expect(summary).toContain('Addresses 2 vulnerabilities')
      expect(summary).toContain('(1 high severity)')
    })

    it('should generate grouped update summary for npm', () => {
      mockPRContext.isGroupedUpdate = true

      const summary = generator.generateSummary(
        mockPRContext,
        mockImpactAssessment,
        mockCategorizationResult,
        'npm',
        ['package-a', 'package-b', 'package-c'],
      )

      expect(summary).toContain('📦')
      expect(summary).toContain('Group update for npm dependencies')
      expect(summary).toContain('`package-a`, `package-b`, `package-c`')
    })

    it('should generate breaking change warnings for npm', () => {
      mockImpactAssessment.hasBreakingChanges = true

      const summary = generator.generateSummary(
        mockPRContext,
        mockImpactAssessment,
        mockCategorizationResult,
        'npm',
        ['test-package'],
      )

      expect(summary).toContain('⚠️ **Breaking Changes**')
      expect(summary).toContain('may require code modifications')
    })
  })

  describe('github-actions summaries', () => {
    beforeEach(() => {
      mockPRContext.manager = 'github-actions'
    })

    it('should generate GitHub Actions dependency summary', () => {
      const summary = generator.generateSummary(
        mockPRContext,
        mockImpactAssessment,
        mockCategorizationResult,
        'github-actions',
        ['actions/checkout'],
      )

      expect(summary).toContain('⚙️')
      expect(summary).toContain('Update GitHub Actions workflow dependency')
      expect(summary).toContain('`actions/checkout`')
    })

    it('should handle multiple GitHub Actions dependencies', () => {
      const summary = generator.generateSummary(
        mockPRContext,
        mockImpactAssessment,
        mockCategorizationResult,
        'github-actions',
        ['actions/checkout', 'actions/setup-node', 'actions/cache'],
      )

      expect(summary).toContain('Update GitHub Actions workflow dependencies')
      expect(summary).toContain('`actions/cache`, `actions/checkout`, `actions/setup-node`')
    })
  })

  describe('docker summaries', () => {
    beforeEach(() => {
      mockPRContext.manager = 'docker'
    })

    it('should generate Docker image summary', () => {
      const summary = generator.generateSummary(
        mockPRContext,
        mockImpactAssessment,
        mockCategorizationResult,
        'docker',
        ['node'],
      )

      expect(summary).toContain('🐳')
      expect(summary).toContain('Update Docker image `node`')
    })

    it('should handle multiple Docker images', () => {
      const summary = generator.generateSummary(
        mockPRContext,
        mockImpactAssessment,
        mockCategorizationResult,
        'docker',
        ['node', 'nginx', 'redis'],
      )

      expect(summary).toContain('Update Docker images')
      expect(summary).toContain('`nginx`, `node`, `redis`')
    })
  })

  describe('python dependency summaries', () => {
    beforeEach(() => {
      mockPRContext.manager = 'pip'
    })

    it('should generate pip dependency summary', () => {
      const summary = generator.generateSummary(
        mockPRContext,
        mockImpactAssessment,
        mockCategorizationResult,
        'pip',
        ['requests'],
      )

      expect(summary).toContain('🐍')
      expect(summary).toContain('Update pip dependency `requests`')
    })

    it('should handle pipenv manager', () => {
      mockPRContext.manager = 'pipenv'

      const summary = generator.generateSummary(
        mockPRContext,
        mockImpactAssessment,
        mockCategorizationResult,
        'pipenv',
        ['django'],
      )

      expect(summary).toContain('Update Pipenv dependency')
    })
  })

  describe('custom template handling', () => {
    it('should use custom template when provided', () => {
      const template = 'Custom: {updateType} {dependencies} {version}'

      const summary = generator.generateSummary(
        mockPRContext,
        mockImpactAssessment,
        mockCategorizationResult,
        'npm',
        ['test-package'],
        template,
      )

      expect(summary).toBe('Custom: npm test-package 2.0.0')
    })

    it('should interpolate all template variables', () => {
      const template =
        '{emoji} {updateType}: {dependencies} (risk: {riskLevel}, breaking: {hasBreakingChanges})'

      const summary = generator.generateSummary(
        mockPRContext,
        mockImpactAssessment,
        mockCategorizationResult,
        'npm',
        ['test-package'],
        template,
      )

      expect(summary).toBe('📦 npm: test-package (risk: medium, breaking: false)')
    })

    it('should handle backward compatibility with {version} placeholder', () => {
      const template = 'Update {dependencies} to {version}'

      const summary = generator.generateSummary(
        mockPRContext,
        mockImpactAssessment,
        mockCategorizationResult,
        'npm',
        ['test-package'],
        template,
      )

      expect(summary).toBe('Update test-package to 2.0.0')
    })
  })

  describe('configuration options', () => {
    it('should respect emoji configuration', () => {
      const noEmojiGenerator = new ChangesetSummaryGenerator({useEmojis: false})

      const summary = noEmojiGenerator.generateSummary(
        mockPRContext,
        mockImpactAssessment,
        mockCategorizationResult,
        'npm',
        ['test-package'],
      )

      expect(summary).not.toContain('📦')
      expect(summary).toContain('Update npm dependency')
    })

    it('should respect version details configuration', () => {
      const noVersionGenerator = new ChangesetSummaryGenerator({includeVersionDetails: false})

      const summary = noVersionGenerator.generateSummary(
        mockPRContext,
        mockImpactAssessment,
        mockCategorizationResult,
        'npm',
        ['test-package'],
      )

      expect(summary).not.toContain('from `1.0.0` to `2.0.0`')
      expect(summary).toContain('Update npm dependency `test-package`')
    })

    it('should respect dependency sorting configuration', () => {
      const sortedGenerator = new ChangesetSummaryGenerator({sortDependencies: true})

      const summary = sortedGenerator.generateSummary(
        mockPRContext,
        mockImpactAssessment,
        mockCategorizationResult,
        'npm',
        ['zebra', 'alpha', 'beta'],
      )

      expect(summary).toContain('`alpha`, `beta`, `zebra`')
    })

    it('should respect max dependencies to list configuration', () => {
      const limitedGenerator = new ChangesetSummaryGenerator({maxDependenciesToList: 2})

      const summary = limitedGenerator.generateSummary(
        mockPRContext,
        mockImpactAssessment,
        mockCategorizationResult,
        'npm',
        ['package-a', 'package-b', 'package-c'],
      )

      expect(summary).toContain('Update 3 npm dependencies')
      expect(summary).not.toContain('`package-a`, `package-b`, `package-c`')
    })

    it('should disable breaking change warnings when configured', () => {
      const noWarningsGenerator = new ChangesetSummaryGenerator({
        includeBreakingChangeWarnings: false,
      })
      mockImpactAssessment.hasBreakingChanges = true

      const summary = noWarningsGenerator.generateSummary(
        mockPRContext,
        mockImpactAssessment,
        mockCategorizationResult,
        'npm',
        ['test-package'],
      )

      expect(summary).not.toContain('⚠️ **Breaking Changes**')
    })
  })

  describe('fallback behavior', () => {
    it('should handle unknown managers gracefully', () => {
      // @ts-expect-error - Testing unknown manager
      mockPRContext.manager = 'unknown-manager'

      const summary = generator.generateSummary(
        mockPRContext,
        mockImpactAssessment,
        mockCategorizationResult,
        'unknown-manager',
        ['some-package'],
      )

      expect(summary).toContain('📋')
      expect(summary).toContain('Update unknown-manager dependency')
    })

    it('should handle empty dependency lists', () => {
      const summary = generator.generateSummary(
        mockPRContext,
        mockImpactAssessment,
        mockCategorizationResult,
        'npm',
        [],
      )

      expect(summary).toBe('📦 Update npm dependencies')
    })

    it('should handle missing version information gracefully', () => {
      mockPRContext.dependencies[0].currentVersion = undefined
      mockPRContext.dependencies[0].newVersion = undefined

      const summary = generator.generateSummary(
        mockPRContext,
        mockImpactAssessment,
        mockCategorizationResult,
        'npm',
        ['test-package'],
      )

      expect(summary).toContain('Update npm dependency `test-package`')
      expect(summary).not.toContain('from')
      expect(summary).not.toContain('to')
    })
  })
})
