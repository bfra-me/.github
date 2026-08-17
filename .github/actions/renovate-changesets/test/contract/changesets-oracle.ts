import {spawnSync} from 'node:child_process'
import {promises as fs} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'

export interface OracleDiagnostics {
  errors: string[]
  warnings: string[]
  outputs: Map<string, string>
}

export interface ChangesetsOracleResult {
  releasePlan: {
    changesets: unknown[]
    releases: {name: string; type: string}[]
    [key: string]: unknown
  }
  filenames: string[]
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../')
const cliPath = path.join(repoRoot, 'node_modules/@changesets/cli/bin.js')

export async function listGeneratedChangesets(workspace: string): Promise<string[]> {
  const changesetDir = path.join(workspace, '.changeset')
  const entries = await fs.readdir(changesetDir, {withFileTypes: true})
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => `.changeset/${entry.name}`)
    .sort()
}

export async function runChangesetsOracle(
  scenarioName: string,
  workspace: string,
  diagnostics: OracleDiagnostics,
): Promise<ChangesetsOracleResult> {
  const filenames = await listGeneratedChangesets(workspace)
  const result = spawnSync(
    process.execPath,
    [cliPath, 'status', '--output', '.contract-release-plan.json'],
    {
      cwd: workspace,
      encoding: 'utf8',
      env: {...process.env, CI: 'true', NO_COLOR: '1'},
    },
  )

  if (result.status !== 0) {
    const contents = await Promise.all(
      filenames.map(
        async filename =>
          [filename, await fs.readFile(path.join(workspace, filename), 'utf8')] as [string, string],
      ),
    )
    throw new Error(
      formatOracleFailure({
        scenarioName,
        exitCode: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        filenames,
        contents,
        diagnostics,
      }),
    )
  }

  const releasePlanPath = path.join(workspace, '.contract-release-plan.json')
  let releasePlan: ChangesetsOracleResult['releasePlan']
  try {
    releasePlan = JSON.parse(
      await fs.readFile(releasePlanPath, 'utf8'),
    ) as ChangesetsOracleResult['releasePlan']
  } catch (error) {
    throw new Error(
      formatOracleFailure({
        scenarioName,
        exitCode: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        filenames,
        contents: [],
        diagnostics,
        parseError: error instanceof Error ? error.message : String(error),
      }),
    )
  }

  return {releasePlan, filenames}
}

function formatOracleFailure(params: {
  scenarioName: string
  exitCode: number | null
  stdout: string
  stderr: string
  filenames: string[]
  contents: [string, string][]
  diagnostics: OracleDiagnostics
  parseError?: string
}): string {
  const redact = (value: string): string => value.replaceAll('contract-token', '[REDACTED]')
  return [
    `Changesets oracle failed for scenario ${params.scenarioName}`,
    `exit code: ${params.exitCode}`,
    `stdout:\n${redact(params.stdout)}`,
    `stderr:\n${redact(params.stderr)}`,
    params.parseError == null ? '' : `parse error: ${redact(params.parseError)}`,
    `generated changeset filenames: ${JSON.stringify(params.filenames)}`,
    `generated changeset contents: ${JSON.stringify(
      Object.fromEntries(params.contents.map(([filename, content]) => [filename, redact(content)])),
    )}`,
    `captured core errors: ${JSON.stringify(params.diagnostics.errors.map(redact))}`,
    `captured core warnings: ${JSON.stringify(params.diagnostics.warnings.map(redact))}`,
    `captured outputs: ${JSON.stringify(Object.fromEntries(params.diagnostics.outputs))}`,
  ]
    .filter(Boolean)
    .join('\n')
}
