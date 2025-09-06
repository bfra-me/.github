import type {RenovateDependency} from '../src/renovate-parser'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {MultiPackageAnalyzer} from '../src/multi-package-analyzer'

const fsMocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
  stat: vi.fn(),
  readdir: vi.fn(),
}))

vi.mock('node:fs', () => ({
  promises: {
    readFile: fsMocks.readFile,
    writeFile: fsMocks.writeFile,
    mkdir: fsMocks.mkdir,
    access: fsMocks.access,
    stat: fsMocks.stat,
    readdir: fsMocks.readdir,
  },
}))

describe('MultiPackageAnalyzer', () => {
  let analyzer: MultiPackageAnalyzer

  beforeEach(() => {
    vi.clearAllMocks()
    analyzer = new MultiPackageAnalyzer({
      workspaceRoot: '/test',
      detectWorkspaces: true,
      analyzeInternalDependencies: true,
      enforceVersionConsistency: true,
      maxPackagesToAnalyze: 10,
    })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('workspace discovery', () => {
    it('should detect monorepo with workspace packages', async () => {
      // Mock root package.json with workspaces
      fsMocks.access.mockImplementation(async (path: string) => {
        if (path.includes('package.json')) return undefined
        throw new Error('Not found')
      })

      fsMocks.readFile.mockImplementation(async (path: string) => {
        if (path.includes('/test/package.json')) {
          return JSON.stringify({
            name: 'root',
            version: '1.0.0',
            private: true,
            workspaces: ['packages/*'],
          })
        }
        if (path.includes('/test/packages/app/package.json')) {
          return JSON.stringify({
            name: '@test/app',
            version: '1.0.0',
            dependencies: {
              '@test/lib': 'workspace:*',
              react: '^18.0.0',
            },
          })
        }
        if (path.includes('/test/packages/lib/package.json')) {
          return JSON.stringify({
            name: '@test/lib',
            version: '1.0.0',
            dependencies: {
              lodash: '^4.17.21',
            },
          })
        }
        throw new Error('File not found')
      })

      fsMocks.stat.mockImplementation(async (path: string) => ({
        isDirectory: () => path.includes('/test/packages'),
      }))

      fsMocks.readdir.mockImplementation(async (path: string) => {
        if (path.includes('/test/packages')) {
          return [
            {name: 'app', isDirectory: () => true},
            {name: 'lib', isDirectory: () => true},
          ]
        }
        return []
      })

      const dependencies: RenovateDependency[] = [
        {
          name: 'react',
          currentVersion: '17.0.2',
          newVersion: '18.0.0',
          manager: 'npm',
          updateType: 'major',
          isSecurityUpdate: false,
          isGrouped: false,
        },
      ]

      const result = await analyzer.analyzeMultiPackageUpdate(
        dependencies,
        ['packages/app/package.json'],
        undefined,
        undefined,
        undefined,
        undefined,
      )

      expect(result.workspacePackages).toHaveLength(3) // root + app + lib
      expect(result.workspacePackages.find(p => p.name === '@test/app')).toBeDefined()
      expect(result.workspacePackages.find(p => p.name === '@test/lib')).toBeDefined()
      expect(result.affectedPackages).toContain('@test/app')
    })

    it('should detect internal dependencies between packages', async () => {
      // Mock a monorepo with internal dependencies
      fsMocks.access.mockImplementation(async (path: string) => {
        if (path.includes('package.json')) return undefined
        throw new Error('Not found')
      })

      fsMocks.readFile.mockImplementation(async (path: string) => {
        if (path.includes('/test/package.json')) {
          return JSON.stringify({
            name: 'monorepo',
            version: '1.0.0',
            private: true,
            workspaces: ['packages/*'],
          })
        }
        if (path.includes('/test/packages/frontend/package.json')) {
          return JSON.stringify({
            name: '@test/frontend',
            version: '1.0.0',
            dependencies: {
              '@test/shared': 'workspace:*',
              react: '^18.0.0',
            },
          })
        }
        if (path.includes('/test/packages/backend/package.json')) {
          return JSON.stringify({
            name: '@test/backend',
            version: '1.0.0',
            dependencies: {
              '@test/shared': 'workspace:*',
              express: '^4.18.0',
            },
          })
        }
        if (path.includes('/test/packages/shared/package.json')) {
          return JSON.stringify({
            name: '@test/shared',
            version: '1.0.0',
            dependencies: {
              typescript: '^5.0.0',
            },
          })
        }
        throw new Error('File not found')
      })

      fsMocks.stat.mockImplementation(async (path: string) => ({
        isDirectory: () => path.includes('/test/packages'),
      }))

      fsMocks.readdir.mockImplementation(async (path: string) => {
        if (path.includes('/test/packages')) {
          return [
            {name: 'frontend', isDirectory: () => true},
            {name: 'backend', isDirectory: () => true},
            {name: 'shared', isDirectory: () => true},
          ]
        }
        return []
      })

      const dependencies: RenovateDependency[] = [
        {
          name: 'typescript',
          currentVersion: '4.9.5',
          newVersion: '5.0.0',
          manager: 'npm',
          updateType: 'major',
          isSecurityUpdate: false,
          isGrouped: false,
        },
      ]

      const result = await analyzer.analyzeMultiPackageUpdate(
        dependencies,
        ['packages/shared/package.json'],
        undefined,
        undefined,
        undefined,
        undefined,
      )

      expect(result.workspacePackages).toHaveLength(4) // root + frontend + backend + shared
      expect(result.packageRelationships).toHaveLength(2) // frontend -> shared, backend -> shared

      const internalDeps = result.packageRelationships.filter(r => r.type === 'internal-dependency')
      expect(internalDeps).toHaveLength(2)
      expect(
        internalDeps.find(r => r.source === '@test/frontend' && r.target === '@test/shared'),
      ).toBeDefined()
      expect(
        internalDeps.find(r => r.source === '@test/backend' && r.target === '@test/shared'),
      ).toBeDefined()
    })

    it('should detect version consistency requirements', async () => {
      // Mock packages with same external dependencies
      fsMocks.access.mockImplementation(async (path: string) => {
        if (path.includes('package.json')) return undefined
        throw new Error('Not found')
      })

      fsMocks.readFile.mockImplementation(async (path: string) => {
        if (path.includes('/test/package.json')) {
          return JSON.stringify({
            name: 'root',
            version: '1.0.0',
            private: true,
            workspaces: ['apps/*'],
          })
        }
        if (path.includes('/test/apps/web/package.json')) {
          return JSON.stringify({
            name: '@test/web',
            version: '1.0.0',
            dependencies: {
              typescript: '^4.9.0',
            },
          })
        }
        if (path.includes('/test/apps/api/package.json')) {
          return JSON.stringify({
            name: '@test/api',
            version: '1.0.0',
            dependencies: {
              typescript: '^4.8.0', // Different version - should trigger consistency check
            },
          })
        }
        throw new Error('File not found')
      })

      fsMocks.stat.mockImplementation(async (path: string) => ({
        isDirectory: () => path.includes('/test/apps'),
      }))

      fsMocks.readdir.mockImplementation(async (path: string) => {
        if (path.includes('/test/apps')) {
          return [
            {name: 'web', isDirectory: () => true},
            {name: 'api', isDirectory: () => true},
          ]
        }
        return []
      })

      const dependencies: RenovateDependency[] = [
        {
          name: 'typescript',
          currentVersion: '4.9.0',
          newVersion: '5.0.0',
          manager: 'npm',
          updateType: 'major',
          isSecurityUpdate: false,
          isGrouped: false,
        },
      ]

      const result = await analyzer.analyzeMultiPackageUpdate(
        dependencies,
        ['apps/web/package.json', 'apps/api/package.json'],
        undefined,
        undefined,
        undefined,
        undefined,
      )

      expect(result.workspacePackages).toHaveLength(3) // root + web + api

      const versionConsistencyRels = result.packageRelationships.filter(
        r => r.type === 'version-consistency',
      )
      expect(versionConsistencyRels).toHaveLength(2) // web→api and api→web
      expect(versionConsistencyRels.every(rel => rel.dependencyName === 'typescript')).toBe(true)
    })
  })

  describe('impact analysis', () => {
    it('should determine correct changeset strategy for single package', async () => {
      fsMocks.access.mockImplementation(async () => {
        throw new Error('Not found') // No workspace detected
      })

      const dependencies: RenovateDependency[] = [
        {
          name: 'lodash',
          currentVersion: '4.17.20',
          newVersion: '4.17.21',
          manager: 'npm',
          updateType: 'patch',
          isSecurityUpdate: false,
          isGrouped: false,
        },
      ]

      const result = await analyzer.analyzeMultiPackageUpdate(
        dependencies,
        ['package.json'],
        undefined,
        undefined,
        undefined,
        undefined,
      )

      expect(result.workspacePackages).toHaveLength(0)
      expect(result.impactAnalysis.changesetStrategy).toBe('single')
      expect(result.recommendations.createSeparateChangesets).toBe(false)
    })

    it('should recommend grouped strategy for related packages', async () => {
      // Mock a monorepo with internal dependencies
      fsMocks.access.mockImplementation(async (path: string) => {
        if (path.includes('package.json')) return undefined
        throw new Error('Not found')
      })

      fsMocks.readFile.mockImplementation(async (path: string) => {
        if (path.includes('/test/package.json')) {
          return JSON.stringify({
            name: 'monorepo',
            version: '1.0.0',
            private: true,
            workspaces: ['packages/*'],
          })
        }
        if (path.includes('/test/packages/ui/package.json')) {
          return JSON.stringify({
            name: '@test/ui',
            version: '1.0.0',
            dependencies: {
              '@test/utils': 'workspace:*',
              react: '^18.0.0',
            },
          })
        }
        if (path.includes('/test/packages/utils/package.json')) {
          return JSON.stringify({
            name: '@test/utils',
            version: '1.0.0',
            dependencies: {
              lodash: '^4.17.21',
            },
          })
        }
        throw new Error('File not found')
      })

      fsMocks.stat.mockImplementation(async (path: string) => ({
        isDirectory: () => path.includes('/test/packages'),
      }))

      fsMocks.readdir.mockImplementation(async (path: string) => {
        if (path.includes('/test/packages')) {
          return [
            {name: 'ui', isDirectory: () => true},
            {name: 'utils', isDirectory: () => true},
          ]
        }
        return []
      })

      const dependencies: RenovateDependency[] = [
        {
          name: 'react',
          currentVersion: '17.0.2',
          newVersion: '18.0.0',
          manager: 'npm',
          updateType: 'major',
          isSecurityUpdate: false,
          isGrouped: false,
        },
      ]

      const result = await analyzer.analyzeMultiPackageUpdate(
        dependencies,
        ['packages/ui/package.json'],
        undefined,
        undefined,
        undefined,
        undefined,
      )

      expect(result.workspacePackages).toHaveLength(3)
      expect(result.packageRelationships.length).toBeGreaterThan(0)
      expect(result.impactAnalysis.changesetStrategy).toBe('grouped')
      expect(result.recommendations.createSeparateChangesets).toBe(true)
    })

    it('should calculate risk levels correctly', async () => {
      fsMocks.access.mockImplementation(async (path: string) => {
        if (path.includes('package.json')) return undefined
        throw new Error('Not found')
      })

      // Mock many packages to trigger high risk
      fsMocks.readFile.mockImplementation(async (path: string) => {
        if (path.includes('/test/package.json')) {
          return JSON.stringify({
            name: 'large-monorepo',
            version: '1.0.0',
            private: true,
            workspaces: ['packages/*'],
          })
        }
        // Mock 8 packages to trigger high risk (> 5 packages)
        for (let i = 1; i <= 8; i++) {
          if (path.includes(`/test/packages/package${i}/package.json`)) {
            return JSON.stringify({
              name: `@test/package${i}`,
              version: '1.0.0',
              dependencies: {
                react: '^18.0.0',
              },
            })
          }
        }
        throw new Error('File not found')
      })

      fsMocks.stat.mockImplementation(async (path: string) => ({
        isDirectory: () => path.includes('/test/packages'),
      }))

      fsMocks.readdir.mockImplementation(async () => {
        return Array.from({length: 8}, (_, i) => ({
          name: `package${i + 1}`,
          isDirectory: () => true,
        }))
      })

      const dependencies: RenovateDependency[] = [
        {
          name: 'react',
          currentVersion: '17.0.2',
          newVersion: '18.0.0',
          manager: 'npm',
          updateType: 'major',
          isSecurityUpdate: false,
          isGrouped: false,
        },
      ]

      const changedFiles = Array.from(
        {length: 8},
        (_, i) => `packages/package${i + 1}/package.json`,
      )

      const result = await analyzer.analyzeMultiPackageUpdate(
        dependencies,
        changedFiles,
        undefined,
        undefined,
        undefined,
        undefined,
      )

      expect(result.workspacePackages).toHaveLength(9) // root + 8 packages
      expect(result.affectedPackages).toHaveLength(8)
      expect(result.impactAnalysis.riskLevel).toBe('high') // > 5 packages
    })
  })

  describe('edge cases', () => {
    it('should handle missing workspace directories gracefully', async () => {
      fsMocks.access.mockImplementation(async (path: string) => {
        if (path.includes('/test/package.json')) return undefined
        throw new Error('Not found')
      })

      fsMocks.readFile.mockImplementation(async (path: string) => {
        if (path.includes('/test/package.json')) {
          return JSON.stringify({
            name: 'root',
            version: '1.0.0',
            workspaces: ['nonexistent/*'], // Directory doesn't exist
          })
        }
        throw new Error('File not found')
      })

      fsMocks.stat.mockImplementation(async () => {
        throw new Error('Directory not found')
      })

      const dependencies: RenovateDependency[] = [
        {
          name: 'lodash',
          currentVersion: '4.17.20',
          newVersion: '4.17.21',
          manager: 'npm',
          updateType: 'patch',
          isSecurityUpdate: false,
          isGrouped: false,
        },
      ]

      const result = await analyzer.analyzeMultiPackageUpdate(
        dependencies,
        ['package.json'],
        undefined,
        undefined,
        undefined,
        undefined,
      )

      // Should still work with just the root package
      expect(result.workspacePackages).toHaveLength(1)
      expect(result.impactAnalysis.changesetStrategy).toBe('single')
    })

    it('should handle malformed package.json files', async () => {
      fsMocks.access.mockImplementation(async (path: string) => {
        if (path.includes('package.json')) return undefined
        throw new Error('Not found')
      })

      fsMocks.readFile.mockImplementation(async (path: string) => {
        if (path.includes('/test/package.json')) {
          return 'invalid json content'
        }
        throw new Error('File not found')
      })

      const dependencies: RenovateDependency[] = [
        {
          name: 'lodash',
          currentVersion: '4.17.20',
          newVersion: '4.17.21',
          manager: 'npm',
          updateType: 'patch',
          isSecurityUpdate: false,
          isGrouped: false,
        },
      ]

      const result = await analyzer.analyzeMultiPackageUpdate(
        dependencies,
        ['package.json'],
        undefined,
        undefined,
        undefined,
        undefined,
      )

      // Should handle gracefully and return empty workspace
      expect(result.workspacePackages).toHaveLength(0)
      expect(result.impactAnalysis.changesetStrategy).toBe('single')
    })

    it('should respect maxPackagesToAnalyze limit', async () => {
      const limitedAnalyzer = new MultiPackageAnalyzer({
        workspaceRoot: '/test',
        maxPackagesToAnalyze: 2, // Limit to 2 packages
      })

      fsMocks.access.mockImplementation(async (path: string) => {
        if (path.includes('package.json')) return undefined
        throw new Error('Not found')
      })

      fsMocks.readFile.mockImplementation(async (path: string) => {
        if (path.includes('/test/package.json')) {
          return JSON.stringify({
            name: 'root',
            version: '1.0.0',
            workspaces: ['packages/*'],
          })
        }
        // Mock 5 packages but should only analyze 2
        for (let i = 1; i <= 5; i++) {
          if (path.includes(`/test/packages/pkg${i}/package.json`)) {
            return JSON.stringify({
              name: `@test/pkg${i}`,
              version: '1.0.0',
            })
          }
        }
        throw new Error('File not found')
      })

      fsMocks.stat.mockImplementation(async (path: string) => ({
        isDirectory: () => path.includes('/test/packages'),
      }))

      fsMocks.readdir.mockImplementation(async () => {
        return Array.from({length: 5}, (_, i) => ({
          name: `pkg${i + 1}`,
          isDirectory: () => true,
        }))
      })

      const dependencies: RenovateDependency[] = [
        {
          name: 'lodash',
          currentVersion: '4.17.20',
          newVersion: '4.17.21',
          manager: 'npm',
          updateType: 'patch',
          isSecurityUpdate: false,
          isGrouped: false,
        },
      ]

      const result = await limitedAnalyzer.analyzeMultiPackageUpdate(
        dependencies,
        ['packages/pkg1/package.json'],
        undefined,
        undefined,
        undefined,
        undefined,
      )

      // Should respect the limit of 2 packages
      expect(result.workspacePackages).toHaveLength(2)
    })
  })
})
