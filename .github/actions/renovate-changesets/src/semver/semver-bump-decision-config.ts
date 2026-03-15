import type {SemverBumpDecisionConfig} from './semver-bump-decision-types'

const defaultConfig: SemverBumpDecisionConfig = {
  defaultBumpType: 'patch',
  securityTakesPrecedence: true,
  breakingChangesAlwaysMajor: true,
  securityMinimumBumps: {
    low: 'patch',
    moderate: 'patch',
    high: 'minor',
    critical: 'minor',
  },
  managerSpecificRules: {
    'github-actions': {
      allowDowngrade: true,
      maxBumpType: 'minor',
      defaultBumpType: 'patch',
      majorAsMinor: true,
    },
    docker: {
      allowDowngrade: true,
      maxBumpType: 'minor',
      defaultBumpType: 'patch',
      majorAsMinor: false,
    },
    npm: {
      allowDowngrade: false,
      maxBumpType: 'major',
      defaultBumpType: 'patch',
      majorAsMinor: false,
    },
  },
  riskTolerance: {
    patchMaxRisk: 20,
    minorMaxRisk: 50,
    majorRiskThreshold: 80,
  },
  organizationRules: {
    conservativeMode: true,
    preferMinorForMajor: true,
    groupedUpdateHandling: 'conservative',
    dependencyPatternRules: [
      {
        pattern: /^@types\//,
        maxBumpType: 'patch',
      },
      {
        pattern: /eslint|prettier|typescript/,
        maxBumpType: 'patch',
      },
    ],
  },
}

export function mergeSemverBumpDecisionConfig(
  userConfig: Partial<SemverBumpDecisionConfig>,
): SemverBumpDecisionConfig {
  return {
    ...defaultConfig,
    ...userConfig,
    securityMinimumBumps: {
      ...defaultConfig.securityMinimumBumps,
      ...userConfig.securityMinimumBumps,
    },
    managerSpecificRules: {
      ...defaultConfig.managerSpecificRules,
      ...userConfig.managerSpecificRules,
    },
    riskTolerance: {
      ...defaultConfig.riskTolerance,
      ...userConfig.riskTolerance,
    },
    organizationRules: {
      ...defaultConfig.organizationRules,
      ...userConfig.organizationRules,
      dependencyPatternRules: [
        ...defaultConfig.organizationRules.dependencyPatternRules,
        ...(userConfig.organizationRules?.dependencyPatternRules ?? []),
      ],
    },
  }
}
