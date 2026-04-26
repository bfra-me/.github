import type {RenovatePRContext} from '../src/renovate-parser'
import type {ImpactAssessment} from '../src/semver-impact-assessor'
import type {SummaryGeneratorConfig} from '../src/summary-generator-types'
import {describe, expect, it} from 'vitest'
import {
  generateAnsibleSummaryLogic,
  generateCircleCISummaryLogic,
  generateGitLabCISummaryLogic,
  generatePreCommitSummaryLogic,
} from '../src/summaries/ci-summaries'
import {
  generateCargoSummaryLogic,
  generateDockerSummaryLogic,
  generateHelmSummaryLogic,
  generatePythonSummaryLogic,
  generateTerraformSummaryLogic,
} from '../src/summaries/infrastructure-summaries'
import {createManagerSummaries} from '../src/summaries/manager-summaries'
import {
  addBreakingChangeWarning,
  generateGenericSummary,
  generateGroupedUpdateSummary,
  generateLockfileSummary,
  generateSecurityUpdateSummary,
} from '../src/summaries/structural-summaries'
import {createSummaryContexts} from '../src/summaries/summary-contexts'
import {
  determineRiskLevel,
  formatVersionText,
  getEcosystemName,
  getEmojiForUpdate,
  getJvmManagerDisplayName,
  getPackageManagerDisplayName,
  getPythonManagerDisplayName,
} from '../src/summaries/summary-helpers'

function makePRContext(overrides: Partial<RenovatePRContext> = {}): RenovatePRContext {
  return {
    dependencies: [],
    isRenovateBot: true,
    branchName: 'renovate/test',
    prTitle: 'chore(deps): update test',
    prBody: '',
    commitMessages: [],
    isGroupedUpdate: false,
    isSecurityUpdate: false,
    updateType: 'patch',
    manager: 'npm',
    files: [],
    ...overrides,
  }
}

function makeImpact(overrides: Partial<ImpactAssessment> = {}): ImpactAssessment {
  return {
    dependencies: [],
    overallImpact: 'patch',
    recommendedChangesetType: 'patch',
    isSecurityUpdate: false,
    hasBreakingChanges: false,
    hasDowngrades: false,
    hasPreleases: false,
    confidence: 'high',
    reasoning: [],
    totalVulnerabilities: 0,
    highSeverityVulnerabilities: 0,
    criticalBreakingChanges: 0,
    overallRiskScore: 10,
    ...overrides,
  }
}

function makeConfig(overrides: Partial<SummaryGeneratorConfig> = {}): SummaryGeneratorConfig {
  return {
    includeBreakingChangeWarnings: true,
    includeVersionDetails: true,
    maxDependenciesToList: 3,
    sortDependencies: false,
    useEmojis: true,
    ...overrides,
  }
}

