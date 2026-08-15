export interface BreakingChangeIndicator {
  type:
    'major_version' | 'api_deprecation' | 'config_change' | 'runtime_change' | 'ecosystem_specific'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  evidence: string[]
  confidence: 'low' | 'medium' | 'high'
}

export interface BreakingChangeAnalysis {
  hasBreakingChanges: boolean
  indicators: BreakingChangeIndicator[]
  overallSeverity: 'low' | 'medium' | 'high' | 'critical'
  confidence: 'low' | 'medium' | 'high'
  reasoning: string[]
  recommendedAction: 'proceed' | 'review_required' | 'manual_testing' | 'block'
}

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical'
export type SecurityOverallSeverity = 'none' | SecuritySeverity
export type SecurityConfidence = 'low' | 'medium' | 'high'
export type SupplyChainRisk = 'low' | 'medium' | 'high'

export interface SecurityVulnerability {
  id: string
  type:
    | 'cve'
    | 'ghsa'
    | 'security_flag'
    | 'remote_code_execution'
    | 'cross_site_scripting'
    | 'sql_injection'
    | 'denial_of_service'
    | 'privilege_escalation'
    | 'information_disclosure'
    | 'supply_chain'
    | 'malicious_package'
    | 'crypto_weakness'
    | 'path_traversal'
    | 'unknown'
  severity: SecuritySeverity
  description: string
  source: string
  affectedVersions: string[]
  cvssScore?: number
  impact?: 'confidentiality' | 'integrity' | 'availability' | 'combined'
  exploitability?: 'low' | 'medium' | 'high'
  cveIds?: string[]
  ghsaIds?: string[]
  evidence?: string[]
  patchedVersions?: string[]
}

export interface SecurityAnalysis {
  hasSecurityIssues: boolean
  vulnerabilities: SecurityVulnerability[]
  overallSeverity: SecurityOverallSeverity
  riskScore: number
  confidence: SecurityConfidence
  reasoning: string[]
  recommendedAction:
    | 'proceed'
    | 'routine_update'
    | 'scheduled_update'
    | 'urgent_update'
    | 'immediate_update'
    | 'manual_testing'
    | 'review_required'
    | 'block_until_patched'
    | 'investigate'
  cveCount: number
  ghsaCount: number
  supplyChainRisk: SupplyChainRisk
}
