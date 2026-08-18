import type {Config} from '../src/action-config'
import type {WorkspacePackage} from '../src/multi-package/types'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {generateChangesetsFromAnalysis} from '../src/run-generation'
import {dockerBody, shaDigestBody} from './extract/fixtures'

const mocks = vi.hoisted(() => ({
  analyzeMultiPackageUpdate: vi.fn(),
  generateMultiPackageChangesets: vi.fn(),
}))

vi.mock('../src/multi-package-analyzer', () => ({
  analyzeMultiPackageUpdate: mocks.analyzeMultiPackageUpdate,
}))

vi.mock('../src/multi-package-changeset-generator', () => ({
  generateMultiPackageChangesets: mocks.generateMultiPackageChangesets,
}))

const config: Config = {
  updateTypes: {
    docker: {changesetType: 'patch', filePatterns: []},
    'github-actions': {changesetType: 'patch', filePatterns: []},
    npm: {changesetType: 'patch', filePatterns: []},
  },
  defaultChangesetType: 'patch',
  emoji: false,
  sort: false,
  targetPackage: '@consumer/root',
}

const analysis = {
  workspacePackages: [
    {
      name: '@consumer/root',
      path: 'packages/root',
      packageJsonPath: '/tmp/workspace/packages/root/package.json',
      version: '1.0.0',
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
      optionalDependencies: {},
      private: false,
      workspaceMember: true,
    } satisfies WorkspacePackage,
  ],
  packageRelationships: [],
  affectedPackages: ['@consumer/root'],
  impactAnalysis: {
    directlyAffected: ['@consumer/root'],
    indirectlyAffected: [],
    riskLevel: 'low' as const,
    changesetStrategy: 'single' as const,
  },
  recommendations: {
    createSeparateChangesets: false,
  },
}

describe('generateChangesetsFromAnalysis', () => {
  beforeEach(() => {
    mocks.analyzeMultiPackageUpdate.mockResolvedValue(analysis)
    mocks.generateMultiPackageChangesets.mockResolvedValue({
      changesets: [
        {
          id: 'renovate-test',
          filename: 'renovate-test.md',
          packages: ['@consumer/root'],
          summary: 'placeholder',
          releases: [{name: '@consumer/root', type: 'patch'}],
          relationships: [],
          metadata: {
            isGrouped: false,
            isSecurityUpdate: false,
            hasBreakingChanges: false,
            affectedDependencies: ['node'],
            reasoning: [],
          },
        },
      ],
      strategy: 'single',
      totalPackagesAffected: 1,
      filesCreated: ['.changeset/renovate-test.md'],
      reasoning: [],
      warnings: [],
    })
  })

  it('extracts, classifies, and formats a Docker update before writing', async () => {
    const result = await generateChangesetsFromAnalysis({
      config,
      owner: 'owner',
      repo: 'repo',
      prNumber: 5001,
      prTitle: 'Update node',
      prContext: {
        dependencies: [],
        isRenovateBot: true,
        branchName: 'renovate/docker-node-22.x',
        prTitle: 'Update node',
        prBody: dockerBody,
        commitMessages: ['chore(deps): update node'],
        isGroupedUpdate: false,
        isSecurityUpdate: false,
        updateType: 'minor',
        manager: 'docker',
        files: [],
      },
      workingDirectory: '/tmp/workspace',
      changedFiles: ['Dockerfile'],
      enhancedDependencies: [],
      impactAssessment: {} as never,
      categorizationResult: {} as never,
      updateType: 'docker',
      changesetType: 'patch',
    })

    expect(result?.changesetContent).toBe(
      'Update Docker image `node` from `22.7.0-alpine` to `22.8.0-alpine`',
    )
  })

  it('formats digest refreshes without exposing SHA version text', async () => {
    const result = await generateChangesetsFromAnalysis({
      config,
      owner: 'owner',
      repo: 'repo',
      prNumber: 5002,
      prTitle: 'Update actions/checkout digest',
      prContext: {
        dependencies: [],
        isRenovateBot: true,
        branchName: 'renovate/actions-checkout-digest',
        prTitle: 'Update actions/checkout digest',
        prBody: shaDigestBody,
        commitMessages: ['chore(deps): update actions/checkout digest'],
        isGroupedUpdate: false,
        isSecurityUpdate: false,
        updateType: 'digest',
        manager: 'github-actions',
        files: [],
      },
      workingDirectory: '/tmp/workspace',
      changedFiles: ['.github/workflows/ci.yml'],
      enhancedDependencies: [],
      impactAssessment: {} as never,
      categorizationResult: {} as never,
      updateType: 'github-actions',
      changesetType: 'patch',
    })

    expect(result?.changesetContent).toBe(
      'Update GitHub Actions workflow dependency `actions/checkout`',
    )
    expect(result?.changesetContent).not.toContain('3d3c42e5')
  })
})
