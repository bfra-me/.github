import type {WorkspacePackage} from './multi-package-analyzer'
import {promises as fs} from 'node:fs'
import process from 'node:process'
import * as core from '@actions/core'
import {Octokit} from '@octokit/rest'
import {getConfig} from './action-config'
import {
  setCategorizationOutputs,
  setChangesetOutputs,
  setEmptyOutputs,
  setErrorOutputs,
  setGitOperationOutputs,
  setGroupedPRErrorOutputs,
  setGroupedPROutputs,
  setMultiPackageOutputs,
  setPRManagementOutputs,
} from './action-outputs'
import {ChangeCategorizationEngine} from './change-categorization-engine'
import {ChangesetSummaryGenerator} from './changeset-summary-generator'
import {ChangesetTemplateEngine} from './changeset-template-engine'
import {writeRenovateChangeset} from './changeset-writer'
import {runDetectors} from './detector-runner'
import {createGitOperations} from './git-operations'
import {createGroupedPRManager} from './grouped-pr-manager'
import {MultiPackageAnalyzer} from './multi-package-analyzer'
import {MultiPackageChangesetGenerator} from './multi-package-changeset-generator'
import {createPRComment} from './pr-comment-creator'
import {updatePRDescription} from './pr-description-updater'
import {RenovateParser} from './renovate-parser'
import {SemverBumpTypeDecisionEngine} from './semver-bump-decision-engine'
import {SemverImpactAssessor} from './semver-impact-assessor'
import {
  detectUpdateType,
  extractDependenciesFromTitle,
  isValidBranch,
  matchesPatterns,
  sortChangesetReleases,
} from './utils'

export type {Config} from './action-config'
export {DEFAULT_CONFIG, getConfig} from './action-config'
export {extractDependenciesFromTitle} from './utils'

function getRootPackageName(workspacePackages: WorkspacePackage[], fallbackName: string): string {
  const rootPackage = workspacePackages.find(pkg => pkg.path === '.' || pkg.path === '')
  return rootPackage?.name ?? fallbackName
}

