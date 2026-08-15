# renovate-changesets Action

Auto-generates changeset files for Renovate dependency update PRs. Supports GitHub Actions, NPM, and Docker ecosystems.

## STRUCTURE

```
src/
├── index.ts                          # Entry point — delegates to run()
├── action-config.ts                  # Action input configuration parsing
├── action-outputs.ts                 # Action output types and helpers
├── run.ts                            # Main orchestrator — init → analysis → generation → PR ops
├── run-init.ts                       # PR validation, config loading, Renovate context extraction
├── run-analysis.ts                   # Semver impact, categorization, bump decision pipeline
├── run-generation.ts                 # Extract → classify → format → write pipeline
├── run-generation-helpers.ts         # Helper utilities for changeset generation
├── run-generation-outputs.ts         # Output formatting for generation step
├── run-pr.ts                         # Post-generation PR operations (comments, labels)
├── pr-comment-creator.ts             # Creates PR comments with changeset summaries
├── pr-description-updater.ts         # Updates PR description with changeset info
│
├── renovate-parser.ts                # Barrel re-export of parser/ functions
├── parser/                           # Renovate PR metadata parsing
├── extract/                          # Renovate PR body extraction
├── classify/                         # Bump and security classification
├── format/                           # Changeset summary formatting
├── analysis-types.ts                 # Shared analysis result types
│
├── semver-bump-decision-engine.ts    # decideBumpType() function
├── semver/                           # Bump decision sub-modules
├── semver-impact-assessor.ts         # assessImpact() function
├── impact/                           # Impact assessment sub-modules
├── change-categorization-engine.ts   # categorizeChanges() function
├── categorization/                   # Categorization sub-modules
│
├── changeset-summary-generator.ts    # Compatibility summary generator
├── summary-generator-types.ts        # Summary generation types
├── changeset-info-formatter.ts       # Formats changeset metadata for display
├── changeset-writer.ts               # Single changeset writer, including multi-package writes
├── changeset-deduplicator.ts         # deduplicateChangesets() function
├── deduplicator/                     # Deduplication sub-modules
│
├── multi-package-analyzer.ts         # analyzeMultiPackageUpdate() function
├── multi-package/                    # Multi-package sub-modules
├── multi-package-changeset-generator.ts # generateMultiPackageChangesets() function
├── multi-package-gen/                # Generator sub-modules (strategy, creators, types)
│
├── grouped-pr-manager.ts             # GroupedPRManager class
├── git-operations.ts                 # GitOperations class
└── utils/                            # Shared utility functions

test/
├── setup.ts                         # Vitest global test setup
├── index.test.ts                    # Main integration test
├── integration/                     # Full action and component tests
├── extract/                         # Body extraction fixtures/tests
├── classify/                        # Classification tests
├── format/                          # Summary formatting tests
└── remaining module and regression tests
```

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Change bump logic | `src/classify/` and `src/semver-bump-decision-engine.ts` | Classification and compatibility paths |
| Extract Renovate updates | `src/extract/` | Heading-based PR body extraction |
| Format changeset summaries | `src/format/` | Pure summary formatter; escape at render time |
| Debug Renovate parsing | `src/parser/` | Parser functions, barrel in `renovate-parser.ts` |
| Handle grouped PRs | `src/grouped-pr-manager.ts` | GroupedPRManager class |
| Monorepo updates | `src/multi-package-analyzer.ts` + `src/multi-package/` | Workspace analysis |
| Impact assessment | `src/semver-impact-assessor.ts` + `src/impact/` | `assessImpact()` |
| Change categorization | `src/change-categorization-engine.ts` + `src/categorization/` | `categorizeChanges()` |
| Summary compatibility | `src/changeset-summary-generator.ts` | Legacy display structures for PR operations |
| Write changesets | `src/changeset-writer.ts` | Single writer for all changeset files |

## CONVENTIONS

- **Function-based architecture** — single-use classes are exported functions with optional config params.
- Only `GroupedPRManager` and `GitOperations` remain as classes.
- All `@actions/core`, `@actions/github`, and `@actions/exec` calls are mocked via hoisted `vi.mock()` in tests.
- Large modules (>200 LOC) split into sub-module directories.
- Build: `tsup` (not tsc) → single bundled `dist/index.js`.
- Coverage: 80% minimum across statements/branches/functions/lines (V8 provider).

## COMMANDS

```bash
pnpm build     # tsup → dist/index.js (must commit dist/)
pnpm test      # vitest run
pnpm lint      # eslint
```

## NOTES

- `dist/index.js` is committed — GitHub Actions requires pre-built JS.
- Config accepts both inline YAML/JSON and file path via action inputs.
- Security updates are classified from Renovate branch, commit, and label signals.
- `renovate-parser.ts` is a barrel file re-exporting functions from `src/parser/`.
- Constructor config parameters became optional function parameters.

## COMPLEXITY HOTSPOTS

| File | Lines | Hardest Functions | Why Complex |
| --- | --- | --- | --- |
| `run-generation.ts` | 193 | `generateChangesets` | Extract/classify/format pipeline plus compatibility adapter |
| `git-operations.ts` | 697 | `commitChangesetFiles`, `pushToRemoteBranch` | Retry logic, rebase/conflict handling, 15+ paths |
| `grouped-pr-manager.ts` | 608 | `updateGroupedPRs` | Nested loops with try-catch, API-heavy, 12+ decision points |

## DEEP MODULE PATTERNS

The `src/impact/`, `src/semver/`, `src/parser/`, `src/extract/`, and `src/classify/` directories (and `src/categorization/`, `src/deduplicator/`, `src/multi-package/`, `src/multi-package-gen/`) follow a modular decomposition pattern:

- **Naming conventions**: `*-analyzer.ts`, `*-parser.ts`, `*-comparator.ts`, `*-types.ts`.
- **Data flow pipeline**: parse → extract → classify → format → write.
- **Common concepts**: `RenovateDependency`, `ImpactAssessment`, confidence enums, and ecosystem-specific update types.
- **Deep module pattern**: complex logic is encapsulated behind simple function interfaces such as `assessImpact()` and `extractRenovateUpdates()`.