describe('summary-helpers', () => {
  describe('getEmojiForUpdate', () => {
    it('should return empty string when useEmojis is false', () => {
      expect(getEmojiForUpdate(makePRContext(), makeImpact(), false)).toBe('')
    })

    it('should return lock emoji for security updates', () => {
      expect(getEmojiForUpdate(makePRContext({isSecurityUpdate: true}), makeImpact(), true)).toBe(
        '🔒 ',
      )
    })

    it('should return package emoji for grouped updates', () => {
      expect(getEmojiForUpdate(makePRContext({isGroupedUpdate: true}), makeImpact(), true)).toBe(
        '📦 ',
      )
    })

    it('should return warning emoji for breaking changes', () => {
      expect(getEmojiForUpdate(makePRContext(), makeImpact({hasBreakingChanges: true}), true)).toBe(
        '⚠️ ',
      )
    })

    it('should return npm emoji for npm manager', () => {
      expect(getEmojiForUpdate(makePRContext({manager: 'npm'}), makeImpact(), true)).toBe('📦 ')
    })

    it('should return docker emoji for docker manager', () => {
      expect(getEmojiForUpdate(makePRContext({manager: 'docker'}), makeImpact(), true)).toBe('🐳 ')
    })

    it('should return snake emoji for pip manager', () => {
      expect(getEmojiForUpdate(makePRContext({manager: 'pip'}), makeImpact(), true)).toBe('🐍 ')
    })

    it('should return coffee emoji for gradle manager', () => {
      expect(getEmojiForUpdate(makePRContext({manager: 'gradle'}), makeImpact(), true)).toBe('☕ ')
    })

    it('should return go emoji for go manager', () => {
      expect(getEmojiForUpdate(makePRContext({manager: 'go'}), makeImpact(), true)).toBe('🐹 ')
    })

    it('should return clipboard emoji for unknown manager', () => {
      expect(
        getEmojiForUpdate(makePRContext({manager: 'unknown' as 'npm'}), makeImpact(), true),
      ).toBe('📋 ')
    })

    it('should return gear emoji for github-actions manager', () => {
      expect(
        getEmojiForUpdate(makePRContext({manager: 'github-actions'}), makeImpact(), true),
      ).toBe('⚙️ ')
    })
  })

  describe('getEcosystemName', () => {
    it('should return node for npm', () => {
      expect(getEcosystemName('npm')).toBe('node')
    })

    it('should return python for pip', () => {
      expect(getEcosystemName('pip')).toBe('python')
    })

    it('should return unknown for unknown manager', () => {
      expect(getEcosystemName('unknown')).toBe('unknown')
    })

    it('should return jvm for maven', () => {
      expect(getEcosystemName('maven')).toBe('jvm')
    })
  })

  describe('getPackageManagerDisplayName', () => {
    it('should return npm for npm', () => {
      expect(getPackageManagerDisplayName('npm')).toBe('npm')
    })

    it('should return GitHub Actions for github-actions', () => {
      expect(getPackageManagerDisplayName('github-actions')).toBe('GitHub Actions')
    })

    it('should return manager name for unknown manager', () => {
      expect(getPackageManagerDisplayName('my-custom-manager')).toBe('my-custom-manager')
    })
  })

  describe('getJvmManagerDisplayName', () => {
    it('should return Gradle for gradle', () => {
      expect(getJvmManagerDisplayName('gradle')).toBe('Gradle')
    })

    it('should return Maven for maven', () => {
      expect(getJvmManagerDisplayName('maven')).toBe('Maven')
    })

    it('should return SBT for sbt', () => {
      expect(getJvmManagerDisplayName('sbt')).toBe('SBT')
    })

    it('should return JVM for unknown', () => {
      expect(getJvmManagerDisplayName('unknown')).toBe('JVM')
    })
  })

  describe('getPythonManagerDisplayName', () => {
    it('should return pip for pip', () => {
      expect(getPythonManagerDisplayName('pip')).toBe('pip')
    })

    it('should return Pipenv for pipenv', () => {
      expect(getPythonManagerDisplayName('pipenv')).toBe('Pipenv')
    })

    it('should return Python for unknown', () => {
      expect(getPythonManagerDisplayName('unknown')).toBe('Python')
    })
  })

  describe('determineRiskLevel', () => {
    it('should return critical for score >= 80', () => {
      expect(determineRiskLevel(makeImpact({overallRiskScore: 80}))).toBe('critical')
    })

    it('should return high for score >= 60', () => {
      expect(determineRiskLevel(makeImpact({overallRiskScore: 60}))).toBe('high')
    })

    it('should return medium for score >= 30', () => {
      expect(determineRiskLevel(makeImpact({overallRiskScore: 30}))).toBe('medium')
    })

    it('should return low for score < 30', () => {
      expect(determineRiskLevel(makeImpact({overallRiskScore: 10}))).toBe('low')
    })
  })

  describe('formatVersionText', () => {
    it('should return empty string when includeDetails is false', () => {
      expect(formatVersionText('1.0.0', '2.0.0', 'major', false)).toBe('')
    })

    it('should return empty string when newVersion is null', () => {
      expect(formatVersionText('1.0.0', undefined, 'major', true)).toBe('')
    })

    it('should return empty string for commit SHA', () => {
      expect(
        formatVersionText(undefined, 'abcdef1234567890abcdef1234567890abcdef12', 'major', true),
      ).toBe('')
    })

    it('should format major version upgrade', () => {
      const result = formatVersionText('1.0.0', '2.0.0', 'major', true)
      expect(result).toContain('v2')
    })

    it('should format minor/patch version upgrade with current version', () => {
      const result = formatVersionText('1.0.0', '1.1.0', 'minor', true)
      expect(result).toContain('1.0.0')
      expect(result).toContain('1.1.0')
    })

    it('should format patch upgrade without current version', () => {
      const result = formatVersionText(undefined, '1.1.0', 'patch', true)
      expect(result).toContain('1.1.0')
    })
  })
})

