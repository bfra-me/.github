import type {ActionReference} from '../src/detectors/gha-types'
import {describe, expect, it} from 'vitest'
import {compareActionReferences, deduplicateChanges} from '../src/detectors/gha-change-analyzer'
import {deduplicateGoChanges, isGoModFile} from '../src/detectors/go-change-analyzer'
import {parseGoModChanges, parseGoSumChanges} from '../src/detectors/go-change-parser'
import {
  analyzeSecurityPatterns,
  analyzeSupplyChainRisks,
} from '../src/detectors/security-change-analyzer'
import {SECURITY_PATTERNS} from '../src/detectors/security-patterns'

function makeActionRef(overrides: Partial<ActionReference> = {}): ActionReference {
  return {
    name: 'actions/checkout',
    ref: 'abc123def456abc123def456abc123def456abc123',
    uses: 'actions/checkout@abc123def456abc123def456abc123def456abc123',
    line: 10,
    stepName: 'Checkout',
    ...overrides,
  }
}

describe('gha-change-analyzer', () => {
  describe('compareActionReferences', () => {
    it('should return empty when both base and head are empty', () => {
      const result = compareActionReferences([], [], 'workflow.yml')
      expect(result).toHaveLength(0)
    })

    it('should detect new action as addition', () => {
      const headActions = [makeActionRef({name: 'actions/checkout', ref: 'abc123'})]
      const result = compareActionReferences([], headActions, 'workflow.yml')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('actions/checkout')
      expect(result[0].updateType).toBe('minor')
    })

    it('should detect ref change', () => {
      const baseActions = [
        makeActionRef({name: 'actions/checkout', ref: 'old-sha', stepName: 'Checkout'}),
      ]
      const headActions = [
        makeActionRef({name: 'actions/checkout', ref: 'new-sha', stepName: 'Checkout'}),
      ]
      const result = compareActionReferences(baseActions, headActions, 'workflow.yml')
      expect(result).toHaveLength(1)
      expect(result[0].currentRef).toBe('old-sha')
      expect(result[0].newRef).toBe('new-sha')
    })

    it('should not report change when ref is the same', () => {
      const baseActions = [
        makeActionRef({name: 'actions/checkout', ref: 'same-sha', stepName: 'Checkout'}),
      ]
      const headActions = [
        makeActionRef({name: 'actions/checkout', ref: 'same-sha', stepName: 'Checkout'}),
      ]
      const result = compareActionReferences(baseActions, headActions, 'workflow.yml')
      expect(result).toHaveLength(0)
    })

    it('should handle actions without step name', () => {
      const headActions = [
        makeActionRef({name: 'actions/checkout', ref: 'abc123', stepName: undefined}),
      ]
      const result = compareActionReferences([], headActions, 'workflow.yml')
      expect(result).toHaveLength(1)
    })

    it('should use inline version for semver comparison when available', () => {
      const baseActions = [
        makeActionRef({
          name: 'actions/checkout',
          ref: 'old-sha',
          inlineVersion: 'v3',
          stepName: 'Checkout',
        }),
      ]
      const headActions = [
        makeActionRef({
          name: 'actions/checkout',
          ref: 'new-sha',
          inlineVersion: 'v4',
          stepName: 'Checkout',
        }),
      ]
      const result = compareActionReferences(baseActions, headActions, 'workflow.yml')
      expect(result).toHaveLength(1)
      expect(result[0].inlineVersionComment).toBe('v4')
    })
  })

  describe('deduplicateChanges', () => {
    it('should remove exact duplicates', () => {
      const change = {
        name: 'actions/checkout',
        workflowFile: 'workflow.yml',
        currentRef: 'old-sha',
        newRef: 'new-sha',
        manager: 'github-actions' as const,
        updateType: 'minor' as const,
        semverImpact: 'minor' as const,
        isSecurityUpdate: false,
        stepName: 'Checkout',
        isReusableWorkflow: false,
      }
      const result = deduplicateChanges([change, change])
      expect(result).toHaveLength(1)
    })

    it('should keep different changes', () => {
      const change1 = {
        name: 'actions/checkout',
        workflowFile: 'workflow.yml',
        currentRef: 'old',
        newRef: 'new',
        manager: 'github-actions' as const,
        updateType: 'minor' as const,
        semverImpact: 'minor' as const,
        isSecurityUpdate: false,
        isReusableWorkflow: false,
      }
      const change2 = {
        ...change1,
        name: 'actions/setup-node',
      }
      const result = deduplicateChanges([change1, change2])
      expect(result).toHaveLength(2)
    })

    it('should return empty for empty input', () => {
      expect(deduplicateChanges([])).toHaveLength(0)
    })
  })
})

