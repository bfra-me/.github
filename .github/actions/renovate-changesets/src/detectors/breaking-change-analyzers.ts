import type {Octokit} from '@octokit/rest'
import type {BreakingChangeIndicator} from '../breaking-change-detector.js'
import type {RenovateDependency} from '../renovate-parser.js'
import {detectEcosystem, FRAMEWORK_PATTERNS} from './breaking-change-patterns.js'

export function analyzeVersionBreaking(dependency: RenovateDependency): BreakingChangeIndicator[] {
  const indicators: BreakingChangeIndicator[] = []
  const currentVersion = parseSemanticVersion(dependency.currentVersion)
  const newVersion = parseSemanticVersion(dependency.newVersion)

  if (!currentVersion || !newVersion) {
    return indicators
  }

  if (newVersion.major > currentVersion.major) {
    indicators.push({
      type: 'major_version',
      severity: 'high',
      description: `Major version update from ${dependency.currentVersion} to ${dependency.newVersion}`,
      evidence: [`Version change: ${dependency.currentVersion} → ${dependency.newVersion}`],
      confidence: 'high',
    })
  }

  if (currentVersion.major === 0 && newVersion.minor > currentVersion.minor) {
    indicators.push({
      type: 'major_version',
      severity: 'medium',
      description: 'Minor version bump in 0.x.x version (potentially breaking)',
      evidence: [
        `0.x.x version update: ${dependency.currentVersion} → ${dependency.newVersion}`,
        '0.x.x versions may include breaking changes in minor updates',
      ],
      confidence: 'medium',
    })
  }

  if (
    currentVersion.prerelease &&
    !newVersion.prerelease &&
    newVersion.major > currentVersion.major
  ) {
    indicators.push({
      type: 'major_version',
      severity: 'high',
      description: 'Graduation from pre-release to stable major version',
      evidence: [
        `Pre-release to stable: ${dependency.currentVersion} → ${dependency.newVersion}`,
        'Major version graduation often includes breaking changes',
      ],
      confidence: 'high',
    })
  }

  return indicators
}

export function analyzeEcosystemBreaking(
  dependency: RenovateDependency,
): BreakingChangeIndicator[] {
  const indicators: BreakingChangeIndicator[] = []
  const ecosystem = detectEcosystem(dependency.name, dependency.manager)
  const patterns = FRAMEWORK_PATTERNS[ecosystem]

  if (!patterns) {
    return indicators
  }

  const dependencyNameLower = dependency.name.toLowerCase()
  const corePackages = [
    'react',
    'vue',
    'angular',
    'express',
    'typescript',
    'webpack',
    'babel',
    'eslint',
    'prettier',
  ]

  if (corePackages.some(pkg => dependencyNameLower.includes(pkg))) {
    indicators.push({
      type: 'ecosystem_specific',
      severity: 'medium',
      description: `Core ${ecosystem} package update may include breaking changes`,
      evidence: [
        `Core package: ${dependency.name}`,
        `Ecosystem: ${ecosystem}`,
        'Core packages more likely to introduce breaking changes',
      ],
      confidence: 'medium',
    })
  }

  if (
    ecosystem === 'typescript' &&
    (dependencyNameLower.includes('types') || dependencyNameLower.includes('typescript'))
  ) {
    indicators.push({
      type: 'ecosystem_specific',
      severity: 'medium',
      description: 'TypeScript or type definitions update may require code changes',
      evidence: [
        `TypeScript related package: ${dependency.name}`,
        'Type definition changes can require code modifications',
      ],
      confidence: 'medium',
    })
  }

  return indicators
}

export async function analyzePRContentBreaking(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<BreakingChangeIndicator[]> {
  const indicators: BreakingChangeIndicator[] = []

  try {
    const {data: pr} = await octokit.rest.pulls.get({owner, repo, pull_number: prNumber})
    const prContent = `${pr.title} ${pr.body || ''}`.toLowerCase()

    const breakingKeywords = [
      'breaking change',
      'breaking changes',
      'breaking:',
      'major change',
      'api change',
      'deprecated',
      'removed',
      'incompatible',
      'migration required',
      'upgrade guide',
    ]
    const foundKeywords = breakingKeywords.filter(keyword => prContent.includes(keyword))

    if (foundKeywords.length > 0) {
      indicators.push({
        type: 'api_deprecation',
        severity: foundKeywords.some(k => k.includes('breaking') || k.includes('removed'))
          ? 'high'
          : 'medium',
        description: 'PR description mentions breaking changes or deprecations',
        evidence: foundKeywords.map(keyword => `Found keyword: "${keyword}"`),
        confidence: 'high',
      })
    }

    const {data: files} = await octokit.rest.pulls.listFiles({owner, repo, pull_number: prNumber})
    const configFiles = files.filter(file =>
      [
        'package.json',
        'tsconfig.json',
        '.eslintrc',
        'webpack.config',
        'babel.config',
        'next.config',
        'vue.config',
        'angular.json',
      ].some(configFile => file.filename.includes(configFile)),
    )

    if (configFiles.length > 0) {
      indicators.push({
        type: 'config_change',
        severity: 'medium',
        description: 'Configuration files modified alongside dependency update',
        evidence: configFiles.map(file => `Modified config: ${file.filename}`),
        confidence: 'medium',
      })
    }
  } catch (error) {
    console.warn('Failed to analyze PR content:', error)
  }

  return indicators
}

export function analyzeReleaseNotesBreaking(
  dependency: RenovateDependency,
): BreakingChangeIndicator[] {
  const indicators: BreakingChangeIndicator[] = []
  const ecosystem = detectEcosystem(dependency.name, dependency.manager)
  const patterns = FRAMEWORK_PATTERNS[ecosystem]

  if (patterns) {
    const newVersion = dependency.newVersion?.toLowerCase() || ''

    if (newVersion.includes('.0.0') && !newVersion.startsWith('0.')) {
      indicators.push({
        type: 'major_version',
        severity: 'high',
        description: 'Major version release (.0.0) likely includes breaking changes',
        evidence: [`Version pattern: ${dependency.newVersion}`, 'x.0.0 releases often break APIs'],
        confidence: 'medium',
      })
    }

    if (
      newVersion.includes('alpha') ||
      newVersion.includes('beta') ||
      newVersion.includes('rc') ||
      newVersion.includes('pre')
    ) {
      indicators.push({
        type: 'major_version',
        severity: 'medium',
        description: 'Pre-release version may include unstable or breaking changes',
        evidence: [
          `Pre-release version: ${dependency.newVersion}`,
          'Pre-release versions may include breaking changes',
        ],
        confidence: 'medium',
      })
    }
  }

  return indicators
}

export function parseSemanticVersion(version?: string): {
  major: number
  minor: number
  patch: number
  prerelease?: string
} | null {
  if (!version) return null

  const cleanVersion = version.replace(/^[v^~>=<]+/, '').trim()
  const match = cleanVersion.match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-z\d-]+(?:\.[a-z\d-]+)*))?/i)

  if (!match?.[1] || !match?.[2] || !match?.[3]) return null

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4],
  }
}