describe('structural-summaries', () => {
  const config = makeConfig()

  describe('addBreakingChangeWarning', () => {
    it('should add warning when hasBreakingChanges and config enabled', () => {
      const result = addBreakingChangeWarning(
        'Summary',
        makeImpact({hasBreakingChanges: true}),
        config,
      )
      expect(result).toContain('Breaking Changes')
    })

    it('should not add warning when no breaking changes', () => {
      const result = addBreakingChangeWarning('Summary', makeImpact(), config)
      expect(result).toBe('Summary')
    })

    it('should not add warning when config disabled', () => {
      const disabledConfig = makeConfig({includeBreakingChangeWarnings: false})
      const result = addBreakingChangeWarning(
        'Summary',
        makeImpact({hasBreakingChanges: true}),
        disabledConfig,
      )
      expect(result).toBe('Summary')
    })
  })

  describe('generateSecurityUpdateSummary', () => {
    const prContext = makePRContext({isSecurityUpdate: true})

    it('should handle empty deps', () => {
      const result = generateSecurityUpdateSummary('npm', [], prContext, makeImpact(), config)
      expect(result).toContain('Security update')
      expect(result).toContain('npm')
    })

    it('should handle single dep', () => {
      const result = generateSecurityUpdateSummary(
        'npm',
        ['lodash'],
        prContext,
        makeImpact(),
        config,
      )
      expect(result).toContain('lodash')
      expect(result).toContain('Security update')
    })

    it('should include vulnerability count when > 0', () => {
      const result = generateSecurityUpdateSummary(
        'npm',
        ['lodash'],
        prContext,
        makeImpact({totalVulnerabilities: 2}),
        config,
      )
      expect(result).toContain('2')
    })

    it('should include high severity count when > 0', () => {
      const result = generateSecurityUpdateSummary(
        'npm',
        ['lodash'],
        prContext,
        makeImpact({totalVulnerabilities: 2, highSeverityVulnerabilities: 1}),
        config,
      )
      expect(result).toContain('high severity')
    })

    it('should handle multiple deps within limit', () => {
      const result = generateSecurityUpdateSummary(
        'npm',
        ['dep1', 'dep2'],
        prContext,
        makeImpact(),
        config,
      )
      expect(result).toContain('dep1')
      expect(result).toContain('dep2')
    })

    it('should handle many deps beyond limit', () => {
      const result = generateSecurityUpdateSummary(
        'npm',
        ['dep1', 'dep2', 'dep3', 'dep4', 'dep5'],
        prContext,
        makeImpact(),
        config,
      )
      expect(result).toContain('5')
    })
  })

  describe('generateGroupedUpdateSummary', () => {
    it('should include deps within limit', () => {
      const result = generateGroupedUpdateSummary('npm', ['dep1', 'dep2'], makeImpact(), config)
      expect(result).toContain('dep1')
      expect(result).toContain('dep2')
    })

    it('should show count for many deps', () => {
      const result = generateGroupedUpdateSummary(
        'npm',
        ['dep1', 'dep2', 'dep3', 'dep4'],
        makeImpact(),
        config,
      )
      expect(result).toContain('4')
    })
  })

  describe('generateLockfileSummary', () => {
    it('should return security lockfile update when isSecurityUpdate', () => {
      const result = generateLockfileSummary(
        makePRContext({isSecurityUpdate: true}),
        makeImpact(),
        [],
        config,
      )
      expect(result).toContain('security')
    })

    it('should return generic lockfile update when no deps', () => {
      const result = generateLockfileSummary(makePRContext(), makeImpact(), [], config)
      expect(result).toContain('lockfile')
    })

    it('should include dep names within limit', () => {
      const result = generateLockfileSummary(
        makePRContext(),
        makeImpact(),
        ['dep1', 'dep2'],
        config,
      )
      expect(result).toContain('dep1')
    })

    it('should show count for many deps', () => {
      const result = generateLockfileSummary(
        makePRContext(),
        makeImpact(),
        ['d1', 'd2', 'd3', 'd4'],
        config,
      )
      expect(result).toContain('4')
    })
  })

  describe('generateGenericSummary', () => {
    it('should generate security summary for security update', () => {
      const result = generateGenericSummary(
        makePRContext({isSecurityUpdate: true}),
        makeImpact(),
        'npm',
        ['dep1'],
        config,
      )
      expect(result).toContain('Security')
    })

    it('should generate grouped summary for grouped update', () => {
      const result = generateGenericSummary(
        makePRContext({isGroupedUpdate: true}),
        makeImpact(),
        'npm',
        ['dep1'],
        config,
      )
      expect(result).toContain('Group')
    })

    it('should handle empty deps', () => {
      const result = generateGenericSummary(makePRContext(), makeImpact(), 'npm', [], config)
      expect(result).toContain('npm')
    })

    it('should handle single dep', () => {
      const result = generateGenericSummary(makePRContext(), makeImpact(), 'npm', ['dep1'], config)
      expect(result).toContain('dep1')
    })

    it('should handle multiple deps within limit', () => {
      const result = generateGenericSummary(
        makePRContext(),
        makeImpact(),
        'npm',
        ['d1', 'd2'],
        config,
      )
      expect(result).toContain('d1')
    })

    it('should handle many deps beyond limit', () => {
      const result = generateGenericSummary(
        makePRContext(),
        makeImpact(),
        'npm',
        ['d1', 'd2', 'd3', 'd4'],
        config,
      )
      expect(result).toContain('4')
    })
  })
})

