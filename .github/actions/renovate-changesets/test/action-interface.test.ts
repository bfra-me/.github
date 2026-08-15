import {load} from 'js-yaml'
import {describe, expect, it, vi} from 'vitest'

interface ActionManifest {
  inputs?: Record<string, unknown>
  outputs?: Record<string, unknown>
}

const baselineInputs = [
  'branch-prefix',
  'comment-pr',
  'update-pr-description',
  'commit-back',
  'commit-message-template',
  'config-file',
  'config',
  'default-changeset-type',
  'exclude-patterns',
  'skip-branch-prefix-check',
  'sort',
  'emoji',
  'target-package',
  'token',
  'working-directory',
  'auto-resolve-conflicts',
  'max-retries',
  'retry-delay',
  'update-grouped-prs',
  'max-grouped-prs',
  'grouped-pr-failure-strategy',
  'skip-current-pr-in-group',
]

const baselineOutputs = [
  'changesets-created',
  'changeset-files',
  'update-type',
  'dependencies',
  'changeset-summary',
  'primary-category',
  'all-categories',
  'categorization-summary',
  'security-updates',
  'breaking-changes',
  'high-priority-updates',
  'average-risk-level',
  'categorization-confidence',
  'multi-package-strategy',
  'workspace-packages-count',
  'package-relationships-count',
  'affected-packages',
  'multi-package-reasoning',
  'commit-success',
  'commit-sha',
  'committed-files',
  'git-error',
  'push-success',
  'push-error',
  'conflicts-resolved',
  'conflict-resolution',
  'branch-updated',
  'retry-attempts',
  'pr-description-updated',
  'pr-description-error',
  'pr-comment-created',
  'pr-comment-error',
  'grouped-prs-enabled',
  'grouped-prs-found',
  'grouped-prs-updated',
  'grouped-prs-failed',
  'grouped-pr-strategy',
  'grouped-pr-identifier',
  'grouped-pr-results',
]

async function readManifest(): Promise<ActionManifest> {
  const fileSystem = await vi.importActual<typeof import('node:fs')>('node:fs')
  const manifest = load(fileSystem.readFileSync(new URL('../action.yaml', import.meta.url), 'utf8'))
  return manifest as ActionManifest
}

describe('action interface compatibility', () => {
  it('keeps every baseline input and output declared', async () => {
    const manifest = await readManifest()
    const inputs = manifest.inputs ?? {}
    const outputs = manifest.outputs ?? {}

    for (const input of baselineInputs) expect(inputs).toHaveProperty(input)
    for (const output of baselineOutputs) expect(outputs).toHaveProperty(output)
  })
})
