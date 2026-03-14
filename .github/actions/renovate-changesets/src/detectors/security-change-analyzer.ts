import type {Octokit} from '@octokit/rest'
import type {RenovateDependency} from '../renovate-parser.js'
import type {SecurityPatterns, SecurityVulnerability} from './security-vulnerability-types.js'
import {extractCVEIds, extractGHSAIds} from './security-advisory-parser.js'
import {
  assessImpactType,
  assessKeywordSeverity,
  classifyVulnerabilityType,
} from './security-severity-classifier.js'

const PR_SECURITY_KEYWORDS = [
  'security fix',
  'security patch',
  'vulnerability',
  'cve-',
  'ghsa-',
  'security advisory',
  'exploit',
  'malicious',
  'backdoor',
  'security update',
]

export function analyzeSecurityPatterns(
  dependency: RenovateDependency,
  securityPatterns: SecurityPatterns,
): SecurityVulnerability[] {
  const patterns = securityPatterns[detectEcosystem(dependency.manager)]
  if (patterns == null) return []

  const allText = dependency.name.toLowerCase()
  const foundKeywords = patterns.vulnerabilityKeywords.filter(keyword => allText.includes(keyword))
  const foundExploitKeywords = patterns.exploitKeywords.filter(keyword => allText.includes(keyword))
  if (foundKeywords.length === 0 && foundExploitKeywords.length === 0) return []

  return [
    {
      id: `security-keywords-${dependency.name}-${Date.now()}`,
      source: 'keywords',
      type: classifyVulnerabilityType(foundKeywords),
      severity: assessKeywordSeverity(foundKeywords, foundExploitKeywords),
      impact: assessImpactType(foundKeywords),
      exploitability: foundExploitKeywords.length > 0 ? 'high' : 'medium',
      cveIds: [],
      ghsaIds: [],
      description: 'Security-related keywords detected in dependency information',
      evidence: [
        ...foundKeywords.map(keyword => `Vulnerability keyword: ${keyword}`),
        ...foundExploitKeywords.map(keyword => `Exploit keyword: ${keyword}`),
      ],
      affectedVersions: dependency.currentVersion == null ? [] : [dependency.currentVersion],
      patchedVersions: dependency.newVersion == null ? [] : [dependency.newVersion],
    },
  ]
}

export function analyzeSupplyChainRisks(
  dependency: RenovateDependency,
  securityPatterns: SecurityPatterns,
): SecurityVulnerability[] {
  const patterns = securityPatterns[detectEcosystem(dependency.manager)]
  if (patterns == null) return []

  const dependencyName = dependency.name.toLowerCase()
  const isTrusted = patterns.trustedSources.some(source => dependencyName.startsWith(source))
  const isRisky = patterns.riskPackages.some(
    riskPkg => dependencyName.includes(riskPkg) || dependencyName === riskPkg,
  )
  const trustIndicators = assessPackageTrust(dependency)
  if (!isRisky && trustIndicators.riskLevel !== 'high') return []

  return [
    {
      id: `supply-chain-${dependency.name}-${Date.now()}`,
      source: 'supply_chain',
      type: 'supply_chain',
      severity: isRisky ? 'medium' : trustIndicators.riskLevel,
      impact: 'combined',
      exploitability: 'medium',
      cveIds: [],
      ghsaIds: [],
      description: 'Supply chain security risk detected',
      evidence: [
        ...(isRisky ? [`Package in risk list: ${dependency.name}`] : []),
        ...trustIndicators.evidence,
        ...(isTrusted ? ['Package from trusted source'] : ['Package from untrusted source']),
      ],
      affectedVersions: dependency.currentVersion == null ? [] : [dependency.currentVersion],
      patchedVersions: dependency.newVersion == null ? [] : [dependency.newVersion],
    },
  ]
}

export async function analyzePRContentSecurity(
  dependency: RenovateDependency,
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<SecurityVulnerability[]> {
  try {
    const {data: pr} = await octokit.rest.pulls.get({owner, repo, pull_number: prNumber})
    const prContent = `${pr.title} ${pr.body ?? ''}`.toLowerCase()
    const foundKeywords = PR_SECURITY_KEYWORDS.filter(keyword => prContent.includes(keyword))
    if (foundKeywords.length === 0) return []

    return [
      {
        id: `pr-content-${dependency.name}-${Date.now()}`,
        source: 'pr_content',
        type: 'unknown',
        severity: 'medium',
        impact: 'combined',
        exploitability: 'medium',
        cveIds: extractCVEIds(prContent),
        ghsaIds: extractGHSAIds(prContent),
        description: 'Security information found in PR description',
        evidence: foundKeywords.map(keyword => `PR mentions: ${keyword}`),
        affectedVersions: dependency.currentVersion == null ? [] : [dependency.currentVersion],
        patchedVersions: dependency.newVersion == null ? [] : [dependency.newVersion],
      },
    ]
  } catch (error) {
    console.warn('Failed to analyze PR content for security:', error)
    return []
  }
}

function assessPackageTrust(dependency: RenovateDependency): {
  riskLevel: 'low' | 'medium' | 'high'
  evidence: string[]
} {
  const evidence: string[] = []
  let riskLevel: 'low' | 'medium' | 'high' = 'low'
  const name = dependency.name.toLowerCase()
  for (const pattern of [
    /test/,
    /temp/,
    /dev/,
    /debug/,
    /hack/,
    /exploit/,
    /malware/,
    /virus/,
    /trojan/,
  ]) {
    if (pattern.test(name)) {
      evidence.push(`Suspicious name pattern: ${pattern.source}`)
      riskLevel = 'medium'
    }
  }
  for (const popular of ['react', 'lodash', 'express', 'vue', 'angular']) {
    if (name.includes(popular) && name !== popular && !name.startsWith(`@${popular}/`)) {
      evidence.push(`Potential typosquatting of: ${popular}`)
      riskLevel = 'high'
    }
  }
  return {riskLevel, evidence}
}

function detectEcosystem(manager: string): string {
  switch (manager) {
    case 'npm':
    case 'pnpm':
    case 'yarn':
    case 'lockfile':
      return 'npm'
    case 'pip':
    case 'pipenv':
    case 'poetry':
      return 'python'
    case 'docker':
    case 'dockerfile':
    case 'docker-compose':
      return 'docker'
    case 'github-actions':
      return 'github-actions'
    default:
      return 'generic'
  }
}