describe('ci-summaries', () => {
  const config = makeConfig()
  const contexts = createSummaryContexts(config)
  const {ci} = contexts

  describe('generateAnsibleSummaryLogic', () => {
    it('should handle security update', () => {
      const result = generateAnsibleSummaryLogic(
        ci,
        makePRContext({isSecurityUpdate: true}),
        makeImpact(),
        ['role1'],
      )
      expect(result).toContain('Security')
    })

    it('should handle single role', () => {
      const result = generateAnsibleSummaryLogic(ci, makePRContext(), makeImpact(), ['my-role'])
      expect(result).toContain('my-role')
      expect(result).toContain('Ansible')
    })

    it('should handle multiple roles within limit', () => {
      const result = generateAnsibleSummaryLogic(ci, makePRContext(), makeImpact(), [
        'role1',
        'role2',
      ])
      expect(result).toContain('role1')
      expect(result).toContain('role2')
    })

    it('should handle many roles beyond limit', () => {
      const result = generateAnsibleSummaryLogic(ci, makePRContext(), makeImpact(), [
        'r1',
        'r2',
        'r3',
        'r4',
      ])
      expect(result).toContain('4')
      expect(result).toContain('Ansible')
    })
  })

  describe('generatePreCommitSummaryLogic', () => {
    it('should handle security update', () => {
      const result = generatePreCommitSummaryLogic(
        ci,
        makePRContext({isSecurityUpdate: true}),
        makeImpact(),
        ['hook1'],
      )
      expect(result).toContain('Security')
    })

    it('should handle single hook', () => {
      const result = generatePreCommitSummaryLogic(ci, makePRContext(), makeImpact(), ['my-hook'])
      expect(result).toContain('my-hook')
      expect(result).toContain('pre-commit')
    })

    it('should handle multiple hooks within limit', () => {
      const result = generatePreCommitSummaryLogic(ci, makePRContext(), makeImpact(), ['h1', 'h2'])
      expect(result).toContain('h1')
    })

    it('should handle many hooks beyond limit', () => {
      const result = generatePreCommitSummaryLogic(ci, makePRContext(), makeImpact(), [
        'h1',
        'h2',
        'h3',
        'h4',
      ])
      expect(result).toContain('4')
      expect(result).toContain('pre-commit')
    })
  })

  describe('generateGitLabCISummaryLogic', () => {
    it('should handle security update', () => {
      const result = generateGitLabCISummaryLogic(
        ci,
        makePRContext({isSecurityUpdate: true}),
        makeImpact(),
        ['dep1'],
      )
      expect(result).toContain('Security')
    })

    it('should handle single dep', () => {
      const result = generateGitLabCISummaryLogic(ci, makePRContext(), makeImpact(), ['my-dep'])
      expect(result).toContain('my-dep')
      expect(result).toContain('GitLab')
    })

    it('should handle multiple deps within limit', () => {
      const result = generateGitLabCISummaryLogic(ci, makePRContext(), makeImpact(), ['d1', 'd2'])
      expect(result).toContain('d1')
    })

    it('should handle many deps beyond limit', () => {
      const result = generateGitLabCISummaryLogic(ci, makePRContext(), makeImpact(), [
        'd1',
        'd2',
        'd3',
        'd4',
      ])
      expect(result).toContain('4')
      expect(result).toContain('GitLab')
    })
  })

  describe('generateCircleCISummaryLogic', () => {
    it('should handle security update', () => {
      const result = generateCircleCISummaryLogic(
        ci,
        makePRContext({isSecurityUpdate: true}),
        makeImpact(),
        ['orb1'],
      )
      expect(result).toContain('Security')
    })

    it('should handle single orb', () => {
      const result = generateCircleCISummaryLogic(ci, makePRContext(), makeImpact(), ['my-orb'])
      expect(result).toContain('my-orb')
      expect(result).toContain('CircleCI')
    })

    it('should handle multiple orbs within limit', () => {
      const result = generateCircleCISummaryLogic(ci, makePRContext(), makeImpact(), ['o1', 'o2'])
      expect(result).toContain('o1')
    })

    it('should handle many orbs beyond limit', () => {
      const result = generateCircleCISummaryLogic(ci, makePRContext(), makeImpact(), [
        'o1',
        'o2',
        'o3',
        'o4',
      ])
      expect(result).toContain('4')
      expect(result).toContain('CircleCI')
    })
  })
})

