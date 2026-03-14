import type {RenovateDependency} from '../renovate-parser.js'
import type {SecurityVulnerability} from './security-vulnerability-types.js'

const CVE_PATTERN = /CVE-(\d{4})-(\d{4,})/gi
const GHSA_PATTERN = /GHSA-[2-9cfghjmpqrvwx]{4}-[2-9cfghjmpqrvwx]{4}-[2-9cfghjmpqrvwx]{4}/gi

export function extractCVEVulnerabilities(dependency: RenovateDependency): SecurityVulnerability[] {
  return collectMatches(getDependencyTextSources(dependency), CVE_PATTERN)
    .map(cveId => analyzeCVE(cveId, dependency))
    .filter((vulnerability): vulnerability is SecurityVulnerability => vulnerability != null)
}

export function extractGHSAVulnerabilities(
  dependency: RenovateDependency,
): SecurityVulnerability[] {
  return collectMatches(getDependencyTextSources(dependency), GHSA_PATTERN)
    .map(ghsaId => analyzeGHSA(ghsaId))
    .filter((vulnerability): vulnerability is SecurityVulnerability => vulnerability != null)
}

export function extractCVEIds(text: string): string[] {
  return [...text.matchAll(CVE_PATTERN)].map(match => match[0])
}

export function extractGHSAIds(text: string): string[] {
  return [...text.matchAll(GHSA_PATTERN)].map(match => match[0])
}

function getDependencyTextSources(dependency: RenovateDependency): string[] {
  return [dependency.name, dependency.currentVersion ?? '', dependency.newVersion ?? '']
}

function collectMatches(textSources: string[], pattern: RegExp): string[] {
  const matches: string[] = []
  for (const text of textSources) {
    for (const match of text.matchAll(pattern)) {
      if (!matches.includes(match[0])) matches.push(match[0])
    }
  }
  return matches
}

function analyzeCVE(cveId: string, dependency: RenovateDependency): SecurityVulnerability | null {
  const [, yearPart = '0', sequencePart = '0'] = cveId.split('-')
  const year = Number.parseInt(yearPart, 10)
  const sequence = Number.parseInt(sequencePart, 10)
  const isRecent = year >= new Date().getFullYear() - 2
  const severity = isRecent ? (sequence > 10000 ? 'high' : 'medium') : 'low'

  return {
    id: `cve-${cveId}`,
    source: 'cve',
    type: 'unknown',
    severity,
    impact: 'combined',
    exploitability: isRecent ? 'medium' : 'low',
    cveIds: [cveId],
    ghsaIds: [],
    description: `CVE identifier found: ${cveId}`,
    evidence: [`CVE ID: ${cveId}`, `Year: ${year}`, `Recent: ${isRecent}`],
    affectedVersions: dependency.currentVersion == null ? [] : [dependency.currentVersion],
    patchedVersions: dependency.newVersion == null ? [] : [dependency.newVersion],
  }
}

function analyzeGHSA(ghsaId: string): SecurityVulnerability | null {
  return {
    id: ghsaId || 'unknown-ghsa',
    source: 'github-advisory',
    type: 'unknown',
    severity: 'medium',
    impact: 'combined',
    exploitability: 'medium',
    cveIds: [],
    ghsaIds: [ghsaId],
    description: `GitHub Security Advisory found: ${ghsaId}`,
    evidence: [`GHSA ID: ${ghsaId}`],
    affectedVersions: [],
    patchedVersions: [],
  }
}
