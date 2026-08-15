import type {RenovatePRContext} from '../renovate-parser'
import type {ImpactAssessment} from '../semver-impact-assessor'
import type {SummaryGeneratorConfig} from '../summary-generator-types'
import type {SummaryContexts} from './summary-contexts'

import {
  generateAnsibleSummaryLogic,
  generateCargoSummaryLogic,
  generateCircleCISummaryLogic,
  generateComposerSummaryLogic,
  generateDockerSummaryLogic,
  generateGitHubActionsSummaryLogic,
  generateGitLabCISummaryLogic,
  generateHelmSummaryLogic,
  generateLockfileSummary,
  generateNpmSummaryLogic,
  generateNuGetSummaryLogic,
  generatePreCommitSummaryLogic,
  generateTerraformSummaryLogic,
} from './index'

export type ManagerSummaryFn = (
  pr: RenovatePRContext,
  impact: ImpactAssessment,
  deps: string[],
) => string

export function createManagerSummaries(
  contexts: SummaryContexts,
  config: SummaryGeneratorConfig,
): Record<string, ManagerSummaryFn> {
  const {ci, infrastructure, js, other} = contexts

  return {
    npm: (pr, impact, deps) => generateNpmSummaryLogic(js, pr, impact, deps),
    pnpm: (pr, impact, deps) => generateNpmSummaryLogic(js, pr, impact, deps),
    yarn: (pr, impact, deps) => generateNpmSummaryLogic(js, pr, impact, deps),
    'github-actions': (pr, impact, deps) => generateGitHubActionsSummaryLogic(js, pr, impact, deps),
    docker: (pr, impact, deps) => generateDockerSummaryLogic(infrastructure, pr, impact, deps),
    dockerfile: (pr, impact, deps) => generateDockerSummaryLogic(infrastructure, pr, impact, deps),
    'docker-compose': (pr, impact, deps) =>
      generateDockerSummaryLogic(infrastructure, pr, impact, deps),
    nuget: (pr, impact, deps) => generateNuGetSummaryLogic(other, pr, impact, deps),
    composer: (pr, impact, deps) => generateComposerSummaryLogic(other, pr, impact, deps),
    cargo: (pr, impact, deps) => generateCargoSummaryLogic(infrastructure, pr, impact, deps),
    helm: (pr, impact, deps) => generateHelmSummaryLogic(infrastructure, pr, impact, deps),
    terraform: (pr, impact, deps) =>
      generateTerraformSummaryLogic(infrastructure, pr, impact, deps),
    ansible: (pr, impact, deps) => generateAnsibleSummaryLogic(ci, pr, impact, deps),
    'pre-commit': (pr, impact, deps) => generatePreCommitSummaryLogic(ci, pr, impact, deps),
    gitlabci: (pr, impact, deps) => generateGitLabCISummaryLogic(ci, pr, impact, deps),
    circleci: (pr, impact, deps) => generateCircleCISummaryLogic(ci, pr, impact, deps),
    lockfile: (pr, impact, deps) => generateLockfileSummary(pr, impact, deps, config),
  }
}
