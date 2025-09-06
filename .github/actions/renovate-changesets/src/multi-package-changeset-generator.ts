import type {
  MultiPackageAnalysisResult,
  PackageRelationship,
  WorkspacePackage,
} from './multi-package-analyzer'
import type {RenovateDependency, RenovatePRContext} from './renovate-parser'
import {promises as fs} from 'node:fs'

import path from 'node:path'
import process from 'node:process'
import * as core from '@actions/core'

import {getExecOutput} from '@actions/exec'
import write from '@changesets/write'
import {ChangesetDeduplicator} from './changeset-deduplicator'

/**
 * Configuration for multi-package changeset generation
 */
export interface MultiPackageChangesetConfig {
  workingDirectory: string
  useOfficialChangesets: boolean
  createSeparateChangesets: boolean
  respectPackageRelationships: boolean
  groupRelatedPackages: boolean
  packageNameTemplate: string
  includeRelationshipInfo: boolean
  maxChangesetsPerPR: number

  // TASK-026: Deduplication configuration options
  enableDeduplication: boolean
  deduplicationConfig?: {
    enableContentDeduplication: boolean
    enableSemanticDeduplication: boolean
    enableChangesetMerging: boolean
    semanticSimilarityThreshold: number
    maxMergeCount: number
    mergeStrategy: 'conservative' | 'aggressive' | 'disabled'
    preserveMetadata: boolean
    analyzeExistingChangesets: boolean
    maxExistingChangesetAge: number
  }
}

/**
 * Information about a changeset to be created
 */
export interface ChangesetInfo {
  id: string
  filename: string
  packages: string[]
  summary: string
  releases: {name: string; type: 'patch' | 'minor' | 'major'}[]
  relationships: PackageRelationship[]
  metadata: {
    isGrouped: boolean
    isSecurityUpdate: boolean
    hasBreakingChanges: boolean
    affectedDependencies: string[]
    reasoning: string[]
  }
}

/**
 * Result of multi-package changeset generation
 */
export interface MultiPackageChangesetResult {
  changesets: ChangesetInfo[]
  strategy: 'single' | 'multiple' | 'grouped'
  totalPackagesAffected: number
  filesCreated: string[]
  reasoning: string[]
  warnings: string[]
}

/**
 * Enhanced changeset generator for multi-package scenarios
 */
export class MultiPackageChangesetGenerator {
  private config: MultiPackageChangesetConfig

  constructor(config: Partial<MultiPackageChangesetConfig> = {}) {
    this.config = {
      workingDirectory: config.workingDirectory || process.cwd(),
      useOfficialChangesets: config.useOfficialChangesets ?? true,
      createSeparateChangesets: config.createSeparateChangesets ?? false,
      respectPackageRelationships: config.respectPackageRelationships ?? true,
      groupRelatedPackages: config.groupRelatedPackages ?? true,
      packageNameTemplate: config.packageNameTemplate || 'renovate-{sha}',
      includeRelationshipInfo: config.includeRelationshipInfo ?? true,
      maxChangesetsPerPR: config.maxChangesetsPerPR || 10,
      enableDeduplication: config.enableDeduplication ?? true,
      deduplicationConfig: config.deduplicationConfig ?? {
        enableContentDeduplication: true,
        enableSemanticDeduplication: true,
        enableChangesetMerging: true,
        semanticSimilarityThreshold: 0.8,
        maxMergeCount: 5,
        mergeStrategy: 'conservative',
        preserveMetadata: true,
        analyzeExistingChangesets: true,
        maxExistingChangesetAge: 30,
      },
      ...config,
    }
  }

