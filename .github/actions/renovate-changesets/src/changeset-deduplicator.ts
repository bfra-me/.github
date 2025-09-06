import type {ChangesetInfo} from './multi-package-changeset-generator'
import {promises as fs} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import * as core from '@actions/core'

/**
 * Configuration for changeset deduplication
 */
export interface ChangesetDeduplicationConfig {
  /**
   * Enable content-based deduplication (exact content match)
   */
  enableContentDeduplication: boolean

  /**
   * Enable semantic deduplication (same packages and dependencies)
   */
  enableSemanticDeduplication: boolean

  /**
   * Enable changeset merging for compatible overlapping changesets
   */
  enableChangesetMerging: boolean

  /**
   * Similarity threshold for semantic deduplication (0-1)
   */
  semanticSimilarityThreshold: number

  /**
   * Maximum number of changesets to merge together
   */
  maxMergeCount: number

  /**
   * Merge strategy for overlapping changesets
   */
  mergeStrategy: 'conservative' | 'aggressive' | 'disabled'

  /**
   * Preserve individual changeset metadata during merging
   */
  preserveMetadata: boolean

  /**
   * Working directory for changeset files
   */
  workingDirectory: string

  /**
   * Include existing changeset files in deduplication analysis
   */
  analyzeExistingChangesets: boolean

  /**
   * Maximum age of existing changesets to consider (in days)
   */
  maxExistingChangesetAge: number
}

/**
 * Result of deduplication analysis
 */
export interface DeduplicationResult {
  /**
   * Original changesets before deduplication
   */
  originalChangesets: ChangesetInfo[]

  /**
   * Final changesets after deduplication
   */
  deduplicatedChangesets: ChangesetInfo[]

  /**
   * Changesets that were removed as duplicates
   */
  removedDuplicates: ChangesetInfo[]

  /**
   * Changesets that were merged together
   */
  mergedChangesets: {
    merged: ChangesetInfo
    sources: ChangesetInfo[]
  }[]

  /**
   * Existing changesets that were found to be duplicates
   */
  existingDuplicates: string[]

  /**
   * Detailed reasoning for deduplication decisions
   */
  reasoning: string[]

  /**
   * Warnings about potential issues
   */
  warnings: string[]

  /**
   * Statistics about the deduplication process
   */
  stats: {
    totalOriginal: number
    totalFinal: number
    duplicatesRemoved: number
    changesetseMerged: number
    existingDuplicates: number
  }
}

/**
 * Information about an existing changeset file
 */
interface ExistingChangesetInfo {
  filename: string
  filePath: string
  content: string
  releases: {name: string; type: 'patch' | 'minor' | 'major'}[]
  summary: string
  createdAt: Date
  age: number // in days
}

/**
 * Changeset similarity analysis result
 */
interface SimilarityAnalysis {
  contentSimilarity: number
  packageOverlap: number
  dependencyOverlap: number
  semanticSimilarity: number
  isExactMatch: boolean
  isSimilar: boolean
  canMerge: boolean
  mergeRisk: 'low' | 'medium' | 'high'
}

/**
 * Advanced changeset deduplication engine for grouped updates
 *
 * Implements sophisticated deduplication logic that prevents duplicate changesets
 * from being created during grouped Renovate updates while preserving important
 * changeset metadata and relationships.
 */
export class ChangesetDeduplicator {
  private config: ChangesetDeduplicationConfig

  constructor(config: Partial<ChangesetDeduplicationConfig> = {}) {
    this.config = {
      enableContentDeduplication: config.enableContentDeduplication ?? true,
      enableSemanticDeduplication: config.enableSemanticDeduplication ?? true,
      enableChangesetMerging: config.enableChangesetMerging ?? true,
      semanticSimilarityThreshold: config.semanticSimilarityThreshold ?? 0.8,
      maxMergeCount: config.maxMergeCount ?? 5,
      mergeStrategy: config.mergeStrategy ?? 'conservative',
      preserveMetadata: config.preserveMetadata ?? true,
      workingDirectory: config.workingDirectory ?? process.cwd(),
      analyzeExistingChangesets: config.analyzeExistingChangesets ?? true,
      maxExistingChangesetAge: config.maxExistingChangesetAge ?? 30, // 30 days
      ...config,
    }
  }