describe('infrastructure-summaries', () => {
  const config = makeConfig()
  const contexts = createSummaryContexts(config)
  const {infrastructure} = contexts

  describe('generateDockerSummaryLogic', () => {
    it('should handle security update', () => {
      const result = generateDockerSummaryLogic(
        infrastructure,
        makePRContext({isSecurityUpdate: true}),
        makeImpact(),
        ['nginx'],
      )
      expect(result).toContain('Security')
    })

    it('should handle single image', () => {
      const result = generateDockerSummaryLogic(infrastructure, makePRContext(), makeImpact(), [
        'nginx',
      ])
      expect(result).toContain('nginx')
      expect(result).toContain('Docker')
    })

    it('should handle multiple images within limit', () => {
      const result = generateDockerSummaryLogic(infrastructure, makePRContext(), makeImpact(), [
        'img1',
        'img2',
      ])
      expect(result).toContain('img1')
    })

    it('should handle many images beyond limit', () => {
      const result = generateDockerSummaryLogic(infrastructure, makePRContext(), makeImpact(), [
        'i1',
        'i2',
        'i3',
        'i4',
      ])
      expect(result).toContain('4')
      expect(result).toContain('Docker')
    })
  })

  describe('generateCargoSummaryLogic', () => {
    it('should handle security update', () => {
      const result = generateCargoSummaryLogic(
        infrastructure,
        makePRContext({isSecurityUpdate: true}),
        makeImpact(),
        ['serde'],
      )
      expect(result).toContain('Security')
    })

    it('should handle single crate', () => {
      const result = generateCargoSummaryLogic(infrastructure, makePRContext(), makeImpact(), [
        'serde',
      ])
      expect(result).toContain('serde')
    })

    it('should handle empty crates', () => {
      const result = generateCargoSummaryLogic(infrastructure, makePRContext(), makeImpact(), [])
      expect(result).toBeTruthy()
    })

    it('should handle multiple crates within limit', () => {
      const result = generateCargoSummaryLogic(infrastructure, makePRContext(), makeImpact(), [
        'c1',
        'c2',
      ])
      expect(result).toContain('c1')
    })

    it('should handle many crates beyond limit', () => {
      const result = generateCargoSummaryLogic(infrastructure, makePRContext(), makeImpact(), [
        'c1',
        'c2',
        'c3',
        'c4',
      ])
      expect(result).toContain('4')
      expect(result).toContain('Rust')
    })
  })

  describe('generateHelmSummaryLogic', () => {
    it('should handle security update', () => {
      const result = generateHelmSummaryLogic(
        infrastructure,
        makePRContext({isSecurityUpdate: true}),
        makeImpact(),
        ['chart1'],
      )
      expect(result).toContain('Security')
    })

    it('should handle single chart', () => {
      const result = generateHelmSummaryLogic(infrastructure, makePRContext(), makeImpact(), [
        'my-chart',
      ])
      expect(result).toContain('my-chart')
      expect(result).toContain('Helm')
    })

    it('should handle multiple charts within limit', () => {
      const result = generateHelmSummaryLogic(infrastructure, makePRContext(), makeImpact(), [
        'c1',
        'c2',
      ])
      expect(result).toContain('c1')
    })

    it('should handle many charts beyond limit', () => {
      const result = generateHelmSummaryLogic(infrastructure, makePRContext(), makeImpact(), [
        'c1',
        'c2',
        'c3',
        'c4',
      ])
      expect(result).toContain('4')
      expect(result).toContain('Helm')
    })
  })

  describe('generateTerraformSummaryLogic', () => {
    it('should handle security update', () => {
      const result = generateTerraformSummaryLogic(
        infrastructure,
        makePRContext({isSecurityUpdate: true}),
        makeImpact(),
        ['aws'],
      )
      expect(result).toContain('Security')
    })

    it('should handle single provider', () => {
      const result = generateTerraformSummaryLogic(infrastructure, makePRContext(), makeImpact(), [
        'aws',
      ])
      expect(result).toContain('aws')
      expect(result).toContain('Terraform')
    })

    it('should handle multiple providers within limit', () => {
      const result = generateTerraformSummaryLogic(infrastructure, makePRContext(), makeImpact(), [
        'p1',
        'p2',
      ])
      expect(result).toContain('p1')
    })

    it('should handle many providers beyond limit', () => {
      const result = generateTerraformSummaryLogic(infrastructure, makePRContext(), makeImpact(), [
        'p1',
        'p2',
        'p3',
        'p4',
      ])
      expect(result).toContain('4')
      expect(result).toContain('Terraform')
    })
  })

  describe('generatePythonSummaryLogic', () => {
    it('should handle security update', () => {
      const result = generatePythonSummaryLogic(
        infrastructure,
        makePRContext({isSecurityUpdate: true, manager: 'pip'}),
        makeImpact(),
        ['requests'],
      )
      expect(result).toContain('Security')
    })

    it('should handle single dep', () => {
      const result = generatePythonSummaryLogic(
        infrastructure,
        makePRContext({manager: 'pip'}),
        makeImpact(),
        ['requests'],
      )
      expect(result).toContain('requests')
    })

    it('should handle multiple deps within limit', () => {
      const result = generatePythonSummaryLogic(
        infrastructure,
        makePRContext({manager: 'pip'}),
        makeImpact(),
        ['dep1', 'dep2'],
      )
      expect(result).toContain('dep1')
    })

    it('should handle many deps beyond limit', () => {
      const result = generatePythonSummaryLogic(
        infrastructure,
        makePRContext({manager: 'pip'}),
        makeImpact(),
        ['d1', 'd2', 'd3', 'd4'],
      )
      expect(result).toContain('4')
    })
  })
})