  /**
   * Generate changesets for multi-package updates
   */
  async generateMultiPackageChangesets(
    dependencies: RenovateDependency[],
    prContext: RenovatePRContext,
    multiPackageAnalysis: MultiPackageAnalysisResult,
    changesetContent: string,
    changesetType: 'patch' | 'minor' | 'major',
  ): Promise<MultiPackageChangesetResult> {
    try {
      const reasoning: string[] = []
      const warnings: string[] = []

      // Determine the changeset strategy based on analysis
      const strategy = this.determineChangesetStrategy(multiPackageAnalysis, reasoning)

      // Generate changeset information
      const changesets = await this.createChangesetInfos(
        dependencies,
        prContext,
        multiPackageAnalysis,
        changesetContent,
        changesetType,
        strategy,
        reasoning,
      )

      // Validate changeset count
      if (changesets.length > this.config.maxChangesetsPerPR) {
        warnings.push(
          `Too many changesets (${changesets.length}), falling back to single changeset`,
        )
        const singleChangeset = await this.createSingleChangeset(
          dependencies,
          prContext,
          multiPackageAnalysis,
          changesetContent,
          changesetType,
          reasoning,
        )
        return {
          changesets: [singleChangeset],
          strategy: 'single',
          totalPackagesAffected: multiPackageAnalysis.affectedPackages.length,
          filesCreated: [],
          reasoning,
          warnings,
        }
      }

      // TASK-026: Apply sophisticated changeset deduplication for grouped updates
      let finalChangesets = changesets
      let deduplicationReasoning: string[] = []

      if (this.config.enableDeduplication && changesets.length > 1) {
        core.info('Applying changeset deduplication for grouped updates')

        const deduplicator = new ChangesetDeduplicator({
          ...this.config.deduplicationConfig,
          workingDirectory: this.config.workingDirectory,
        })

        const deduplicationResult = await deduplicator.deduplicateChangesets(changesets)

        finalChangesets = deduplicationResult.deduplicatedChangesets
        deduplicationReasoning = deduplicationResult.reasoning

        // Log deduplication statistics
        core.info(
          `Deduplication complete: ${deduplicationResult.stats.totalOriginal} → ${deduplicationResult.stats.totalFinal} changesets`,
        )
        core.info(
          `Removed ${deduplicationResult.stats.duplicatesRemoved} duplicates, merged ${deduplicationResult.stats.changesetseMerged} groups`,
        )

        if (deduplicationResult.warnings.length > 0) {
          warnings.push(...deduplicationResult.warnings)
          for (const warning of deduplicationResult.warnings) {
            core.warning(`Deduplication warning: ${warning}`)
          }
        }

        if (deduplicationResult.existingDuplicates.length > 0) {
          core.info(
            `Found ${deduplicationResult.existingDuplicates.length} duplicate existing changesets: ${deduplicationResult.existingDuplicates.join(', ')}`,
          )
        }

        reasoning.push(...deduplicationReasoning)
      } else if (this.config.enableDeduplication) {
        reasoning.push(
          'Deduplication enabled but only one changeset generated - skipping deduplication',
        )
      } else {
        reasoning.push('Deduplication disabled in configuration')
      }

      // Create the actual changeset files
      const filesCreated = await this.writeChangesetFiles(finalChangesets)

      return {
        changesets: finalChangesets,
        strategy,
        totalPackagesAffected: multiPackageAnalysis.affectedPackages.length,
        filesCreated,
        reasoning,
        warnings,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`Multi-package changeset generation failed: ${errorMessage}`)
    }
  }

  /**
   * Determine the appropriate changeset strategy
   */
  private determineChangesetStrategy(
    analysis: MultiPackageAnalysisResult,
    reasoning: string[],
  ): 'single' | 'multiple' | 'grouped' {
    reasoning.push('Analyzing changeset strategy...')

    // Force single changeset if configured
    if (!this.config.createSeparateChangesets) {
      reasoning.push('Configuration forces single changeset')
      return 'single'
    }

    // Use analysis recommendation
    const recommendedStrategy = analysis.impactAnalysis.changesetStrategy
    reasoning.push(`Analysis recommends: ${recommendedStrategy}`)

    // Override based on package relationships if configured
    if (this.config.respectPackageRelationships && analysis.packageRelationships.length > 0) {
      const hasInternalDeps = analysis.packageRelationships.some(
        r => r.type === 'internal-dependency',
      )
      if (hasInternalDeps && this.config.groupRelatedPackages) {
        reasoning.push('Found internal dependencies, using grouped strategy')
        return 'grouped'
      }
    }

    return recommendedStrategy
  }

