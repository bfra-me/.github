import type {Octokit} from '@octokit/rest'
import type {RenovatePRContext} from './renovate-parser'
import process from 'node:process'
import * as core from '@actions/core'
import {BreakingChangeDetector} from './breaking-change-detector'
import {DockerChangeDetector} from './docker-change-detector'
import {GitHubActionsChangeDetector} from './github-actions-change-detector'
import {GoChangeDetector} from './go-change-detector'
import {JVMChangeDetector} from './jvm-change-detector'
import {NPMChangeDetector} from './npm-change-detector'
import {PythonChangeDetector} from './python-change-detector'
import {SecurityVulnerabilityDetector} from './security-vulnerability-detector'

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
function toRenovateDep(
  change: unknown,
  config: {versionField: string; newVersionField: string; packageFileField: string},
): RenovatePRContext['dependencies'][number] {
  const dep = change as Record<string, unknown>
  return {
    name: dep.name as string,
    currentVersion: dep[config.versionField] as string | undefined,
    newVersion: dep[config.newVersionField] as string | undefined,
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
  const npmDetector = new NPMChangeDetector()
  const actionsDetector = new GitHubActionsChangeDetector()
  const dockerDetector = new DockerChangeDetector()
  const pythonDetector = new PythonChangeDetector()
  const jvmDetector = new JVMChangeDetector()
  const goDetector = new GoChangeDetector()
  let enhancedDependencies = prContext.dependencies
  const detectorConfigs = [
    {
      label: 'NPM',
      managers: ['npm', 'pnpm', 'yarn', 'lockfile'],
      detector: npmDetector,
      versionField: 'currentVersion',
      newVersionField: 'newVersion',
      packageFileField: 'packageFile',
    },
    {
      label: 'GitHub Actions',
      managers: ['github-actions'],
      detector: actionsDetector,
      versionField: 'currentRef',
      newVersionField: 'newRef',
      packageFileField: 'workflowFile',
    },
    {
      label: 'Docker',
      managers: ['docker', 'dockerfile', 'docker-compose'],
      detector: dockerDetector,
      versionField: 'currentTag',
      newVersionField: 'newTag',
      packageFileField: 'dockerFile',
    },
    {
      label: 'Python',
      managers: ['pip', 'pipenv', 'poetry', 'setuptools', 'pip-compile', 'pip_setup'],
      detector: pythonDetector,
      versionField: 'currentVersion',
      newVersionField: 'newVersion',
      packageFileField: 'packageFile',
    },
    {
      label: 'JVM',
      managers: ['gradle', 'maven', 'gradle-wrapper', 'sbt'],
      detector: jvmDetector,
      versionField: 'currentVersion',
      newVersionField: 'newVersion',
      packageFileField: 'buildFile',
    },
    {
      label: 'Go',
      managers: ['gomod', 'go', 'golang'],
      detector: goDetector,
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
      const changes = await config.detector.detectChangesFromPR(
        octokit,
        owner,
        repo,
        prNumber,
        files,
      )
      if (changes != null && changes.length > 0) {
        core.info(`${config.label} change detector found ${changes.length} dependency changes`)
        const converted = changes.map(change => toRenovateDep(change, config))
        enhancedDependencies = [...enhancedDependencies, ...converted]
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
  const breakingChangeDetector = new BreakingChangeDetector()
  const securityDetector = new SecurityVulnerabilityDetector()
  for (const dependency of enhancedDependencies) {
    try {
      if (!process.env.VITEST && process.env.NODE_ENV !== 'test') {
        const breakingAnalysis = await breakingChangeDetector.analyzeBreakingChanges(
          dependency,
          octokit,
          owner,
          repo,
          prNumber,
        )
        const securityAnalysis = await securityDetector.analyzeSecurityVulnerabilities(
          dependency,
          octokit,
          owner,
          repo,
          prNumber,
        )
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
