import type {Octokit} from '@octokit/rest'
import type {
  DependencyChange,
  PackageJson,
  PackageLockJson,
  PnpmLockYaml,
} from './detectors/npm-detector-types.js'
import {Buffer} from 'node:buffer'
import {promises as fs} from 'node:fs'
import path from 'node:path'
import {load} from 'js-yaml'
import {
  comparePackageLock,
  comparePnpmLock,
  compareYarnLock,
} from './detectors/npm-lockfile-analyzer.js'
import {
  extractDependenciesFromPackageLock,
  extractDependenciesFromPnpmLock,
} from './detectors/npm-lockfile-parser.js'
import {
  comparePackageJson,
  extractDependenciesFromPackageJson,
} from './detectors/npm-package-parser.js'
import {deduplicateChanges} from './detectors/npm-version-comparator.js'

export type {
  DependencyChange,
  LockFileDependency,
  NPMDependencyType,
  PackageJson,
  PackageLockJson,
  PnpmLockYaml,
  YarnLockEntry,
} from './detectors/npm-detector-types.js'

const NPM_FILE_PATTERNS = [
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'npm-shrinkwrap.json',
] as const

export class NPMChangeDetector {
  async detectChangesFromPR(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    files: {filename: string; status: string; additions: number; deletions: number}[],
  ): Promise<DependencyChange[]> {
    const changes: DependencyChange[] = []
    for (const file of files.filter(candidate => this.isNPMFile(candidate.filename))) {
      changes.push(...(await this.analyzeFileChanges(octokit, owner, repo, prNumber, file)))
    }

    return deduplicateChanges(changes)
  }

  async detectChangesFromFiles(
    workingDirectory: string,
    changedFiles: string[],
  ): Promise<DependencyChange[]> {
    const changes: DependencyChange[] = []
    for (const file of changedFiles.filter(candidate => this.isNPMFile(candidate))) {
      changes.push(
        ...(await this.analyzeLocalFileChanges(path.resolve(workingDirectory, file), file)),
      )
    }

    return deduplicateChanges(changes)
  }

  private isNPMFile(filename: string): boolean {
    return NPM_FILE_PATTERNS.some(
      pattern => filename.endsWith(pattern) || filename.includes(`/${pattern}`),
    )
  }

  private async analyzeFileChanges(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    file: {filename: string; status: string; additions: number; deletions: number},
  ): Promise<DependencyChange[]> {
    try {
      if (!octokit?.rest?.pulls?.get) {
        console.warn(
          `GitHub API methods not available for ${file.filename}, skipping detailed analysis`,
        )
        return []
      }

      const {data: prData} = await octokit.rest.pulls.get({owner, repo, pull_number: prNumber})
      const baseContent = await this.getFileContent(
        octokit,
        owner,
        repo,
        prData.base.sha,
        file.filename,
      )
      const headContent = await this.getFileContent(
        octokit,
        owner,
        repo,
        prData.head.sha,
        file.filename,
      )
      return this.compareFileContents(file.filename, baseContent, headContent)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.warn(`Failed to analyze file ${file.filename}: ${errorMessage}`)
      return []
    }
  }

  private async analyzeLocalFileChanges(
    filePath: string,
    relativePath: string,
  ): Promise<DependencyChange[]> {
    try {
      return this.parseFileForDependencies(relativePath, await fs.readFile(filePath, 'utf8'))
    } catch (error) {
      console.warn(`Failed to analyze local file ${filePath}:`, error)
      return []
    }
  }

  private async getFileContent(
    octokit: Octokit,
    owner: string,
    repo: string,
    sha: string,
    filePath: string,
  ): Promise<string | null> {
    try {
      const {data} = await octokit.rest.repos.getContent({owner, repo, path: filePath, ref: sha})
      if ('content' in data && data.content)
        return Buffer.from(data.content, 'base64').toString('utf8')
    } catch {}

    return null
  }

  private compareFileContents(
    filename: string,
    baseContent: string | null,
    headContent: string | null,
  ): DependencyChange[] {
    if (headContent == null) return []
    if (baseContent == null) return this.parseFileForDependencies(filename, headContent)
    if (filename.endsWith('package.json'))
      return comparePackageJson(filename, baseContent, headContent)
    if (filename.endsWith('package-lock.json'))
      return comparePackageLock(filename, baseContent, headContent)
    if (filename.endsWith('pnpm-lock.yaml'))
      return comparePnpmLock(filename, baseContent, headContent)
    if (filename.endsWith('yarn.lock')) return compareYarnLock(filename, baseContent, headContent)
    return []
  }

  private parseFileForDependencies(filename: string, content: string): DependencyChange[] {
    try {
      if (filename.endsWith('package.json')) {
        return extractDependenciesFromPackageJson(filename, JSON.parse(content) as PackageJson)
      }

      if (filename.endsWith('package-lock.json')) {
        return extractDependenciesFromPackageLock(filename, JSON.parse(content) as PackageLockJson)
      }

      if (filename.endsWith('pnpm-lock.yaml')) {
        return extractDependenciesFromPnpmLock(filename, load(content) as PnpmLockYaml)
      }
    } catch (error) {
      console.warn(`Failed to parse ${filename}:`, error)
    }

    return []
  }
}