  /**
   * Perform comprehensive deduplication on a list of changesets
   */
  async deduplicateChangesets(changesets: ChangesetInfo[]): Promise<DeduplicationResult> {
    const reasoning: string[] = []
    const warnings: string[] = []

    core.info('Starting changeset deduplication analysis')
    reasoning.push(`Starting deduplication with ${changesets.length} changesets`)
    reasoning.push(`Configuration: ${JSON.stringify(this.config, null, 2)}`)

    // Step 1: Analyze existing changesets in the repository
    let existingChangesets: ExistingChangesetInfo[] = []
    if (this.config.analyzeExistingChangesets) {
      existingChangesets = await this.analyzeExistingChangesets()
      reasoning.push(`Found ${existingChangesets.length} existing changesets to analyze`)
    }

    // Step 2: Content-based deduplication (exact matches)
    let deduplicatedChangesets = [...changesets]
    const contentDuplicates: ChangesetInfo[] = []

    if (this.config.enableContentDeduplication) {
      const contentResult = this.performContentDeduplication(deduplicatedChangesets)
      deduplicatedChangesets = contentResult.unique
      contentDuplicates.push(...contentResult.duplicates)
      reasoning.push(
        `Content deduplication: removed ${contentResult.duplicates.length} exact duplicates`,
      )
    }

    // Step 3: Semantic deduplication (similar packages and dependencies)
    const semanticDuplicates: ChangesetInfo[] = []

    if (this.config.enableSemanticDeduplication) {
      const semanticResult = this.performSemanticDeduplication(deduplicatedChangesets)
      deduplicatedChangesets = semanticResult.unique
      semanticDuplicates.push(...semanticResult.duplicates)
      reasoning.push(
        `Semantic deduplication: removed ${semanticResult.duplicates.length} similar changesets`,
      )
    }

    // Step 4: Changeset merging for compatible overlapping changesets
    const mergedChangesets: {merged: ChangesetInfo; sources: ChangesetInfo[]}[] = []

    if (this.config.enableChangesetMerging && this.config.mergeStrategy !== 'disabled') {
      const mergeResult = await this.performChangesetMerging(deduplicatedChangesets)
      deduplicatedChangesets = mergeResult.merged
      mergedChangesets.push(...mergeResult.mergeOperations)
      reasoning.push(
        `Changeset merging: merged ${mergeResult.mergeOperations.length} groups of changesets`,
      )
    }

    // Step 5: Check against existing changesets
    const existingDuplicates: string[] = []

    if (existingChangesets.length > 0) {
      const existingResult = this.checkAgainstExistingChangesets(
        deduplicatedChangesets,
        existingChangesets,
      )
      deduplicatedChangesets = existingResult.unique
      existingDuplicates.push(...existingResult.duplicateFiles)
      reasoning.push(
        `Existing changeset check: found ${existingResult.duplicateFiles.length} duplicates with existing files`,
      )
    }

    // Step 6: Final validation and warnings
    this.validateDeduplicationResult(deduplicatedChangesets, changesets, warnings)

    const result: DeduplicationResult = {
      originalChangesets: changesets,
      deduplicatedChangesets,
      removedDuplicates: [...contentDuplicates, ...semanticDuplicates],
      mergedChangesets,
      existingDuplicates,
      reasoning,
      warnings,
      stats: {
        totalOriginal: changesets.length,
        totalFinal: deduplicatedChangesets.length,
        duplicatesRemoved: contentDuplicates.length + semanticDuplicates.length,
        changesetseMerged: mergedChangesets.length,
        existingDuplicates: existingDuplicates.length,
      },
    }

    core.info(
      `Deduplication complete: ${result.stats.totalOriginal} → ${result.stats.totalFinal} changesets`,
    )
    return result
  }

  /**
   * Perform content-based deduplication (exact content matches)
   */
  private performContentDeduplication(changesets: ChangesetInfo[]): {
    unique: ChangesetInfo[]
    duplicates: ChangesetInfo[]
  } {
    const unique: ChangesetInfo[] = []
    const duplicates: ChangesetInfo[] = []
    const seenContent = new Set<string>()

    for (const changeset of changesets) {
      const contentHash = this.calculateChangesetContentHash(changeset)

      if (seenContent.has(contentHash)) {
        duplicates.push(changeset)
        core.info(`Content duplicate detected: ${changeset.id}`)
      } else {
        seenContent.add(contentHash)
        unique.push(changeset)
      }
    }

    return {unique, duplicates}
  }