  /**
   * Create changeset information objects
   */
  private async createChangesetInfos(
    dependencies: RenovateDependency[],
    prContext: RenovatePRContext,
    analysis: MultiPackageAnalysisResult,
    baseChangesetContent: string,
    changesetType: 'patch' | 'minor' | 'major',
    strategy: 'single' | 'multiple' | 'grouped',
    reasoning: string[],
  ): Promise<ChangesetInfo[]> {
    switch (strategy) {
      case 'single':
        return [
          await this.createSingleChangeset(
            dependencies,
            prContext,
            analysis,
            baseChangesetContent,
            changesetType,
            reasoning,
          ),
        ]

      case 'multiple':
        return this.createMultipleChangesets(
          dependencies,
          analysis,
          baseChangesetContent,
          changesetType,
          reasoning,
        )

      case 'grouped':
        return this.createGroupedChangesets(
          dependencies,
          analysis,
          baseChangesetContent,
          changesetType,
          reasoning,
        )

      default:
        throw new Error(`Unknown strategy: ${strategy}`)
    }
  }

  /**
   * Create a single changeset for all packages
   */
  private async createSingleChangeset(
    dependencies: RenovateDependency[],
    prContext: RenovatePRContext,
    analysis: MultiPackageAnalysisResult,
    baseChangesetContent: string,
    changesetType: 'patch' | 'minor' | 'major',
    reasoning: string[],
  ): Promise<ChangesetInfo> {
    reasoning.push('Creating single changeset for all affected packages')

    const shaReference = await this.getGitShortSha()
    const changesetId = `renovate-${shaReference}`

    // Include all affected packages in the single changeset
    const releases = analysis.affectedPackages.map(packageName => ({
      name: packageName,
      type: changesetType,
    }))

    // Enhance summary with multi-package information
    const enhancedSummary = this.enhanceChangesetSummary(baseChangesetContent, analysis)

    return {
      id: changesetId,
      filename: `${changesetId}.md`,
      packages: analysis.affectedPackages,
      summary: enhancedSummary,
      releases,
      relationships: analysis.packageRelationships,
      metadata: {
        isGrouped: prContext.isGroupedUpdate,
        isSecurityUpdate: prContext.isSecurityUpdate,
        hasBreakingChanges: dependencies.some(dep => dep.updateType === 'major'),
        affectedDependencies: dependencies.map(dep => dep.name),
        reasoning: ['Single changeset strategy for all affected packages'],
      },
    }
  }

  /**
   * Create separate changesets for each package
   */
  private createMultipleChangesets(
    dependencies: RenovateDependency[],
    analysis: MultiPackageAnalysisResult,
    baseChangesetContent: string,
    changesetType: 'patch' | 'minor' | 'major',
    reasoning: string[],
  ): Promise<ChangesetInfo[]> {
    reasoning.push('Creating separate changesets for each affected package')

    const changesets: ChangesetInfo[] = []

    for (const [index, packageName] of analysis.affectedPackages.entries()) {
      const changesetId = `renovate-${packageName.replaceAll(/[^a-z0-9]/gi, '-')}-${index}`

      // Find dependencies that affect this package
      const packageDependencies = this.findDependenciesForPackage(
        packageName,
        dependencies,
        analysis.workspacePackages,
      )

      // Find relationships involving this package
      const packageRelationships = analysis.packageRelationships.filter(
        rel => rel.source === packageName || rel.target === packageName,
      )

      const enhancedSummary = this.enhanceChangesetSummary(
        baseChangesetContent,
        analysis,
        packageName,
      )

      changesets.push({
        id: changesetId,
        filename: `${changesetId}.md`,
        packages: [packageName],
        summary: enhancedSummary,
        releases: [{name: packageName, type: changesetType}],
        relationships: packageRelationships,
        metadata: {
          isGrouped: false,
          isSecurityUpdate: packageDependencies.some(dep => dep.isSecurityUpdate),
          hasBreakingChanges: packageDependencies.some(dep => dep.updateType === 'major'),
          affectedDependencies: packageDependencies.map(dep => dep.name),
          reasoning: [`Separate changeset for package: ${packageName}`],
        },
      })
    }

    return Promise.resolve(changesets)
  }

