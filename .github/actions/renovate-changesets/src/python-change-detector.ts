import type {Octokit} from '@octokit/rest'
import type {PythonDependencyChange} from './detectors/python-detector-types.js'
import {Buffer} from 'node:buffer'
import path from 'node:path'
import {parsePackageManagerChanges} from './detectors/python-package-manager-analyzer.js'
import {parseRequirementsChanges} from './detectors/python-requirements-parser.js'
import {deduplicateChanges} from './detectors/python-version-comparator.js'

export type {
  Pipfile,
  PipfileLock,
  PythonDependencyChange,
  PythonDependencyType,
  PythonVersion,
  RequirementsEntry,
} from './detectors/python-detector-types.js'

const PYTHON_FILE_PATTERNS = [
  /^requirements.*\.txt$/i,
  /^Pipfile$/i,
  /^Pipfile\.lock$/i,
  /^pyproject\.toml$/i,
  /^setup\.py$/i,
  /^setup\.cfg$/i,
  /^poetry\.lock$/i,
  /^constraints.*\.txt$/i,
  /^dev-requirements.*\.txt$/i,
  /^test-requirements.*\.txt$/i,
  /.*requirements.*\.txt$/i,
] as const

export class PythonChangeDetector {
  async detectChangesFromPR(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    files: {filename: string; status: string; additions: number; deletions: number}[],
  ): Promise<PythonDependencyChange[]> {
    const changes: PythonDependencyChange[] = []

    for (const file of files.filter(candidate => this.isPythonDependencyFile(candidate.filename))) {
      try {
        changes.push(
          ...(await this.analyzePythonFile(octokit, owner, repo, prNumber, file.filename)),
        )
      } catch (error) {
        console.warn(`Failed to analyze Python file ${file.filename}: ${error}`)
      }
    }

    return deduplicateChanges(changes)
  }

  private isPythonDependencyFile(filename: string): boolean {
    const baseName = path.basename(filename)
    return PYTHON_FILE_PATTERNS.some(pattern => pattern.test(baseName))
  }

  private async analyzePythonFile(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    filename: string,
  ): Promise<PythonDependencyChange[]> {
    try {
      const {data: comparison} = await octokit.rest.repos.compareCommits({
        owner,
        repo,
        base: `refs/pull/${prNumber}/base`,
        head: `refs/pull/${prNumber}/head`,
      })
      const patch = comparison.files?.find(file => file.filename === filename)?.patch
      if (patch == null) return []
      if (this.isRequirementsFile(filename)) return parseRequirementsChanges(filename, patch)
      if (this.isPackageManagerFile(filename)) {
        return parsePackageManagerChanges({
          filename,
          prNumber,
          loadContent: async (filePath, ref) =>
            this.getFileContent(octokit, owner, repo, filePath, ref),
        })
      }
      return []
    } catch (error) {
      console.warn(`Error analyzing Python file ${filename}: ${error}`)
      return []
    }
  }

  private isRequirementsFile(filename: string): boolean {
    const baseName = path.basename(filename)
    return /requirements.*\.txt$/i.test(baseName) || /constraints.*\.txt$/i.test(baseName)
  }

  private isPackageManagerFile(filename: string): boolean {
    const baseName = path.basename(filename)
    return ['Pipfile', 'Pipfile.lock', 'poetry.lock', 'pyproject.toml'].includes(baseName)
  }

  private async getFileContent(
    octokit: Octokit,
    owner: string,
    repo: string,
    filePath: string,
    ref: string,
  ): Promise<string | null> {
    try {
      const {data} = await octokit.rest.repos.getContent({owner, repo, path: filePath, ref})
      return 'content' in data ? Buffer.from(data.content, 'base64').toString('utf8') : null
    } catch (error) {
      console.warn(`Failed to get file content for ${filePath} at ${ref}: ${error}`)
      return null
    }
  }
}
