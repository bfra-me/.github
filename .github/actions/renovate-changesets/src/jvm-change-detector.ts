import type {Octokit} from '@octokit/rest'
import type {JVMDependencyChange} from './detectors/jvm-detector-types.js'
import {Buffer} from 'node:buffer'
import {
  isGradleFile,
  isJVMBuildFile,
  isMavenFile,
  isPropertiesFile,
} from './detectors/jvm-file-classifier.js'
import {parseGradleChanges} from './detectors/jvm-gradle-parser.js'
import {parseMavenChanges} from './detectors/jvm-maven-parser.js'
import {parsePropertiesChanges} from './detectors/jvm-properties-parser.js'
import {deduplicateChanges} from './detectors/jvm-version-comparator.js'

export type {
  GradleDependency,
  JVMDependencyChange,
  JVMDependencyType,
  MavenCoordinate,
  MavenPOM,
} from './detectors/jvm-detector-types.js'

export class JVMChangeDetector {
  async detectChangesFromPR(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    files: {filename: string; status: string; additions: number; deletions: number}[],
  ): Promise<JVMDependencyChange[]> {
    const changes: JVMDependencyChange[] = []

    for (const file of files.filter(({filename}) => isJVMBuildFile(filename))) {
      try {
        changes.push(...(await this.analyzeJVMFile(octokit, owner, repo, prNumber, file.filename)))
      } catch (error) {
        console.warn(`Failed to analyze JVM file ${file.filename}: ${error}`)
      }
    }

    return deduplicateChanges(changes)
  }

  private async analyzeJVMFile(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    filename: string,
  ): Promise<JVMDependencyChange[]> {
    try {
      const {data: comparison} = await octokit.rest.repos.compareCommits({
        owner,
        repo,
        base: `refs/pull/${prNumber}/base`,
        head: `refs/pull/${prNumber}/head`,
      })
      const patch = comparison.files?.find(file => file.filename === filename)?.patch
      if (patch == null) return []
      if (isGradleFile(filename)) return parseGradleChanges(filename, patch)
      if (isMavenFile(filename)) {
        return parseMavenChanges({
          filename,
          prNumber,
          loadContent: async (path, ref) => this.getFileContent(octokit, owner, repo, path, ref),
        })
      }
      if (isPropertiesFile(filename)) return parsePropertiesChanges(filename, patch)
      return []
    } catch (error) {
      console.warn(`Error analyzing JVM file ${filename}: ${error}`)
      return []
    }
  }

  private async getFileContent(
    octokit: Octokit,
    owner: string,
    repo: string,
    path: string,
    ref: string,
  ): Promise<string | null> {
    try {
      const {data} = await octokit.rest.repos.getContent({owner, repo, path, ref})
      return 'content' in data ? Buffer.from(data.content, 'base64').toString('utf8') : null
    } catch (error) {
      console.warn(`Failed to get file content for ${path} at ${ref}: ${error}`)
      return null
    }
  }
}