  /**
   * Create grouped changesets based on package relationships
   */
  private createGroupedChangesets(
    dependencies: RenovateDependency[],
    analysis: MultiPackageAnalysisResult,
    baseChangesetContent: string,
    changesetType: 'patch' | 'minor' | 'major',
    reasoning: string[],
  ): Promise<ChangesetInfo[]> {
    reasoning.push('Creating grouped changesets based on package relationships')

    const changesets: ChangesetInfo[] = []
    const processedPackages = new Set<string>()

    // Group packages based on relationships
    for (const packageName of analysis.affectedPackages) {
      if (processedPackages.has(packageName)) continue

      const group = this.findPackageGroup(
        packageName,
        analysis.packageRelationships,
        analysis.affectedPackages,
      )
      const changesetId = `renovate-group-${group
        .map(p => p.replaceAll(/[^a-z0-9]/gi, '-'))
        .join('-')
        .slice(0, 50)}`

      // Find dependencies that affect this group
      const groupDependencies = dependencies.filter(dep =>
        group.some(pkg => this.packageHasDependency(pkg, dep, analysis.workspacePackages)),
      )

      // Find relationships within this group
      const groupRelationships = analysis.packageRelationships.filter(
        rel => group.includes(rel.source) && group.includes(rel.target),
      )

      const enhancedSummary = this.enhanceChangesetSummary(
        baseChangesetContent,
        analysis,
        undefined,
        group,
      )

      const releases = group.map(pkg => ({name: pkg, type: changesetType}))

      changesets.push({
        id: changesetId,
        filename: `${changesetId}.md`,
        packages: group,
        summary: enhancedSummary,
        releases,
        relationships: groupRelationships,
        metadata: {
          isGrouped: true,
          isSecurityUpdate: groupDependencies.some(dep => dep.isSecurityUpdate),
          hasBreakingChanges: groupDependencies.some(dep => dep.updateType === 'major'),
          affectedDependencies: groupDependencies.map(dep => dep.name),
          reasoning: [`Grouped changeset for related packages: ${group.join(', ')}`],
        },
      })

      // Mark all packages in this group as processed
      for (const pkg of group) {
        processedPackages.add(pkg)
      }
    }

    return Promise.resolve(changesets)
  }

  /**
   * Find packages that should be grouped together
   */
  private findPackageGroup(
    packageName: string,
    relationships: PackageRelationship[],
    affectedPackages: string[],
  ): string[] {
    const group = new Set([packageName])
    const toProcess = [packageName]

    while (toProcess.length > 0) {
      const currentPackage = toProcess.pop()
      if (!currentPackage) break

      // Find related packages
      for (const rel of relationships) {
        if (rel.type === 'internal-dependency' || rel.type === 'peer-dependency') {
          let relatedPackage: string | undefined

          if (rel.source === currentPackage && affectedPackages.includes(rel.target)) {
            relatedPackage = rel.target
          } else if (rel.target === currentPackage && affectedPackages.includes(rel.source)) {
            relatedPackage = rel.source
          }

          if (relatedPackage && !group.has(relatedPackage)) {
            group.add(relatedPackage)
            toProcess.push(relatedPackage)
          }
        }
      }
    }

    return Array.from(group)
  }

  /**
   * Find dependencies that affect a specific package
   */
  private findDependenciesForPackage(
    packageName: string,
    dependencies: RenovateDependency[],
    workspacePackages: WorkspacePackage[],
  ): RenovateDependency[] {
    const pkg = workspacePackages.find(p => p.name === packageName)
    if (!pkg) return []

    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
      ...pkg.optionalDependencies,
    }