  /**
   * Perform semantic deduplication (similar packages and dependencies)
   */
  private performSemanticDeduplication(changesets: ChangesetInfo[]): {
    unique: ChangesetInfo[]
    duplicates: ChangesetInfo[]
  } {
    const unique: ChangesetInfo[] = []
    const duplicates: ChangesetInfo[] = []
    const processed = new Set<string>()

    for (let i = 0; i < changesets.length; i++) {
      const changeset = changesets[i]

      if (!changeset || processed.has(changeset.id)) {
        continue
      }

      let foundSimilar = false

      // Compare with all remaining changesets
      for (let j = i + 1; j < changesets.length; j++) {
        const otherChangeset = changesets[j]

        if (!otherChangeset || processed.has(otherChangeset.id)) {
          continue
        }

        const similarity = this.analyzeSimilarity(changeset, otherChangeset)

        if (
          similarity.isSimilar &&
          similarity.semanticSimilarity >= this.config.semanticSimilarityThreshold
        ) {
          duplicates.push(otherChangeset)
          processed.add(otherChangeset.id)
          foundSimilar = true
          core.info(
            `Semantic duplicate detected: ${otherChangeset.id} (similarity: ${similarity.semanticSimilarity.toFixed(2)})`,
          )
        }
      }

      if (!foundSimilar) {
        unique.push(changeset)
      }

      processed.add(changeset.id)
    }

    return {unique, duplicates}
  }

  /**
   * Perform changeset merging for compatible overlapping changesets
   */
  private async performChangesetMerging(changesets: ChangesetInfo[]): Promise<{
    merged: ChangesetInfo[]
    mergeOperations: {merged: ChangesetInfo; sources: ChangesetInfo[]}[]
  }> {
    const merged: ChangesetInfo[] = []
    const mergeOperations: {merged: ChangesetInfo; sources: ChangesetInfo[]}[] = []
    const processed = new Set<string>()

    for (const changeset of changesets) {
      if (processed.has(changeset.id)) {
        continue
      }

      // Find changesets that can be merged with this one
      const mergeCandidates: ChangesetInfo[] = [changeset]
      processed.add(changeset.id)

      for (const otherChangeset of changesets) {
        if (
          processed.has(otherChangeset.id) ||
          mergeCandidates.length >= this.config.maxMergeCount
        ) {
          continue
        }

        const similarity = this.analyzeSimilarity(changeset, otherChangeset)

        if (similarity.canMerge && similarity.mergeRisk !== 'high') {
          mergeCandidates.push(otherChangeset)
          processed.add(otherChangeset.id)
          core.info(`Merge candidate found: ${otherChangeset.id} (risk: ${similarity.mergeRisk})`)
        }
      }

      if (mergeCandidates.length > 1) {
        // Merge the changesets
        const mergedChangeset = await this.mergeChangesets(mergeCandidates)
        merged.push(mergedChangeset)
        mergeOperations.push({
          merged: mergedChangeset,
          sources: mergeCandidates,
        })
        core.info(`Merged ${mergeCandidates.length} changesets into: ${mergedChangeset.id}`)
      } else {
        // Keep the changeset as-is
        merged.push(changeset)
      }
    }

    return {merged, mergeOperations}
  }

  /**
   * Check new changesets against existing changeset files
   */
  private checkAgainstExistingChangesets(
    changesets: ChangesetInfo[],
    existingChangesets: ExistingChangesetInfo[],
  ): {unique: ChangesetInfo[]; duplicateFiles: string[]} {
    const unique: ChangesetInfo[] = []
    const duplicateFiles: string[] = []

    for (const changeset of changesets) {
      let isDuplicate = false

      for (const existing of existingChangesets) {
        if (this.isChangesetDuplicateOfExisting(changeset, existing)) {
          duplicateFiles.push(existing.filename)
          isDuplicate = true
          core.info(
            `Duplicate of existing changeset detected: ${changeset.id} matches ${existing.filename}`,
          )
          break
        }
      }

      if (!isDuplicate) {
        unique.push(changeset)
      }
    }

    return {unique, duplicateFiles}
  }