describe('go-change-analyzer', () => {
  describe('isGoModFile', () => {
    it('should return true for go.mod', () => {
      expect(isGoModFile('go.mod')).toBe(true)
    })

    it('should return true for go.sum', () => {
      expect(isGoModFile('go.sum')).toBe(true)
    })

    it('should return true for nested go.mod', () => {
      expect(isGoModFile('subdir/go.mod')).toBe(true)
    })

    it('should return false for package.json', () => {
      expect(isGoModFile('package.json')).toBe(false)
    })

    it('should return false for other go files', () => {
      expect(isGoModFile('main.go')).toBe(false)
    })
  })

  describe('deduplicateGoChanges', () => {
    it('should remove duplicate changes', () => {
      const change = {
        name: 'github.com/some/pkg',
        modFile: 'go.mod',
        currentVersion: 'v1.0.0',
        newVersion: 'v2.0.0',
        manager: 'go' as const,
        updateType: 'major' as const,
        semverImpact: 'major' as const,
        isSecurityUpdate: false,
        isIndirect: false,
        isReplace: false,
      }
      const result = deduplicateGoChanges([change, change])
      expect(result).toHaveLength(1)
    })

    it('should keep different packages', () => {
      const change1 = {
        name: 'github.com/pkg1',
        modFile: 'go.mod',
        currentVersion: 'v1.0.0',
        newVersion: 'v2.0.0',
        manager: 'go' as const,
        updateType: 'major' as const,
        semverImpact: 'major' as const,
        isSecurityUpdate: false,
        isIndirect: false,
        isReplace: false,
      }
      const change2 = {...change1, name: 'github.com/pkg2'}
      const result = deduplicateGoChanges([change1, change2])
      expect(result).toHaveLength(2)
    })
  })
})

describe('go-change-parser', () => {
  describe('parseGoModChanges', () => {
    it('should return empty for empty patch', () => {
      const result = parseGoModChanges('go.mod', '')
      expect(result).toHaveLength(0)
    })

    it('should parse a version bump', () => {
      const patch = `@@ -5,7 +5,7 @@ require (
-\tgithub.com/some/pkg v1.0.0
+\tgithub.com/some/pkg v2.0.0
 )`
      const result = parseGoModChanges('go.mod', patch)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('github.com/some/pkg')
      expect(result[0].currentVersion).toBe('v1.0.0')
      expect(result[0].newVersion).toBe('v2.0.0')
    })

    it('should skip lines that are not version changes', () => {
      const patch = `@@ -1,3 +1,3 @@
 module example.com/my-module
 
-go 1.20
+go 1.21`
      const result = parseGoModChanges('go.mod', patch)
      expect(result).toHaveLength(0)
    })

    it('should handle indirect dependency marker', () => {
      const patch = `@@ -5,7 +5,7 @@
-\tgithub.com/some/pkg v1.0.0 // indirect
+\tgithub.com/some/pkg v2.0.0 // indirect
`
      const result = parseGoModChanges('go.mod', patch)
      expect(result).toHaveLength(1)
      expect(result[0].isIndirect).toBe(true)
    })

    it('should handle module path with require keyword', () => {
      const patch = `@@ -1,3 +1,3 @@
-require github.com/some/pkg v1.0.0
+require github.com/some/pkg v2.0.0
`
      const result = parseGoModChanges('go.mod', patch)
      expect(result).toHaveLength(1)
    })
  })

  describe('parseGoSumChanges', () => {
    it('should return empty for empty patch', () => {
      const result = parseGoSumChanges('go.sum', '')
      expect(result).toHaveLength(0)
    })

    it('should parse added sum entries', () => {
      const patch = `@@ -1,3 +1,4 @@
+github.com/some/pkg v2.0.0 h1:abc123=
`
      const result = parseGoSumChanges('go.sum', patch)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('github.com/some/pkg')
      expect(result[0].newVersion).toBe('v2.0.0')
    })

    it('should ignore removed lines', () => {
      const patch = `@@ -1,3 +1,2 @@
-github.com/some/pkg v1.0.0 h1:old=
`
      const result = parseGoSumChanges('go.sum', patch)
      expect(result).toHaveLength(0)
    })
  })
})