    return dependencies.filter(dep => allDeps[dep.name])
  }

  /**
   * Check if a package has a specific dependency
   */
  private packageHasDependency(
    packageName: string,
    dependency: RenovateDependency,
    workspacePackages: WorkspacePackage[],
  ): boolean {
    const pkg = workspacePackages.find(p => p.name === packageName)
    if (!pkg) return false

    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
      ...pkg.optionalDependencies,
    }

    return Boolean(allDeps[dependency.name])
  }

  /**
   * Enhance changeset summary with multi-package information
   */
  private enhanceChangesetSummary(
    baseSummary: string,
    analysis: MultiPackageAnalysisResult,
    specificPackage?: string,
    packageGroup?: string[],
  ): string {
    let enhancedSummary = baseSummary

    // Add multi-package context
    if (analysis.workspacePackages.length > 1) {
      const packageInfo = specificPackage
        ? `for package \`${specificPackage}\``
        : packageGroup
          ? `for packages: ${packageGroup.map(p => `\`${p}\``).join(', ')}`
          : `across ${analysis.affectedPackages.length} packages`

      enhancedSummary += `\n\n**Multi-package update** ${packageInfo}.`

      // Add relationship information if configured
      if (this.config.includeRelationshipInfo && analysis.packageRelationships.length > 0) {
        const relevantRelationships = specificPackage
          ? analysis.packageRelationships.filter(
              r => r.source === specificPackage || r.target === specificPackage,
            )
          : packageGroup
            ? analysis.packageRelationships.filter(
                r => packageGroup.includes(r.source) && packageGroup.includes(r.target),
              )
            : analysis.packageRelationships

        if (relevantRelationships.length > 0) {
          enhancedSummary += '\n\n**Package relationships:**'
          for (const rel of relevantRelationships.slice(0, 5)) {
            // Limit to 5 relationships
            enhancedSummary += `\n- \`${rel.source}\` → \`${rel.target}\` (${rel.type})`
          }
          if (relevantRelationships.length > 5) {
            enhancedSummary += `\n- ... and ${relevantRelationships.length - 5} more`
          }
        }
      }

      // Add impact information
      if (analysis.impactAnalysis.indirectlyAffected.length > 0) {
        enhancedSummary += `\n\n**Impact:** ${analysis.impactAnalysis.directlyAffected.length} packages directly affected, ${analysis.impactAnalysis.indirectlyAffected.length} indirectly affected.`
      }
    }

    return enhancedSummary
  }

  /**
   * Write changeset files to disk
   */
  private async writeChangesetFiles(changesets: ChangesetInfo[]): Promise<string[]> {
    const filesCreated: string[] = []

    // Ensure .changeset directory exists
    const changesetDir = path.join(this.config.workingDirectory, '.changeset')
    await fs.mkdir(changesetDir, {recursive: true})

    for (const changeset of changesets) {
      const filePath = path.join(changesetDir, changeset.filename)

      // Check if file already exists
      try {
        await fs.access(filePath)
        core.info(`Changeset already exists: ${changeset.filename}`)
        continue
      } catch {
        // File doesn't exist, proceed with creation
      }

      try {
        if (this.config.useOfficialChangesets && !this.isTestEnvironment()) {
          // Use @changesets/write for official changeset creation
          const changesetForWrite = {
            summary: changeset.summary,
            releases: changeset.releases,
          }

          const uniqueId = await write(changesetForWrite, this.config.workingDirectory)
          const generatedPath = path.join(changesetDir, `${uniqueId}.md`)

          // Move to our expected filename
          const changesetContent = await fs.readFile(generatedPath, 'utf8')
          await fs.writeFile(filePath, changesetContent, 'utf8')
          await fs.unlink(generatedPath)

          core.info(`Created changeset using @changesets/write: ${changeset.filename}`)
        } else {
          // Fallback: Create changeset manually
          const frontmatter = changeset.releases
            .map(release => `'${release.name}': ${release.type}`)
            .join('\n')

          const content = `---
${frontmatter}
---

${changeset.summary}
`
          await fs.writeFile(filePath, content, 'utf8')
          core.info(`Created changeset manually: ${changeset.filename}`)
        }

        filesCreated.push(`.changeset/${changeset.filename}`)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        core.warning(`Failed to create changeset ${changeset.filename}: ${errorMessage}`)
      }
    }

    return filesCreated
  }

  /**
   * Get git short SHA for naming reference
   */
  private async getGitShortSha(): Promise<string> {
    try {
      const {stdout: shortSha} = await getExecOutput('git', ['rev-parse', '--short', 'HEAD'])
      return shortSha.trim()
    } catch (error) {
      core.warning(
        `Failed to get git SHA: ${error instanceof Error ? error.message : String(error)}`,
      )
      return 'unknown'
    }
  }

  /**
   * Check if running in test environment
   */
  private isTestEnvironment(): boolean {
    return Boolean(process.env.VITEST || process.env.NODE_ENV === 'test')
  }
}