describe('summary-contexts and manager-summaries', () => {
  const config = makeConfig()

  it('createSummaryContexts should return all required contexts', () => {
    const contexts = createSummaryContexts(config)
    expect(contexts.js).toBeDefined()
    expect(contexts.jvm).toBeDefined()
    expect(contexts.infrastructure).toBeDefined()
    expect(contexts.ci).toBeDefined()
  })

  it('createManagerSummaries should return functions for all supported managers', () => {
    const contexts = createSummaryContexts(config)
    const summaries = createManagerSummaries(contexts, config)
    expect(summaries.npm).toBeDefined()
    expect(summaries.docker).toBeDefined()
    expect(summaries.gradle).toBeDefined()
    expect(summaries['github-actions']).toBeDefined()
    expect(summaries.ansible).toBeDefined()
    expect(summaries.terraform).toBeDefined()
    expect(summaries.lockfile).toBeDefined()
  })

  it('npm manager summary function should generate a result', () => {
    const contexts = createSummaryContexts(config)
    const summaries = createManagerSummaries(contexts, config)
    const result = summaries.npm!(makePRContext(), makeImpact(), ['lodash'])
    expect(result).toContain('lodash')
  })

  it('docker manager summary function should generate a result', () => {
    const contexts = createSummaryContexts(config)
    const summaries = createManagerSummaries(contexts, config)
    const result = summaries.docker!(makePRContext({manager: 'docker'}), makeImpact(), ['nginx'])
    expect(result).toContain('nginx')
  })

  it('lockfile manager summary function should generate a result', () => {
    const contexts = createSummaryContexts(config)
    const summaries = createManagerSummaries(contexts, config)
    const result = summaries.lockfile!(makePRContext(), makeImpact(), [])
    expect(result).toContain('lockfile')
  })
})