  /**
   * Analyze existing changeset files in the repository
   */
  private async analyzeExistingChangesets(): Promise<ExistingChangesetInfo[]> {
    const existingChangesets: ExistingChangesetInfo[] = []
    const changesetDir = path.join(this.config.workingDirectory, '.changeset')

    try {
      if (!(await this.directoryExists(changesetDir))) {
        return existingChangesets
      }

      const files = await fs.readdir(changesetDir)
      const changesetFiles = files.filter(
        file => file.endsWith('.md') && !file.startsWith('README'),
      )

      for (const file of changesetFiles) {
        try {
          const filePath = path.join(changesetDir, file)
          const stat = await fs.stat(filePath)
          const age = Math.floor((Date.now() - stat.mtime.getTime()) / (1000 * 60 * 60 * 24))

          // Skip files that are too old
          if (age > this.config.maxExistingChangesetAge) {
            continue
          }

          const content = await fs.readFile(filePath, 'utf8')
          const parsed = this.parseExistingChangeset(content)

          if (parsed) {
            existingChangesets.push({
              filename: file,
              filePath,
              content,
              releases: parsed.releases,
              summary: parsed.summary,
              createdAt: stat.mtime,
              age,
            })
          }
        } catch (error) {
          core.warning(
            `Failed to analyze existing changeset ${file}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
    } catch (error) {
      core.warning(
        `Failed to read changeset directory: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    return existingChangesets
  }

  /**
   * Parse an existing changeset file
   */
  private parseExistingChangeset(
    content: string,
  ): {releases: {name: string; type: 'patch' | 'minor' | 'major'}[]; summary: string} | null {
    try {
      const lines = content.split('\n')
      let inFrontmatter = false
      const frontmatterLines: string[] = []
      const summaryLines: string[] = []
      let frontmatterEnded = false

      for (const line of lines) {
        if (line.trim() === '---') {
          if (inFrontmatter) {
            frontmatterEnded = true
            inFrontmatter = false
          } else {
            inFrontmatter = true
          }
          continue
        }

        if (inFrontmatter) {
          frontmatterLines.push(line)
        } else if (frontmatterEnded) {
          summaryLines.push(line)
        }
      }

      const releases: {name: string; type: 'patch' | 'minor' | 'major'}[] = []

      for (const line of frontmatterLines) {
        const match = line.match(/^['"]([^'"]+)['"]:\s*(patch|minor|major)$/)
        if (match && match[1] && match[2]) {
          releases.push({
            name: match[1],
            type: match[2] as 'patch' | 'minor' | 'major',
          })
        }
      }

      const summary = summaryLines.join('\n').trim()

      return {releases, summary}
    } catch {
      return null
    }
  }

  /**
   * Calculate a content hash for a changeset
   */
  private calculateChangesetContentHash(changeset: ChangesetInfo): string {
    const normalizedContent = {
      packages: [...changeset.packages].sort(),
      releases: changeset.releases
        .map(r => ({name: r.name, type: r.type}))
        .sort((a, b) => a.name.localeCompare(b.name)),
      summary: changeset.summary.trim().replaceAll(/\s+/g, ' '), // Normalize whitespace
    }

    return JSON.stringify(normalizedContent)
  }

  /**
   * Analyze similarity between two changesets
   */
  private analyzeSimilarity(
    changeset1: ChangesetInfo,
    changeset2: ChangesetInfo,
  ): SimilarityAnalysis {
    // Content similarity (exact match)
    const content1 = this.calculateChangesetContentHash(changeset1)
    const content2 = this.calculateChangesetContentHash(changeset2)
    const isExactMatch = content1 === content2
    const contentSimilarity = isExactMatch ? 1 : 0

    // Package overlap
    const packages1 = new Set(changeset1.packages)
    const packages2 = new Set(changeset2.packages)
    const packageIntersection = new Set([...packages1].filter(pkg => packages2.has(pkg)))
    const packageUnion = new Set([...packages1, ...packages2])
    const packageOverlap = packageUnion.size > 0 ? packageIntersection.size / packageUnion.size : 0

    // Dependency overlap (from metadata)
    const deps1 = new Set(changeset1.metadata.affectedDependencies)
    const deps2 = new Set(changeset2.metadata.affectedDependencies)
    const depIntersection = new Set([...deps1].filter(dep => deps2.has(dep)))
    const depUnion = new Set([...deps1, ...deps2])
    const dependencyOverlap = depUnion.size > 0 ? depIntersection.size / depUnion.size : 0

    // Semantic similarity (weighted combination)
    const semanticSimilarity = packageOverlap * 0.6 + dependencyOverlap * 0.4

    // Determine if changesets are similar
    const isSimilar = semanticSimilarity >= this.config.semanticSimilarityThreshold || isExactMatch

    // Determine if changesets can be merged
    const sameUpdateType =
      changeset1.metadata.isSecurityUpdate === changeset2.metadata.isSecurityUpdate
    const compatibleBreaking =
      changeset1.metadata.hasBreakingChanges === changeset2.metadata.hasBreakingChanges
    const hasOverlap = packageOverlap > 0 || dependencyOverlap > 0
    const canMerge =
      sameUpdateType && compatibleBreaking && hasOverlap && this.config.mergeStrategy !== 'disabled'

    // Assess merge risk
    let mergeRisk: 'low' | 'medium' | 'high' = 'low'
    if (changeset1.metadata.hasBreakingChanges || changeset2.metadata.hasBreakingChanges) {
      mergeRisk = 'high'
    } else if (packageOverlap < 0.5 && dependencyOverlap < 0.5) {
      mergeRisk = 'medium'
    }

    return {
      contentSimilarity,
      packageOverlap,
      dependencyOverlap,
      semanticSimilarity,
      isExactMatch,
      isSimilar,
      canMerge,
      mergeRisk,
    }
  }

  /**
   * Merge multiple changesets into a single changeset
   */
  private async mergeChangesets(changesets: ChangesetInfo[]): Promise<ChangesetInfo> {
    if (changesets.length === 0) {
      throw new Error('Cannot merge empty changeset array')
    }

    if (changesets.length === 1) {
      const firstChangeset = changesets[0]
      if (!firstChangeset) {
        throw new Error('Invalid changeset in array')
      }
      return firstChangeset
    }

    const shaReference = await this.getGitShortSha()
    const mergedId = `renovate-merged-${shaReference}`

    // Combine packages from all changesets
    const allPackages = new Set<string>()
    const allReleases: {name: string; type: 'patch' | 'minor' | 'major'}[] = []
    const allRelationships = new Set()
    const allDependencies = new Set<string>()
    const reasoning: string[] = []

    let isSecurityUpdate = false
    let hasBreakingChanges = false

    for (const changeset of changesets) {
      // Combine packages
      for (const pkg of changeset.packages) {
        allPackages.add(pkg)
      }

      // Combine releases (taking the highest semver bump for each package)
      for (const release of changeset.releases) {
        const existingRelease = allReleases.find(r => r.name === release.name)
        if (existingRelease) {
          // Take the higher semver bump
          const priority = {patch: 1, minor: 2, major: 3}
          if (priority[release.type] > priority[existingRelease.type]) {
            existingRelease.type = release.type
          }
        } else {
          allReleases.push({...release})
        }
      }

      // Combine relationships
      for (const rel of changeset.relationships) {
        allRelationships.add(JSON.stringify(rel))
      }

      // Combine metadata
      for (const dep of changeset.metadata.affectedDependencies) {
        allDependencies.add(dep)
      }

      if (changeset.metadata.isSecurityUpdate) isSecurityUpdate = true
      if (changeset.metadata.hasBreakingChanges) hasBreakingChanges = true

      reasoning.push(...changeset.metadata.reasoning)
    }

    // Generate merged summary
    const packageList = Array.from(allPackages).sort()
    const dependencyList = Array.from(allDependencies).sort()

    let mergedSummary = ''

    if (isSecurityUpdate) {
      mergedSummary += '🔒 **Security Update**: '
    }

    if (hasBreakingChanges) {
      mergedSummary += '⚠️ **Breaking Changes**: '
    }

    if (packageList.length === 1) {
      mergedSummary += `Update dependencies for \`${packageList[0]}\``
    } else {
      mergedSummary += `Update dependencies across ${packageList.length} packages`
    }

    if (dependencyList.length > 0) {
      if (dependencyList.length <= 3) {
        mergedSummary += `\n\n**Dependencies updated**: ${dependencyList.map(dep => `\`${dep}\``).join(', ')}`
      } else {
        mergedSummary += `\n\n**Dependencies updated**: ${dependencyList
          .slice(0, 3)
          .map(dep => `\`${dep}\``)
          .join(', ')} and ${dependencyList.length - 3} more`
      }
    }

    mergedSummary += `\n\n**Merged changeset** combining ${changesets.length} related updates across affected packages.`

    if (packageList.length > 1) {
      mergedSummary += `\n\n**Affected packages**: ${packageList.map(pkg => `\`${pkg}\``).join(', ')}`
    }

    const mergedChangeset: ChangesetInfo = {
      id: mergedId,
      filename: `${mergedId}.md`,
      packages: packageList,
      summary: mergedSummary,
      releases: allReleases,
      relationships: Array.from(allRelationships).map(rel => JSON.parse(rel as string)),
      metadata: {
        isGrouped: true, // Merged changesets are always considered grouped
        isSecurityUpdate,
        hasBreakingChanges,
        affectedDependencies: Array.from(allDependencies),
        reasoning: [
          `Merged changeset created from ${changesets.length} source changesets`,
          `Source changeset IDs: ${changesets.map(c => c.id).join(', ')}`,
          ...reasoning,
        ],
      },
    }

    return mergedChangeset
  }

  /**
   * Check if a new changeset is a duplicate of an existing changeset file
   */
  private isChangesetDuplicateOfExisting(
    changeset: ChangesetInfo,
    existing: ExistingChangesetInfo,
  ): boolean {
    // Compare package releases
    const newReleases = changeset.releases.map(r => `${r.name}:${r.type}`).sort()
    const existingReleases = existing.releases.map(r => `${r.name}:${r.type}`).sort()

    if (newReleases.length !== existingReleases.length) {
      return false
    }

    for (const [index, newRelease] of newReleases.entries()) {
      if (newRelease !== existingReleases[index]) {
        return false
      }
    }

    // If releases match exactly, consider it a duplicate
    return true
  }

  /**
   * Validate the deduplication result and generate warnings
   */
  private validateDeduplicationResult(
    deduplicatedChangesets: ChangesetInfo[],
    originalChangesets: ChangesetInfo[],
    warnings: string[],
  ): void {
    // Check for aggressive deduplication
    const reductionRatio = 1 - deduplicatedChangesets.length / originalChangesets.length
    if (reductionRatio > 0.8) {
      warnings.push(
        `High deduplication ratio (${(reductionRatio * 100).toFixed(1)}%) - verify results are correct`,
      )
    }

    // Check for missing packages
    const originalPackages = new Set(originalChangesets.flatMap(c => c.packages))
    const finalPackages = new Set(deduplicatedChangesets.flatMap(c => c.packages))

    for (const pkg of originalPackages) {
      if (!finalPackages.has(pkg)) {
        warnings.push(
          `Package '${pkg}' was present in original changesets but missing in final result`,
        )
      }
    }

    // Check for conflicting release types
    const packageReleases = new Map<string, Set<string>>()
    for (const changeset of deduplicatedChangesets) {
      for (const release of changeset.releases) {
        if (!packageReleases.has(release.name)) {
          packageReleases.set(release.name, new Set())
        }
        const packageTypes = packageReleases.get(release.name)
        if (packageTypes) {
          packageTypes.add(release.type)
        }
      }
    }

    for (const [pkg, types] of packageReleases.entries()) {
      if (types.size > 1) {
        warnings.push(
          `Package '${pkg}' has conflicting release types: ${Array.from(types).join(', ')}`,
        )
      }
    }
  }

  /**
   * Get Git short SHA for changeset naming
   */
  private async getGitShortSha(): Promise<string> {
    try {
      const {getExecOutput} = await import('@actions/exec')
      const {stdout} = await getExecOutput('git', ['rev-parse', '--short', 'HEAD'])
      return stdout.trim()
    } catch {
      return Math.random().toString(36).slice(2, 8)
    }
  }

  /**
   * Check if a directory exists
   */
  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath)
      return stat.isDirectory()
    } catch {
      return false
    }
  }
}
