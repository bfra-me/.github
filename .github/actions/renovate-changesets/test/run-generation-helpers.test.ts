import type {WorkspacePackage} from '../src/multi-package-analyzer'
import {describe, expect, it} from 'vitest'
import {getRootPackageName} from '../src/run-generation-helpers'

function makePackage(overrides: Partial<WorkspacePackage>): WorkspacePackage {
  return {
    name: 'pkg',
    path: 'packages/pkg',
    packageJsonPath: '/repo/packages/pkg/package.json',
    version: '0.0.0',
    dependencies: {},
    devDependencies: {},
    peerDependencies: {},
    optionalDependencies: {},
    private: false,
    ...overrides,
  }
}

describe('getRootPackageName', () => {
  describe('without targetPackage override', () => {
    it('returns the workspace root when it is non-private', () => {
      const packages: WorkspacePackage[] = [
        makePackage({name: '@scope/root', path: '.', private: false}),
        makePackage({name: '@scope/cli', path: 'packages/cli', private: false}),
      ]

      expect(getRootPackageName(packages, 'fallback')).toBe('@scope/root')
    })

    it('returns the first non-private workspace member when the root is private (issue #2012)', () => {
      const packages: WorkspacePackage[] = [
        makePackage({name: '@scope/repo-workspace', path: '.', private: true}),
        makePackage({name: '@scope/keeweb', path: 'apps/keeweb', private: true}),
        makePackage({name: '@scope/cli', path: 'packages/cli', private: false}),
      ]

      expect(getRootPackageName(packages, 'fallback')).toBe('@scope/cli')
    })

    it('returns the first non-private package even when no root entry exists', () => {
      const packages: WorkspacePackage[] = [
        makePackage({name: '@scope/app', path: 'apps/app', private: true}),
        makePackage({name: '@scope/lib', path: 'packages/lib', private: false}),
      ]

      expect(getRootPackageName(packages, 'fallback')).toBe('@scope/lib')
    })

    it('returns the fallback when all workspace packages are private', () => {
      const packages: WorkspacePackage[] = [
        makePackage({name: '@scope/repo-workspace', path: '.', private: true}),
        makePackage({name: '@scope/internal', path: 'packages/internal', private: true}),
      ]

      expect(getRootPackageName(packages, 'owner/repo')).toBe('owner/repo')
    })

    it('returns the fallback when no workspace packages are discovered', () => {
      expect(getRootPackageName([], 'owner/repo')).toBe('owner/repo')
    })

    it('treats empty path string as the root', () => {
      const packages: WorkspacePackage[] = [
        makePackage({name: '@scope/root', path: '', private: false}),
      ]

      expect(getRootPackageName(packages, 'fallback')).toBe('@scope/root')
    })
  })

  describe('with targetPackage override', () => {
    it('returns the override when it matches a discovered package', () => {
      const packages: WorkspacePackage[] = [
        makePackage({name: '@scope/repo-workspace', path: '.', private: true}),
        makePackage({name: '@scope/cli', path: 'packages/cli', private: false}),
        makePackage({name: '@scope/sdk', path: 'packages/sdk', private: false}),
      ]

      expect(getRootPackageName(packages, 'fallback', '@scope/sdk')).toBe('@scope/sdk')
    })

    it('returns the override even when discovery missed the package', () => {
      const packages: WorkspacePackage[] = [
        makePackage({name: '@scope/repo-workspace', path: '.', private: true}),
      ]

      expect(getRootPackageName(packages, 'fallback', '@scope/published')).toBe('@scope/published')
    })

    it('ignores empty-string override and falls back to the default resolution', () => {
      const packages: WorkspacePackage[] = [
        makePackage({name: '@scope/repo-workspace', path: '.', private: true}),
        makePackage({name: '@scope/cli', path: 'packages/cli', private: false}),
      ]

      expect(getRootPackageName(packages, 'fallback', '')).toBe('@scope/cli')
    })

    it('takes precedence over a non-private root', () => {
      const packages: WorkspacePackage[] = [
        makePackage({name: '@scope/root', path: '.', private: false}),
        makePackage({name: '@scope/cli', path: 'packages/cli', private: false}),
      ]

      expect(getRootPackageName(packages, 'fallback', '@scope/cli')).toBe('@scope/cli')
    })
  })
})
