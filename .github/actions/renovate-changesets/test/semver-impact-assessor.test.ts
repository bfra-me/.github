import type {RenovateDependency} from '../src/renovate-parser'

import {describe, expect, it} from 'vitest'
import {assessImpact} from '../src/semver-impact-assessor'

describe('SemverImpactAssessor', () => {
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

  const assessDependencyImpact = (
    dependency: RenovateDependency,
    options?: Parameters<typeof assessImpact>[1],
  ) => {
    const result = assessImpact([dependency], options)
    const dependencyImpact = result.dependencies[0]
    if (!dependencyImpact) {
      throw new Error('Expected dependency impact result')
    }

    return dependencyImpact
  }

  describe('version parsing', () => {
    it('should parse valid semantic versions', () => {
      const dependency = createMockDependency('test-pkg', '1.2.3', '1.2.4')

      const result = assessDependencyImpact(dependency)

      expect(result.versionChange).toBe('patch')
      expect(result.semverImpact).toBe('patch')
      expect(result.confidence).toBe('high')
    })

    it('should parse versions with prefixes', () => {
      const dependency = createMockDependency('test-pkg', 'v1.2.3', '^1.3.0')

      const result = assessDependencyImpact(dependency)

      expect(result.versionChange).toBe('minor')
      expect(result.semverImpact).toBe('minor')
    })

    it('should handle prerelease versions', () => {
      const dependency = createMockDependency('test-pkg', '1.2.3', '1.3.0-alpha.1')

      const result = assessDependencyImpact(dependency)

      expect(result.isPrerelease).toBe(true)
      expect(result.confidence).toBe('medium')
    })

    it('should handle invalid versions gracefully', () => {
      const dependency = createMockDependency('test-pkg', 'invalid', 'also-invalid')

      const result = assessDependencyImpact(dependency)

      expect(result.versionChange).toBe('unknown')
      expect(result.confidence).toBe('low')
    })

    it('should handle missing versions', () => {
      const dependency = createMockDependency('test-pkg')

      const result = assessDependencyImpact(dependency)

      expect(result.versionChange).toBe('unknown')
      expect(result.confidence).toBe('low')
    })
  })

  describe('semver impact calculation', () => {
    it('should correctly identify major version changes', () => {
      const dependency = createMockDependency('test-pkg', '1.2.3', '2.0.0')

      const result = assessDependencyImpact(dependency)

      expect(result.versionChange).toBe('major')
      expect(result.semverImpact).toBe('major')
      expect(result.isBreaking).toBe(true)
    })

    it('should correctly identify minor version changes', () => {
      const dependency = createMockDependency('test-pkg', '1.2.3', '1.3.0')

      const result = assessDependencyImpact(dependency)

      expect(result.versionChange).toBe('minor')
      expect(result.semverImpact).toBe('minor')
      expect(result.isBreaking).toBe(false)
    })

    it('should correctly identify patch version changes', () => {
      const dependency = createMockDependency('test-pkg', '1.2.3', '1.2.4')

      const result = assessDependencyImpact(dependency)

      expect(result.versionChange).toBe('patch')
      expect(result.semverImpact).toBe('patch')
      expect(result.isBreaking).toBe(false)
    })

    it('should handle 0.x.x versions as potentially breaking for minor changes', () => {
      const dependency = createMockDependency('test-pkg', '0.2.3', '0.3.0')

      const result = assessDependencyImpact(dependency)

      expect(result.versionChange).toBe('minor')
      expect(result.semverImpact).toBe('minor')
      expect(result.isBreaking).toBe(true) // 0.x.x minor changes are breaking
      expect(result.confidence).toBe('medium') // Lower confidence for 0.x.x
    })

    it('should handle 0.x.x major version bump correctly', () => {
      const dependency = createMockDependency('test-pkg', '0.9.0', '1.0.0')

      const result = assessDependencyImpact(dependency)

      expect(result.versionChange).toBe('major')
      expect(result.semverImpact).toBe('major')
      expect(result.isBreaking).toBe(true)
    })
  })

  describe('security update handling', () => {
    it('should handle security updates appropriately', () => {
      const dependency = createMockDependency('test-pkg', '1.2.3', '1.2.4', {
        isSecurityUpdate: true,
        securitySeverity: 'high',
      })

      const result = assessDependencyImpact(dependency)

      expect(result.isSecurityUpdate).toBe(true)
      expect(result.securitySeverity).toBe('high')
      expect(result.semverImpact).toBe('patch') // Security updates at least patch
      expect(result.confidence).toBe('high') // High confidence for security updates
    })

    it('should upgrade patch to minor for critical security updates', () => {
      const dependency = createMockDependency('test-pkg', '1.2.3', '1.2.4', {
        isSecurityUpdate: true,
        securitySeverity: 'critical',
      })

      const result = assessDependencyImpact(dependency)

      expect(result.semverImpact).toBe('minor') // Critical security upgrades to minor
    })

    it('should respect security minimum patch setting', () => {
      const dependency = createMockDependency('test-pkg', '1.2.3', '1.2.4', {
        isSecurityUpdate: true,
      })

      const result = assessDependencyImpact(dependency, {securityMinimumPatch: false})

      expect(result.semverImpact).toBe('patch') // Would still be patch without special handling
    })
  })

  describe('breaking change detection', () => {
    it('should detect major version changes as breaking', () => {
      const dependency = createMockDependency('test-pkg', '1.9.9', '2.0.0')

      const result = assessDependencyImpact(dependency)

      expect(result.isBreaking).toBe(true)
    })

    it('should detect replacement updates as breaking', () => {
      const dependency = createMockDependency('test-pkg', '1.2.3', '1.3.0', {
        updateType: 'replacement',
      })

      const result = assessDependencyImpact(dependency)

      expect(result.isBreaking).toBe(true)
    })

    it('should respect majorAsBreaking option', () => {
      const dependency = createMockDependency('test-pkg', '1.9.9', '2.0.0')

      const result = assessDependencyImpact(dependency, {majorAsBreaking: false})

      expect(result.isBreaking).toBe(false)
    })
  })

  describe('downgrade detection', () => {
    it('should detect version downgrades', () => {
      const dependency = createMockDependency('test-pkg', '2.0.0', '1.9.9')

      const result = assessDependencyImpact(dependency)

      expect(result.isDowngrade).toBe(true)
      expect(result.reasoning).toContain('Version downgrade detected - requires careful review')
    })

    it('should not detect upgrades as downgrades', () => {
      const dependency = createMockDependency('test-pkg', '1.9.9', '2.0.0')

      const result = assessDependencyImpact(dependency)

      expect(result.isDowngrade).toBe(false)
    })
  })

  describe('prerelease handling', () => {
    it('should detect prerelease versions', () => {
      const dependency = createMockDependency('test-pkg', '1.2.3', '1.3.0-beta.1')

      const result = assessDependencyImpact(dependency)

      expect(result.isPrerelease).toBe(true)
      expect(result.confidence).toBe('medium') // Lower confidence for prereleases
    })

    it('should handle prerelease to stable transitions', () => {
      const dependency = createMockDependency('test-pkg', '1.3.0-beta.1', '1.3.0')

      const result = assessDependencyImpact(dependency)

      expect(result.versionChange).toBe('prerelease')
      expect(result.semverImpact).toBe('patch') // Graduating from prerelease
    })

    it('should handle stable to prerelease transitions', () => {
      const dependency = createMockDependency('test-pkg', '1.2.0', '1.3.0-alpha.1')

      const result = assessDependencyImpact(dependency)

      expect(result.versionChange).toBe('minor') // Minor version changed 2->3
      expect(result.semverImpact).toBe('minor') // Minor version change to prerelease
    })
  })

  describe('manager-specific rules', () => {
    it('should apply manager-specific default impacts', () => {
      const dependency = createMockDependency('test-pkg', '1.2.3', '2.0.0', {
        manager: 'npm',
      })

      const result = assessDependencyImpact(dependency, {
        managerRules: {
          npm: {
            defaultImpact: 'minor',
          },
        },
      })

      // Should still be major because we only downgrade, never upgrade
      expect(result.semverImpact).toBe('major')
    })

    it('should downgrade impact based on manager rules', () => {
      const dependency = createMockDependency('action-name', '1.2.3', '1.3.0', {
        manager: 'github-actions',
      })

      const result = assessDependencyImpact(dependency, {
        managerRules: {
          'github-actions': {
            defaultImpact: 'patch',
          },
        },
      })

      expect(result.semverImpact).toBe('patch') // Downgraded from minor to patch
    })
  })

  describe('overall impact assessment', () => {
    it('should calculate overall impact from multiple dependencies', () => {
      const dependencies = [
        createMockDependency('pkg1', '1.2.3', '1.2.4'), // patch
        createMockDependency('pkg2', '2.0.0', '2.1.0'), // minor
        createMockDependency('pkg3', '3.0.0', '3.0.1'), // patch
      ]

      const result = assessImpact(dependencies)

      expect(result.overallImpact).toBe('minor') // Highest impact wins
      expect(result.recommendedChangesetType).toBe('minor')
      expect(result.dependencies).toHaveLength(3)
    })

    it('should detect security updates in overall assessment', () => {
      const dependencies = [
        createMockDependency('pkg1', '1.2.3', '1.2.4'),
        createMockDependency('pkg2', '2.0.0', '2.0.1', {
          isSecurityUpdate: true,
          securitySeverity: 'high',
        }),
      ]

      const result = assessImpact(dependencies)

      expect(result.isSecurityUpdate).toBe(true)
      expect(result.reasoning).toContain('1 security update(s) detected')
    })

    it('should detect breaking changes in overall assessment', () => {
      const dependencies = [
        createMockDependency('pkg1', '1.2.3', '1.2.4'),
        createMockDependency('pkg2', '2.0.0', '3.0.0'), // major/breaking
      ]

      const result = assessImpact(dependencies)

      expect(result.hasBreakingChanges).toBe(true)
      expect(result.reasoning).toContain('1 potentially breaking change(s)')
    })

    it('should calculate minimum confidence level', () => {
      const dependencies = [
        createMockDependency('pkg1', '1.2.3', '1.2.4'), // high confidence
        createMockDependency('pkg2', 'invalid', 'also-invalid'), // low confidence
      ]

      const result = assessImpact(dependencies)

      expect(result.confidence).toBe('low') // Minimum confidence level
    })

    it('should handle empty dependency list', () => {
      const result = assessImpact([])

      expect(result.overallImpact).toBe('patch') // Default
      expect(result.dependencies).toHaveLength(0)
      expect(result.reasoning).toContain('No dependencies to assess')
    })
  })

  describe('reasoning generation', () => {
    it('should provide clear reasoning for major updates', () => {
      const dependency = createMockDependency('test-pkg', '1.9.9', '2.0.0')

      const result = assessDependencyImpact(dependency)

      expect(result.reasoning).toContain('Major version update from 1.9.9 to 2.0.0')
      expect(result.reasoning).toContain('Potentially breaking change detected')
      expect(result.reasoning).toContain('Assessed as major level change for changeset')
    })

    it('should provide reasoning for security updates', () => {
      const dependency = createMockDependency('test-pkg', '1.2.3', '1.2.4', {
        isSecurityUpdate: true,
        securitySeverity: 'critical',
      })

      const result = assessDependencyImpact(dependency)

      expect(result.reasoning).toContain('Security update with critical severity')
    })

    it('should provide reasoning for prerelease versions', () => {
      const dependency = createMockDependency('test-pkg', '1.2.3', '1.3.0-alpha')

      const result = assessDependencyImpact(dependency)

      expect(result.reasoning).toContain('Involves prerelease versions - may be unstable')
    })

    it('should provide reasoning for downgrades', () => {
      const dependency = createMockDependency('test-pkg', '2.0.0', '1.9.9')

      const result = assessDependencyImpact(dependency)

      expect(result.reasoning).toContain('Version downgrade detected - requires careful review')
    })
  })

  describe('configuration options', () => {
    it('should use custom default changeset type', () => {
      const dependency = createMockDependency('test-pkg', 'invalid', 'invalid')

      const result = assessDependencyImpact(dependency, {
        defaultChangesetType: 'minor',
      })

      expect(result.semverImpact).toBe('minor')
    })

    it('should handle prerelease impact setting', () => {
      const dependency = createMockDependency('test-pkg', '1.2.0', '1.3.0-alpha')

      const result = assessDependencyImpact(dependency, {
        prereleaseAsLowerImpact: false,
      })

      // With prereleaseAsLowerImpact: false, stable to prerelease should be minor
      expect(result.semverImpact).toBe('minor')
    })
  })

  describe('edge cases', () => {
    it('should handle no version change gracefully', () => {
      const dependency = createMockDependency('test-pkg', '1.2.3', '1.2.3')

      const result = assessDependencyImpact(dependency)

      expect(result.versionChange).toBe('none')
      expect(result.semverImpact).toBe('patch') // Even no change might warrant a patch
    })

    it('should handle complex prerelease version comparisons', () => {
      const dependency = createMockDependency('test-pkg', '1.0.0-alpha', '1.0.0-beta')

      const result = assessDependencyImpact(dependency)

      expect(result.versionChange).toBe('prerelease')
      expect(result.isPrerelease).toBe(true)
    })

    it('should handle partial version strings', () => {
      const dependency = createMockDependency('test-pkg', '1.2', '1.3')

      const result = assessDependencyImpact(dependency)

      expect(result.versionChange).toBe('minor')
      expect(result.semverImpact).toBe('minor')
    })
  })
})