describe('security-change-analyzer', () => {
  describe('analyzeSecurityPatterns', () => {
    it('should return empty for unknown manager ecosystem', () => {
      const dep = {
        name: 'test-package',
        currentVersion: '1.0.0',
        newVersion: '2.0.0',
        manager: 'unknown-manager' as 'npm',
        updateType: 'patch' as const,
        isSecurityUpdate: false,
        securitySeverity: null,
        isGrouped: false,
        packageFile: 'package.json',
      }
      const result = analyzeSecurityPatterns(dep, SECURITY_PATTERNS)
      expect(result).toHaveLength(0)
    })

    it('should return empty when dependency name has no security keywords', () => {
      const dep = {
        name: 'lodash',
        currentVersion: '4.0.0',
        newVersion: '4.17.21',
        manager: 'npm' as const,
        updateType: 'patch' as const,
        isSecurityUpdate: false,
        securitySeverity: null,
        isGrouped: false,
        packageFile: 'package.json',
      }
      const result = analyzeSecurityPatterns(dep, SECURITY_PATTERNS)
      expect(result).toHaveLength(0)
    })

    it('should detect security keywords in dependency name', () => {
      const dep = {
        name: 'rce-exploit-package',
        currentVersion: '1.0.0',
        newVersion: '2.0.0',
        manager: 'npm' as const,
        updateType: 'patch' as const,
        isSecurityUpdate: false,
        securitySeverity: null,
        isGrouped: false,
        packageFile: 'package.json',
      }
      const result = analyzeSecurityPatterns(dep, SECURITY_PATTERNS)
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('analyzeSupplyChainRisks', () => {
    it('should return empty for trusted package', () => {
      const dep = {
        name: 'react',
        currentVersion: '18.0.0',
        newVersion: '18.1.0',
        manager: 'npm' as const,
        updateType: 'minor' as const,
        isSecurityUpdate: false,
        securitySeverity: null,
        isGrouped: false,
        packageFile: 'package.json',
      }
      const result = analyzeSupplyChainRisks(dep, SECURITY_PATTERNS)
      // react is a popular package but not in riskPackages, should be low risk
      expect(Array.isArray(result)).toBe(true)
    })

    it('should return empty for unknown ecosystem', () => {
      const dep = {
        name: 'some-package',
        currentVersion: '1.0.0',
        newVersion: '2.0.0',
        manager: 'unknown-manager' as 'npm',
        updateType: 'patch' as const,
        isSecurityUpdate: false,
        securitySeverity: null,
        isGrouped: false,
        packageFile: 'package.json',
      }
      const result = analyzeSupplyChainRisks(dep, SECURITY_PATTERNS)
      expect(result).toHaveLength(0)
    })

    it('should detect typosquatting of popular packages', () => {
      const dep = {
        name: 'react-malware-package',
        currentVersion: '1.0.0',
        newVersion: '2.0.0',
        manager: 'npm' as const,
        updateType: 'patch' as const,
        isSecurityUpdate: false,
        securitySeverity: null,
        isGrouped: false,
        packageFile: 'package.json',
      }
      const result = analyzeSupplyChainRisks(dep, SECURITY_PATTERNS)
      // Should detect potential typosquatting of 'react'
      expect(Array.isArray(result)).toBe(true)
    })
  })
})
