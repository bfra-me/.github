import type {RenovateDependency} from '../src/renovate-parser'
import {describe, expect, it} from 'vitest'
import {BreakingChangeDetector} from '../src/breaking-change-detector'

describe('BreakingChangeDetector', () => {
  const detector = new BreakingChangeDetector()

  const createMockDependency = (
    name: string,
    currentVersion: string,
    newVersion: string,
    manager: RenovateDependency['manager'] = 'npm',
  ): RenovateDependency => ({
    name,
    currentVersion,
    newVersion,
    manager,
    updateType: 'patch',
    isSecurityUpdate: false,
    isGrouped: false,
  })

  describe('core functionality', () => {
    it('should detect major version breaking changes', async () => {
      const dependency = createMockDependency('react', '17.0.0', '18.0.0')

      const analysis = await detector.analyzeBreakingChanges(dependency)

      expect(analysis.hasBreakingChanges).toBe(true)
      expect(analysis.indicators.length).toBeGreaterThan(0)
      expect(analysis.indicators.some(i => i.type === 'major_version')).toBe(true)
    })

    it('should not detect breaking changes for patch updates', async () => {
      const dependency = createMockDependency('lodash', '4.17.20', '4.17.21')

      const analysis = await detector.analyzeBreakingChanges(dependency)

      expect(analysis.hasBreakingChanges).toBe(false)
      expect(analysis.recommendedAction).toBe('proceed')
    })

    it('should detect 0.x.x minor version as breaking', async () => {
      const dependency = createMockDependency('experimental-lib', '0.1.0', '0.2.0')

      const analysis = await detector.analyzeBreakingChanges(dependency)

      expect(analysis.hasBreakingChanges).toBe(true)
      expect(analysis.indicators.some(i => i.type === 'major_version')).toBe(true)
    })

    it('should detect React ecosystem changes', async () => {
      const dependency = createMockDependency('react', '17.0.1', '17.1.0')

      const analysis = await detector.analyzeBreakingChanges(dependency)

      expect(analysis.hasBreakingChanges).toBe(true)
      expect(analysis.indicators.some(i => i.type === 'ecosystem_specific')).toBe(true)
    })

    it('should return valid confidence levels', async () => {
      const dependency = createMockDependency('react', '17.0.0', '18.0.0')

      const analysis = await detector.analyzeBreakingChanges(dependency)

      expect(['low', 'medium', 'high']).toContain(analysis.confidence)
    })

    it('should return valid recommended actions', async () => {
      const dependency = createMockDependency('react', '17.0.0', '18.0.0')

      const analysis = await detector.analyzeBreakingChanges(dependency)

      expect(['proceed', 'manual_testing', 'block']).toContain(analysis.recommendedAction)
    })

    it('should provide meaningful reasoning', async () => {
      const dependency = createMockDependency('react', '17.0.0', '18.0.0')

      const analysis = await detector.analyzeBreakingChanges(dependency)

      expect(Array.isArray(analysis.reasoning)).toBe(true)
      expect(analysis.reasoning.length).toBeGreaterThan(0)
      expect(analysis.reasoning.some(r => typeof r === 'string' && r.length > 0)).toBe(true)
    })

    it('should handle invalid versions gracefully', async () => {
      const dependency = createMockDependency('invalid', 'not-a-version', 'also-not-version')

      const analysis = await detector.analyzeBreakingChanges(dependency)

      expect(analysis.hasBreakingChanges).toBe(false)
      expect(analysis.reasoning).toContain('No breaking change indicators detected')
    })

    it('should work with different package managers', async () => {
      const dockerDep = createMockDependency('node', '18-alpine', '20-alpine', 'docker')
      const actionsDep = createMockDependency('actions/checkout', 'v3', 'v4', 'github-actions')

      const dockerAnalysis = await detector.analyzeBreakingChanges(dockerDep)
      const actionsAnalysis = await detector.analyzeBreakingChanges(actionsDep)

      expect(dockerAnalysis).toBeDefined()
      expect(actionsAnalysis).toBeDefined()
      expect(typeof dockerAnalysis.hasBreakingChanges).toBe('boolean')
      expect(typeof actionsAnalysis.hasBreakingChanges).toBe('boolean')
    })
  })
})
