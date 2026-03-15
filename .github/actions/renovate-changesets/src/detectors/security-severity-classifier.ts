import type {
  SecurityAnalysis,
  SecurityOverallSeverity,
  SecuritySeverity,
  SecurityVulnerability,
} from './security-vulnerability-types.js'

const SEVERITY_LEVELS: SecuritySeverity[] = ['low', 'medium', 'high', 'critical']

export function classifyVulnerabilityType(keywords: string[]): SecurityVulnerability['type'] {
  const keywordText = keywords.join(' ').toLowerCase()
  if (keywordText.includes('remote code execution') || keywordText.includes('rce'))
    return 'remote_code_execution'
  if (keywordText.includes('xss') || keywordText.includes('cross-site scripting'))
    return 'cross_site_scripting'
  if (keywordText.includes('sql injection')) return 'sql_injection'
  if (keywordText.includes('dos') || keywordText.includes('denial of service'))
    return 'denial_of_service'
  if (keywordText.includes('privilege escalation')) return 'privilege_escalation'
  if (keywordText.includes('information disclosure')) return 'information_disclosure'
  if (keywordText.includes('path traversal') || keywordText.includes('directory traversal'))
    return 'path_traversal'
  if (keywordText.includes('crypto')) return 'crypto_weakness'
  if (
    keywordText.includes('supply chain') ||
    keywordText.includes('malicious') ||
    keywordText.includes('backdoor')
  )
    return 'supply_chain'
  return 'unknown'
}

export function assessKeywordSeverity(
  vulnKeywords: string[],
  exploitKeywords: string[],
): SecuritySeverity {
  const allKeywords = [...vulnKeywords, ...exploitKeywords].join(' ').toLowerCase()
  if (
    allKeywords.includes('critical') ||
    allKeywords.includes('remote code execution') ||
    allKeywords.includes('arbitrary code execution')
  )
    return 'critical'
  if (
    allKeywords.includes('high') ||
    allKeywords.includes('privilege escalation') ||
    exploitKeywords.length > 0
  )
    return 'high'
  if (vulnKeywords.length > 2 || allKeywords.includes('medium')) return 'medium'
  return 'low'
}

export function assessImpactType(keywords: string[]): SecurityVulnerability['impact'] {
  const keywordText = keywords.join(' ').toLowerCase()
  if (keywordText.includes('information disclosure') || keywordText.includes('data leak'))
    return 'confidentiality'
  if (keywordText.includes('code injection') || keywordText.includes('data modification'))
    return 'integrity'
  if (keywordText.includes('denial of service') || keywordText.includes('dos'))
    return 'availability'
  return 'combined'
}

export function synthesizeSecurityAnalysis(
  vulnerabilities: SecurityVulnerability[],
): SecurityAnalysis {
  const hasSecurityIssues = vulnerabilities.length > 0
  const maxSeverityLevel = Math.max(
    0,
    ...vulnerabilities.map(v => SEVERITY_LEVELS.indexOf(v.severity)),
  )
  const overallSeverity = (SEVERITY_LEVELS[maxSeverityLevel] ?? 'low') as SecurityOverallSeverity
  const riskScore = hasSecurityIssues
    ? Math.min(100, vulnerabilities.length * 20 + maxSeverityLevel * 25)
    : 0
  const hasStructuredData = vulnerabilities.some(
    v => (v.cveIds?.length ?? 0) > 0 || (v.ghsaIds?.length ?? 0) > 0,
  )
  const cveCount = new Set(vulnerabilities.flatMap(v => v.cveIds ?? [])).size
  const ghsaCount = new Set(vulnerabilities.flatMap(v => v.ghsaIds ?? [])).size
  const supplyChainVulnerability = vulnerabilities.find(v => v.type === 'supply_chain')

  return {
    hasSecurityIssues,
    vulnerabilities,
    overallSeverity,
    riskScore,
    confidence: hasStructuredData ? 'high' : 'medium',
    reasoning: buildReasoning(vulnerabilities, hasSecurityIssues, cveCount, ghsaCount),
    recommendedAction: determineRecommendedAction(hasSecurityIssues, overallSeverity, riskScore),
    cveCount,
    ghsaCount,
    supplyChainRisk:
      supplyChainVulnerability == null
        ? 'low'
        : supplyChainVulnerability.severity === 'critical'
          ? 'high'
          : 'medium',
  }
}

function buildReasoning(
  vulnerabilities: SecurityVulnerability[],
  hasSecurityIssues: boolean,
  cveCount: number,
  ghsaCount: number,
): string[] {
  if (!hasSecurityIssues) return ['No security issues detected']
  const reasoning = [`Found ${vulnerabilities.length} security issue(s)`]
  if (cveCount > 0) reasoning.push(`${cveCount} CVE identifier(s) detected`)
  if (ghsaCount > 0) reasoning.push(`${ghsaCount} GitHub Security Advisory identifier(s) detected`)
  reasoning.push(
    `Vulnerability types: ${[...new Set(vulnerabilities.map(v => v.type))].join(', ')}`,
  )
  return reasoning
}

function determineRecommendedAction(
  hasSecurityIssues: boolean,
  overallSeverity: SecurityOverallSeverity,
  riskScore: number,
): SecurityAnalysis['recommendedAction'] {
  if (!hasSecurityIssues) return 'proceed'
  if (overallSeverity === 'critical') return 'immediate_update'
  if (overallSeverity === 'high') return riskScore > 75 ? 'immediate_update' : 'block_until_patched'
  if (overallSeverity === 'medium') return 'review_required'
  return 'investigate'
}
