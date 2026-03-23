import type {Octokit} from '@octokit/rest'
import type {RenovatePRContext} from './renovate-parser'
import process from 'node:process'
import * as core from '@actions/core'
import {analyzeBreakingChanges} from './breaking-change-detector'
import {detectDockerChangesFromPR} from './docker-change-detector'
import {detectGHAChangesFromPR} from './github-actions-change-detector'
import {detectGoChangesFromPR} from './go-change-detector'
import {detectJVMChangesFromPR} from './jvm-change-detector'
import {detectNPMChangesFromPR} from './npm-change-detector'
import {detectPythonChangesFromPR} from './python-change-detector'
import {analyzeSecurityVulnerabilities} from './security-vulnerability-detector'

interface ChangedPRFile {
  filename: string
  status: string
  additions: number
  deletions: number
}
export interface DetectorRunnerParams {
  octokit: Octokit
  owner: string
  repo: string
  prNumber: number
  files: ChangedPRFile[]
  prContext: RenovatePRContext
}

type DetectFromPR = (
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  files: ChangedPRFile[],
) => Promise<unknown[]>

function toRenovateDep(
  change: unknown,
  config: {
    versionField: string
    newVersionField: string
    packageFileField: string
    detect: DetectFromPR
  },
): RenovatePRContext['dependencies'][number] {
  const dep = change as Record<string, unknown>
  const rawCurrent = dep[config.versionField] as string | undefined
  const rawNew = dep[config.newVersionField] as string | undefined
  const baseInline = dep.baseInlineVersionComment as string | undefined
  const headInline = dep.inlineVersionComment as string | undefined
  return {
    name: dep.name as string,
    currentVersion: baseInline ?? rawCurrent,
    newVersion: headInline ?? rawNew,
    manager: dep.manager as RenovatePRContext['dependencies'][number]['manager'],
    updateType: dep.updateType as RenovatePRContext['dependencies'][number]['updateType'],
    isSecurityUpdate: dep.isSecurityUpdate as boolean,
    isGrouped: false,
    packageFile: dep[config.packageFileField] as string | undefined,
    scope: dep.scope as string | undefined,
  }
}
export async function runDetectors({
  octokit,
  owner,
  repo,
  prNumber,
  files,
  prContext,
}: DetectorRunnerParams): Promise<{enhancedDependencies: RenovatePRContext['dependencies']}> {
  let enhancedDependencies = prContext.dependencies
  const detectorConfigs = [
    {
      label: 'NPM',
      managers: ['npm', 'pnpm', 'yarn', 'lockfile'],
      detect: detectNPMChangesFromPR,
      versionField: 'currentVersion',
      newVersionField: 'newVersion',
      packageFileField: 'packageFile',
    },
    {
      label: 'GitHub Actions',
      managers: ['github-actions'],
      detect: detectGHAChangesFromPR,
      versionField: 'currentRef',
      newVersionField: 'newRef',
      packageFileField: 'workflowFile',
    },
    {
      label: 'Docker',
      managers: ['docker', 'dockerfile', 'docker-compose'],
      detect: detectDockerChangesFromPR,
      versionField: 'currentTag',
      newVersionField: 'newTag',
      packageFileField: 'dockerFile',
    },
    {
      label: 'Python',
      managers: ['pip', 'pipenv', 'poetry', 'setuptools', 'pip-compile', 'pip_setup'],
      detect: detectPythonChangesFromPR,
      versionField: 'currentVersion',
      newVersionField: 'newVersion',
      packageFileField: 'packageFile',
    },
    {
      label: 'JVM',
      managers: ['gradle', 'maven', 'gradle-wrapper', 'sbt'],
      detect: detectJVMChangesFromPR,
      versionField: 'currentVersion',
      newVersionField: 'newVersion',
      packageFileField: 'buildFile',
    },
    {
      label: 'Go',
      managers: ['gomod', 'go', 'golang'],
      detect: detectGoChangesFromPR,
      versionField: 'currentVersion',
      newVersionField: 'newVersion',
      packageFileField: 'modFile',
    },
  ]
  for (const config of detectorConfigs) {
    if (!config.managers.includes(prContext.manager)) continue
    const isTestEnv = Boolean(process.env.VITEST) || process.env.NODE_ENV === 'test'
    if (isTestEnv) {
      core.info(
        `${config.label} update detected, but running in test environment - using standard parsing`,
      )
      continue
    }
    core.info(
      `Detected ${config.label.toLowerCase()} update, using enhanced ${config.label.toLowerCase()} change detector`,
    )
    try {
      const changes = await config.detect(octokit, owner, repo, prNumber, files)
      if (changes != null && changes.length > 0) {
        core.info(`${config.label} change detector found ${changes.length} dependency changes`)
        const converted = changes.map(change => toRenovateDep(change, config))
        for (const dep of converted) {
          const existingIndex = enhancedDependencies.findIndex(d => d.name === dep.name)
          if (existingIndex === -1) {
            enhancedDependencies = [...enhancedDependencies, dep]
          } else {
            const existing = enhancedDependencies[existingIndex]
            if (existing != null) {
              enhancedDependencies[existingIndex] = {
                ...existing,
                ...dep,
                scope: dep.scope ?? existing.scope,
                groupName: dep.groupName ?? existing.groupName,
                isSecurityUpdate: dep.isSecurityUpdate || existing.isSecurityUpdate,
                isGrouped: dep.isGrouped || existing.isGrouped,
                securitySeverity: dep.securitySeverity ?? existing.securitySeverity,
              }
            }
          }
        }
        core.info(`Enhanced dependency list: ${enhancedDependencies.map(d => d.name).join(', ')}`)
      } else {
        core.info(`${config.label} change detector found no additional dependency changes`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      core.warning(
        `${config.label} change detector failed, continuing with original parsing: ${errorMessage}`,
      )
    }
  }
  core.info('Running enhanced breaking change detection and security vulnerability analysis')
  for (const dependency of enhancedDependencies) {
    try {
      if (!process.env.VITEST && process.env.NODE_ENV !== 'test') {
        const breakingAnalysis = await analyzeBreakingChanges(dependency, {
          octokit,
          owner,
          repo,
          prNumber,
        })
        const securityAnalysis = await analyzeSecurityVulnerabilities(dependency, {
          prContentOrOctokit: octokit,
          owner,
          repo,
          prNumber,
        })
        if (breakingAnalysis.hasBreakingChanges) {
          core.warning(
            `Breaking changes detected for ${dependency.name}: ${breakingAnalysis.overallSeverity} severity, ${breakingAnalysis.indicators.length} indicators`,
          )
        }
        if (securityAnalysis.hasSecurityIssues) {
          const securitySummary = `Security issues detected for ${dependency.name}: ${securityAnalysis.overallSeverity} severity, ${securityAnalysis.vulnerabilities.length} vulnerabilities, risk score ${securityAnalysis.riskScore}`
          if (
            securityAnalysis.overallSeverity === 'critical' ||
            securityAnalysis.overallSeverity === 'high'
          ) {
            core.error(securitySummary)
          } else {
            core.warning(securitySummary)
          }
        }
        core.debug(
          `Enhanced analysis for ${dependency.name}: ${JSON.stringify({
            breakingChanges: breakingAnalysis.hasBreakingChanges,
            breakingSeverity: breakingAnalysis.overallSeverity,
            securityIssues: securityAnalysis.hasSecurityIssues,
            securitySeverity: securityAnalysis.overallSeverity,
            riskScore: securityAnalysis.riskScore,
          })}`,
        )
      } else {
        core.debug(`Skipping enhanced analysis for ${dependency.name} in test environment`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      core.warning(`Enhanced analysis failed for ${dependency.name}: ${errorMessage}`)
    }
  }
  return {enhancedDependencies}
}
