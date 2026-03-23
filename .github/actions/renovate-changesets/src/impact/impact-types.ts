import type {BreakingChangeAnalysis} from '../breaking-change-detector'
import type {RenovateSecurityType} from '../renovate-parser'
import type {SecurityAnalysis} from '../security-vulnerability-detector'

export interface SemverInfo {
  major: number
  minor: number
  patch: number
  prerelease?: string
  build?: string
  raw: string
  isValid: boolean
}

export type VersionChange = 'major' | 'minor' | 'patch' | 'prerelease' | 'none' | 'unknown'

export interface DependencyImpact {
  name: string
  currentVersion?: string
  newVersion?: string
  versionChange: VersionChange
  semverImpact: 'major' | 'minor' | 'patch'
  isBreaking: boolean
  isSecurityUpdate: boolean
  securitySeverity?: RenovateSecurityType
  isDowngrade: boolean
  isPrerelease: boolean
  confidence: 'high' | 'medium' | 'low'
  reasoning: string[]
  breakingChangeAnalysis?: BreakingChangeAnalysis
  securityAnalysis?: SecurityAnalysis
}

export interface ImpactAssessment {
  dependencies: DependencyImpact[]
  overallImpact: 'major' | 'minor' | 'patch'
  recommendedChangesetType: 'major' | 'minor' | 'patch'
  isSecurityUpdate: boolean
  hasBreakingChanges: boolean
  hasDowngrades: boolean
  hasPreleases: boolean
  confidence: 'high' | 'medium' | 'low'
  reasoning: string[]
  totalVulnerabilities: number
  highSeverityVulnerabilities: number
  criticalBreakingChanges: number
  overallRiskScore: number
}

export interface ImpactAssessmentOptions {
  securityMinimumPatch: boolean
  majorAsBreaking: boolean
  prereleaseAsLowerImpact: boolean
  defaultChangesetType: 'major' | 'minor' | 'patch'
  managerRules?: {
    [manager: string]: {
      majorAsBreaking?: boolean
      prereleaseHandling?: 'strict' | 'lenient'
      defaultImpact?: 'major' | 'minor' | 'patch'
    }
  }
}