export async function run(): Promise<void> {
  try {
    // Initialize the enhanced Renovate parser
    const parser = new RenovateParser()

    // Get repository and PR information from environment first (like original behavior)
    const repository = process.env.GITHUB_REPOSITORY
    const eventPath = process.env.GITHUB_EVENT_PATH

    if (!repository || !eventPath) {
      core.info('Missing repository or event information, skipping')
      return
    }

    let eventData: any
    try {
      eventData = JSON.parse(await fs.readFile(eventPath, 'utf8'))
    } catch {
      core.warning('Unable to parse event data, continuing without some validations')
      eventData = {}
    }

    // Only process pull requests from Renovate
    if (!eventData.pull_request) {
      core.info('Not a pull request, skipping')
      return
    }

    const pr = eventData.pull_request
    const isRenovatePR = ['renovate[bot]', 'bfra-me[bot]'].includes(pr.user.login)

    if (!isRenovatePR) {
      core.info('Not a Renovate PR, skipping')
      return
    }

    const config = await getConfig()

    // Check branch name if required
    const branchName = pr.head?.ref
    if (!branchName) {
      core.info('Unable to determine branch name, skipping')
      return
    }

    if (
      !isValidBranch(
        branchName,
        config.branchPrefix || 'renovate/',
        config.skipBranchPrefixCheck || false,
        parser,
      )
    ) {
      core.info(
        `Branch ${branchName} does not match expected prefix ${config.branchPrefix || 'renovate/'}, skipping`,
      )
      return
    }

    const [owner, repo] = repository.split('/')

    if (!owner || !repo) {
      core.setFailed('Could not determine repository owner or name.')
      return
    }

    // Now validate inputs that we actually need for GitHub API and file operations
    const token = core.getInput('token')
    const workingDirectory = core.getInput('working-directory')

    if (!token) {
      throw new Error('GitHub token is required')
    }

    if (!workingDirectory) {
      throw new Error('Working directory is required')
    }

    // Validate working directory exists
    try {
      await fs.access(workingDirectory)
    } catch {
      throw new Error(`Working directory does not exist: ${workingDirectory}`)
    }

    const octokit = new Octokit({auth: token})

    // Get PR files
    const {data: files} = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pr.number,
    })

    const changedFiles = files.map(file => file.filename)
    core.info(`Changed files: ${changedFiles.join(', ')}`)
    core.info(`Using config: ${JSON.stringify(config, null, 2)}`)

    // Use enhanced parser to extract comprehensive PR context
    const prContext = await parser.extractPRContext(octokit, owner, repo, pr.number, pr)

    const {enhancedDependencies} = await runDetectors({
      octokit,
      owner,
      repo,
      prNumber: pr.number,
      files,
      prContext,
    })

    core.info(
      `Parsed PR context: ${JSON.stringify(
        {
          isRenovateBot: prContext.isRenovateBot,
          isGroupedUpdate: prContext.isGroupedUpdate,
          isSecurityUpdate: prContext.isSecurityUpdate,
          manager: prContext.manager,
          updateType: prContext.updateType,
          dependencyCount: prContext.dependencies.length,
        },
        null,
        2,
      )}`,
    )

    if (changedFiles.some(file => file.startsWith('.changeset/'))) {
      core.info('Changeset files already exist, skipping changeset creation')
      setEmptyOutputs()
      return
    }

    // Filter out excluded patterns
    const excludePatterns = config.excludePatterns || []
    const filteredFiles = excludePatterns
      ? changedFiles.filter(file => !matchesPatterns(file, excludePatterns))
      : changedFiles

    if (filteredFiles.length === 0) {
      core.info('No relevant files changed, skipping')
      return
    }

    // Use enhanced parsing for more sophisticated update type detection
    const detectedManager =
      prContext.manager === 'unknown' ? detectUpdateType(filteredFiles, config) : prContext.manager
    const updateType = detectedManager || 'dependencies'

    if (!detectedManager) {
      core.info('No matching update type found, using default')
    }

    // TASK-018: Use sophisticated semver impact assessment algorithm
    const semverAssessor = new SemverImpactAssessor({
      securityMinimumPatch: true,
      majorAsBreaking: true,
      prereleaseAsLowerImpact: true,
      defaultChangesetType: config.defaultChangesetType,
      managerRules: {
        'github-actions': {
          defaultImpact: 'patch', // GitHub Actions updates are typically non-breaking
        },
        npm: {
          majorAsBreaking: true,
        },
        docker: {
          defaultImpact: 'patch', // Docker image updates are typically non-breaking to consumers
        },
      },
    })

    const impactAssessment = semverAssessor.assessImpact(enhancedDependencies)

    core.info(
      `Semver impact assessment: ${JSON.stringify(
        {
          overallImpact: impactAssessment.overallImpact,
          recommendedChangesetType: impactAssessment.recommendedChangesetType,
          isSecurityUpdate: impactAssessment.isSecurityUpdate,
          hasBreakingChanges: impactAssessment.hasBreakingChanges,
          confidence: impactAssessment.confidence,
          dependencyCount: impactAssessment.dependencies.length,
        },
        null,
        2,
      )}`,
    )

    // Log reasoning for transparency
    if (impactAssessment.reasoning.length > 0) {
      core.info(`Assessment reasoning: ${impactAssessment.reasoning.join('; ')}`)
    }

    // TASK-020: Use sophisticated change categorization engine
    const categorizationEngine = new ChangeCategorizationEngine({
      securityFirst: true,
      majorAsHighPriority: true,
      prereleaseAsLowerPriority: true,
      managerCategoryRules: {
        'github-actions': {
          categoryOverrides: {
            // GitHub Actions updates are typically safe, even major versions
            major: 'minor',
          },
          riskAdjustment: 0.8, // Lower risk for GitHub Actions
        },
        docker: {
          riskAdjustment: 0.9, // Slightly lower risk for Docker images
        },
        npm: {
          categoryOverrides: {
            // Keep npm major updates as major due to potential breaking changes
          },
          riskAdjustment: 1.1, // Slightly higher risk for npm
        },
      },
    })

    const categorizationResult = categorizationEngine.categorizeChanges(
      enhancedDependencies,
      impactAssessment,
    )

    core.info(
      `Change categorization: ${JSON.stringify(
        {
          primaryCategory: categorizationResult.primaryCategory,
          allCategories: categorizationResult.allCategories,
          securityUpdates: categorizationResult.summary.securityUpdates,
          breakingChanges: categorizationResult.summary.breakingChanges,
          highPriorityUpdates: categorizationResult.summary.highPriorityUpdates,
          averageRiskLevel: categorizationResult.summary.averageRiskLevel,
          confidence: categorizationResult.confidence,
        },
        null,
        2,
      )}`,
    )

    // Log categorization reasoning for transparency
    if (categorizationResult.reasoning.length > 0) {
      core.info(`Categorization reasoning: ${categorizationResult.reasoning.join('; ')}`)
    }

    // TASK-023: Use sophisticated semver bump type decision engine
    const decisionEngine = new SemverBumpTypeDecisionEngine({
      defaultBumpType: config.defaultChangesetType,
      securityTakesPrecedence: true,
      breakingChangesAlwaysMajor: true,
      securityMinimumBumps: {
        low: 'patch',
        moderate: 'patch',
        high: 'minor',
        critical: 'minor',
      },
      managerSpecificRules: {
        'github-actions': {
          allowDowngrade: true,
          maxBumpType: 'minor',
          defaultBumpType: 'patch',
          majorAsMinor: true,
        },
        docker: {
          allowDowngrade: true,
          maxBumpType: 'minor',
          defaultBumpType: 'patch',
          majorAsMinor: false,
        },
        npm: {
          allowDowngrade: false,
          maxBumpType: 'major',
          defaultBumpType: 'patch',
          majorAsMinor: false,
        },
      },
      riskTolerance: {
        patchMaxRisk: 20,
        minorMaxRisk: 50,
        majorRiskThreshold: 80,
      },
      organizationRules: {
        conservativeMode: true,
        preferMinorForMajor: true,
        groupedUpdateHandling: 'conservative',
        dependencyPatternRules: [
          {
            pattern: /^@types\//,
            maxBumpType: 'patch',
          },
          {
            pattern: /eslint|prettier|typescript/,
            maxBumpType: 'patch',
          },
        ],
      },
    })

    const bumpDecision = decisionEngine.decideBumpType({
      semverImpact: impactAssessment,
      categorization: categorizationResult,
      renovateContext: prContext,
      manager: prContext.manager,
      isGroupedUpdate: prContext.isGroupedUpdate,
      dependencyCount: enhancedDependencies.length,
    })

    core.info(
      `Bump type decision: ${JSON.stringify(
        {
          bumpType: bumpDecision.bumpType,
          confidence: bumpDecision.confidence,
          primaryReason: bumpDecision.primaryReason,
          riskLevel: bumpDecision.riskAssessment.level,
          riskScore: bumpDecision.riskAssessment.score,
          overriddenRules: bumpDecision.overriddenRules.length,
          influencingFactors: bumpDecision.influencingFactors.length,
        },
        null,
        2,
      )}`,
    )

    // Log detailed reasoning for transparency
    if (bumpDecision.reasoningChain.length > 0) {
      core.info(`Decision reasoning: ${bumpDecision.reasoningChain.join(' → ')}`)
    }

    if (bumpDecision.overriddenRules.length > 0) {
      core.info(`Overridden rules: ${bumpDecision.overriddenRules.join('; ')}`)
    }

    // Use the sophisticated decision engine result
    const changesetType = bumpDecision.bumpType

    // TASK-024: Multi-package analysis and changeset generation
    core.info('Analyzing multi-package dependencies and relationships')

    const multiPackageAnalyzer = new MultiPackageAnalyzer({
      workspaceRoot: workingDirectory,
      detectWorkspaces: true,
      analyzeInternalDependencies: true,
      enforceVersionConsistency: true,
      maxPackagesToAnalyze: 50,
    })

    // Perform multi-package analysis
    const multiPackageAnalysis = await multiPackageAnalyzer.analyzeMultiPackageUpdate(
      enhancedDependencies,
      changedFiles,
    )

    core.info(
      `Multi-package analysis: ${JSON.stringify(
        {
          workspacePackages: multiPackageAnalysis.workspacePackages.length,
          packageRelationships: multiPackageAnalysis.packageRelationships.length,
          affectedPackages: multiPackageAnalysis.affectedPackages.length,
          strategy: multiPackageAnalysis.impactAnalysis.changesetStrategy,
          riskLevel: multiPackageAnalysis.impactAnalysis.riskLevel,
          createSeparateChangesets: multiPackageAnalysis.recommendations.createSeparateChangesets,
        },
        null,
        2,
      )}`,
    )

    // Log detailed analysis reasoning for transparency
    if (multiPackageAnalysis.recommendations.reasoningChain.length > 0) {
      core.info(
        `Multi-package reasoning: ${multiPackageAnalysis.recommendations.reasoningChain.join('; ')}`,
      )
    }

    // Log individual dependency assessments for debugging
    for (const depImpact of impactAssessment.dependencies) {
      core.debug(
        `Dependency ${depImpact.name}: ${depImpact.versionChange} change, ${depImpact.semverImpact} impact, confidence: ${depImpact.confidence}`,
      )
    }

    // Generate enhanced changeset content using sophisticated impact assessment
    let dependencyNames = enhancedDependencies.map(dep => dep.name)

    if (!prContext.isGroupedUpdate) {
      const titleDeps = extractDependenciesFromTitle(pr.title || '')
      if (titleDeps.length > 0) {
        dependencyNames = titleDeps
      }
    }

    // Filter out synthetic dependency names that can pollute the changeset body
    // These are generated by extractPackageNameFromFilename() when it can't determine
    // the actual package name. Synthetic names follow the pattern "${manager}-dependencies"
    const syntheticPattern =
      /^(?:npm|pnpm|yarn|lockfile|github-actions|docker|dockerfile|docker-compose|pip|pipenv|gradle|maven|go|nuget|composer|cargo|helm|terraform|ansible|pre-commit|gitlabci|circleci|unknown)-dependencies$/i
    dependencyNames = dependencyNames.filter(name => !syntheticPattern.test(name))

    // Fallback: If enhanced parser found no dependencies, try to extract from PR title/commit
    if (dependencyNames.length === 0) {
      const titleDeps = extractDependenciesFromTitle(pr.title || '')
      if (titleDeps.length > 0) {
        dependencyNames = titleDeps
      } else {
        // Final fallback: use a generic dependency name based on update type
        dependencyNames = [updateType === 'npm' ? 'dependencies' : updateType || 'dependencies']
      }
    }

    // TASK-022: Use sophisticated context-aware changeset summary generator
    // TASK-027: Initialize with enhanced template engine
    const templateEngine = new ChangesetTemplateEngine({
      workingDirectory: process.cwd(),
      errorHandling: 'fallback',
      security: {
        allowFileInclusion: true,
        allowCodeExecution: false,
        maxTemplateSize: 1024 * 1024, // 1MB
        maxRenderTime: 5000, // 5 seconds
      },
    })
    const summaryGenerator = new ChangesetSummaryGenerator(
      {
        useEmojis: true,
        includeVersionDetails: true,
        includeRiskAssessment: false,
        includeBreakingChangeWarnings: true,
        sortDependencies: config.sort || false,
        maxDependenciesToList: 5,
      },
      templateEngine,
    )

    // Generate context-aware changeset content using sophisticated summary generator
    const changesetContent = await summaryGenerator.generateSummary(
      prContext,
      impactAssessment,
      categorizationResult,
      updateType,
      dependencyNames,
      config.updateTypes[updateType]?.template,
    )

    // TASK-024: Use multi-package changeset generator
    const multiPackageGenerator = new MultiPackageChangesetGenerator({
      workingDirectory,
      useOfficialChangesets: true,
      createSeparateChangesets: multiPackageAnalysis.recommendations.createSeparateChangesets,
      respectPackageRelationships: true,
      groupRelatedPackages: true,
      includeRelationshipInfo: true,
      maxChangesetsPerPR: 10,
    })

    // Generate changesets using multi-package analysis
    const multiPackageResult = await multiPackageGenerator.generateMultiPackageChangesets(
      enhancedDependencies,
      prContext,
      multiPackageAnalysis,
      changesetContent,
      changesetType,
    )

    core.info(
      `Multi-package changeset generation: ${JSON.stringify(
        {
          strategy: multiPackageResult.strategy,
          changesetsCreated: multiPackageResult.changesets.length,
          filesCreated: multiPackageResult.filesCreated.length,
          totalPackagesAffected: multiPackageResult.totalPackagesAffected,
          warnings: multiPackageResult.warnings.length,
        },
        null,
        2,
      )}`,
    )

    // Log detailed generation reasoning for transparency
    if (multiPackageResult.reasoning.length > 0) {
      core.info(`Multi-package generation reasoning: ${multiPackageResult.reasoning.join('; ')}`)
    }

    // Log warnings if any
    for (const warning of multiPackageResult.warnings) {
      core.warning(warning)
    }

    // Backward compatibility: If no files were created, fall back to original logic
    let changesetExists = multiPackageResult.filesCreated.length > 0
    let changesetPath = 'multi-package'
    const rootPackageName = getRootPackageName(multiPackageAnalysis.workspacePackages, repo)
    let releases =
      multiPackageResult.changesets.length > 0 && multiPackageResult.changesets[0]
        ? multiPackageResult.changesets[0].releases
        : [
            {
              name: rootPackageName,
              type: changesetType,
            },
          ]

    if (!changesetExists) {
      core.info(
        'Multi-package generation created no files, falling back to original changeset logic',
      )

      // Prepare releases for changeset - use the correct package name from workspace analysis
      releases = [
        {
          name: rootPackageName,
          type: changesetType,
        },
      ]

      // Sort releases if requested
      if (config.sort) {
        releases = sortChangesetReleases(releases)
      }

      // Generate changeset using original logic
      changesetPath = await writeRenovateChangeset(
        {
          releases,
          summary: changesetContent,
        },
        workingDirectory,
      )

      // Check if a changeset was actually created (not a duplicate)
      changesetExists = changesetPath !== 'existing'

      if (!changesetExists) {
        core.info(`Changeset already exists: ${changesetPath}`)
      }
    }

    setChangesetOutputs({
      changesetsCreated: multiPackageResult.filesCreated.length,
      changesetFiles: multiPackageResult.filesCreated,
      updateType: updateType || 'dependencies',
      dependencies: dependencyNames,
      changesetSummary: changesetContent,
    })

    setMultiPackageOutputs({
      strategy: multiPackageResult.strategy,
      workspacePackagesCount: multiPackageAnalysis.workspacePackages.length,
      packageRelationshipsCount: multiPackageAnalysis.packageRelationships.length,
      affectedPackages: multiPackageAnalysis.affectedPackages,
      reasoning: multiPackageResult.reasoning,
    })

    setCategorizationOutputs({
      primaryCategory: categorizationResult.primaryCategory,
      allCategories: categorizationResult.allCategories,
      summary: categorizationResult.summary,
      securityUpdates: categorizationResult.summary.securityUpdates,
      breakingChanges: categorizationResult.summary.breakingChanges,
      highPriorityUpdates: categorizationResult.summary.highPriorityUpdates,
      averageRiskLevel: categorizationResult.summary.averageRiskLevel,
      confidence: categorizationResult.confidence,
    })

    // TASK-028/029/030: Commit changeset files back to Renovate branch if enabled
    try {
      const gitOps = createGitOperations(workingDirectory, owner, repo, branchName)
      const commitResult = await gitOps.commitChangesetFiles()

      setGitOperationOutputs({
        commitSuccess: commitResult.success,
        commitSha: commitResult.commitSha || '',
        committedFiles: commitResult.committedFiles,
        gitError: commitResult.error || '',
        pushSuccess: commitResult.pushSuccess || false,
        pushError: commitResult.pushError || '',
        conflictsResolved: commitResult.conflictsResolved || false,
        conflictResolution: commitResult.conflictResolution || '',
        branchUpdated: commitResult.branchUpdated || false,
        retryAttempts: commitResult.retryAttempts || 0,
      })

      if (commitResult.success && commitResult.committedFiles.length > 0) {
        core.info(
          `Successfully committed ${commitResult.committedFiles.length} changeset files. SHA: ${commitResult.commitSha}`,
        )
      } else if (commitResult.error) {
        core.warning(`Git operations failed: ${commitResult.error}`)
      }
    } catch (gitError) {
      const gitErrorMessage = gitError instanceof Error ? gitError.message : String(gitError)
      core.warning(`Git operations encountered an error: ${gitErrorMessage}`)

      setGitOperationOutputs({
        commitSuccess: false,
        commitSha: '',
        committedFiles: [],
        gitError: gitErrorMessage,
        pushSuccess: false,
        pushError: '',
        conflictsResolved: false,
        conflictResolution: '',
        branchUpdated: false,
        retryAttempts: 0,
      })
    }

    // TASK-031: Update PR description with changeset information if enabled
    if (config.updatePRDescription) {
      try {
        await updatePRDescription(
          octokit,
          owner,
          repo,
          pr.number,
          changesetContent,
          releases,
          dependencyNames,
          categorizationResult,
          multiPackageResult,
        )
        setPRManagementOutputs({
          prDescriptionUpdated: true,
          prDescriptionError: '',
          prCommentCreated: false,
          prCommentError: '',
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        setPRManagementOutputs({
          prDescriptionUpdated: false,
          prDescriptionError: errorMessage,
          prCommentCreated: false,
          prCommentError: '',
        })
      }
    }

    // TASK-033: Create enhanced PR comment with changeset details if enabled
    if (config.commentPR) {
      try {
        await createPRComment(
          octokit,
          owner,
          repo,
          pr.number,
          changesetContent,
          releases,
          changesetPath,
          dependencyNames,
          categorizationResult,
          multiPackageResult,
        )
        setPRManagementOutputs({
          prDescriptionUpdated: false,
          prDescriptionError: '',
          prCommentCreated: true,
          prCommentError: '',
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        setPRManagementOutputs({
          prDescriptionUpdated: false,
          prDescriptionError: '',
          prCommentCreated: false,
          prCommentError: errorMessage,
        })
      }
    }

    // TASK-034: Handle grouped PR updates if enabled
    const groupedPRManager = createGroupedPRManager(octokit, owner, repo)
    try {
      const groupedPRs = await groupedPRManager.detectGroupedPRs(pr.number, prContext)

      const groupedPRsEnabled = core.getBooleanInput('update-grouped-prs')

      if (groupedPRs.length > 1) {
        core.info(`Found ${groupedPRs.length} PRs in group, updating all PRs`)

        const groupedResult = await groupedPRManager.updateGroupedPRs(
          groupedPRs,
          changesetContent,
          releases,
          dependencyNames,
          categorizationResult,
          multiPackageResult,
          updatePRDescription,
          createPRComment,
          changesetPath,
        )

        setGroupedPROutputs({
          enabled: groupedPRsEnabled,
          found: groupedPRs.length,
          updated: groupedResult.updatedPRs,
          failed: groupedResult.failedPRs,
          strategy: groupedResult.groupingStrategy,
          identifier: groupedResult.groupIdentifier || '',
          results: groupedResult.prResults,
        })

        if (groupedResult.failedPRs > 0) {
          core.warning(`${groupedResult.failedPRs} PRs failed to update in grouped operation`)
        }
      } else {
        setGroupedPROutputs({
          enabled: groupedPRsEnabled,
          found: groupedPRs.length,
          updated: 0,
          failed: 0,
          strategy: 'none',
          identifier: '',
          results: [],
        })
      }
    } catch (groupedPRError) {
      const errorMessage =
        groupedPRError instanceof Error ? groupedPRError.message : String(groupedPRError)
      core.warning(`Grouped PR operations failed: ${errorMessage}`)

      setGroupedPRErrorOutputs()
    }
  } catch (error) {
    // Enhanced error handling with detailed error information
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined

    core.error(`Action failed: ${errorMessage}`)
    if (errorStack) {
      core.debug(`Error stack: ${errorStack}`)
    }

    setErrorOutputs()

    core.setFailed(`Action failed: ${errorMessage}`)
  }
}

run()
