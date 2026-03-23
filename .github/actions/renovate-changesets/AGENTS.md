# renovate-changesets Action

Auto-generates changeset files for Renovate dependency update PRs. Supports GitHub Actions, NPM, Docker, Python, Go, JVM ecosystems.

## STRUCTURE

```
src/
├── index.ts                          # Entry point — delegates to run()
├── run.ts                            # Main orchestrator — init → analysis → generation → PR ops
├── run-init.ts                       # PR validation, config loading, Renovate context extraction
├── run-analysis.ts                   # Semver impact, categorization, bump decision pipeline
├── run-generation.ts                 # Changeset content generation and multi-package handling
├── run-pr.ts                         # Post-generation PR operations (comments, labels)
│
├── renovate-parser.ts                # Barrel re-export of parser/ functions (no class)
├── parser/                           # Renovate PR metadata parsing (title, body, labels, branches)
│
├── semver-bump-decision-engine.ts    # decideBumpType() function — patch/minor/major decision
├── semver/                           # Bump decision sub-modules (rules, aggregation, config merge)
│
├── semver-impact-assessor.ts         # assessImpact() function — version change impact analysis
├── impact/                           # Impact assessment sub-modules (version parsing, calculation, aggregation)
│
├── change-categorization-engine.ts   # categorizeChanges() function — ecosystem/type classification
├── categorization/                   # Categorization sub-modules (dependency, risk, aggregation)
│
├── changeset-summary-generator.ts    # generateChangesetSummary() function — human-readable descriptions
├── summaries/                        # Summary generation sub-modules (templates, context, formatters)
│
├── changeset-template-engine.ts      # ChangesetTemplateEngine class — renders .md from templates
├── changeset-deduplicator.ts         # deduplicateChangesets() function — prevents duplicate changesets
├── deduplicator/                     # Deduplication sub-modules
│
├── multi-package-analyzer.ts         # analyzeMultiPackageUpdate() function — monorepo analysis
├── multi-package/                    # Multi-package sub-modules (workspace discovery, relationships, impact)
│
├── multi-package-changeset-generator.ts  # generateMultiPackageChangesets() function
├── multi-package-gen/                # Generator sub-modules (strategy, creators, writer)
│
├── grouped-pr-manager.ts            # GroupedPRManager class — batch PR handling
├── git-operations.ts                # GitOperations class — git add/commit/push
│
├── detector-runner.ts               # Orchestrates all detector functions
├── breaking-change-detector.ts      # analyzeBreakingChanges() function
├── detectors/breaking-change-*.ts   # Breaking change sub-modules (patterns, analyzers, synthesizer)
│
├── security-vulnerability-detector.ts # analyzeSecurityVulnerabilities() function
├── detectors/security-*.ts          # Security sub-modules (patterns, advisory parser, severity)
│
├── docker-change-detector.ts        # detectDockerChangesFromPR() function
├── detectors/docker-*.ts            # Docker sub-modules (file parser, image comparator, version)
│
├── github-actions-change-detector.ts # detectGHAChangesFromPR() function
├── detectors/gha-*.ts               # GHA sub-modules (workflow parser, version comparator, analyzer)
│
├── npm-change-detector.ts           # detectNPMChangesFromPR() function
├── detectors/npm-*.ts               # NPM sub-modules (package parser, lockfile analyzer, version)
│
├── python-change-detector.ts        # detectPythonChangesFromPR() function
├── go-change-detector.ts            # detectGoChangesFromPR() function
├── detectors/go-*.ts                # Go sub-modules (change analyzer, parser, types, version)
└── jvm-change-detector.ts           # detectJVMChangesFromPR() function

test/
├── index.test.ts                    # Main integration test with full mocking
├── integration/
│   ├── end-to-end.test.ts           # Full action simulation
│   └── components.test.ts           # Component interaction tests
├── renovate-parser.test.ts
├── changeset-summary-generator.test.ts
├── semver-bump-decision-engine.test.ts
├── semver-impact-assessor.test.ts
├── change-categorization-engine.test.ts
├── breaking-change-detector.test.ts
├── security-vulnerability-detector.test.ts
├── docker-change-detector.test.ts
├── github-actions-change-detector.test.ts
├── multi-package-analyzer.test.ts
└── grouped-updates-security-patches.test.ts
```

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Add new ecosystem support | `src/*-change-detector.ts` | Export a `detect*ChangesFromPR()` function |
| Change bump logic | `src/semver-bump-decision-engine.ts` | `decideBumpType()` function + `src/semver/` |
| Fix changeset format | `src/changeset-template-engine.ts` | ChangesetTemplateEngine class (multi-method) |
| Debug Renovate parsing | `src/parser/` | Individual parser functions, barrel in `renovate-parser.ts` |
| Handle grouped PRs | `src/grouped-pr-manager.ts` | GroupedPRManager class (multi-method) |
| Monorepo updates | `src/multi-package-analyzer.ts` + `src/multi-package/` | `analyzeMultiPackageUpdate()` function |
| Impact assessment | `src/semver-impact-assessor.ts` + `src/impact/` | `assessImpact()` function |
| Change categorization | `src/change-categorization-engine.ts` + `src/categorization/` | `categorizeChanges()` function |
| Summary generation | `src/changeset-summary-generator.ts` + `src/summaries/` | `generateChangesetSummary()` function |

## CONVENTIONS

- **Function-based architecture** — all single-use classes refactored to exported functions with optional config params
- Only ChangesetTemplateEngine, GroupedPRManager, and GitOperations remain as classes (multiple public methods / complex state)
- All `@actions/core`, `@actions/github`, `@actions/exec` calls mocked via hoisted `vi.mock()` in tests
- Each detector exports a `detect*ChangesFromPR()` function (not a class)
- Large modules (>200 LOC) split into sub-module directories (e.g., `impact/`, `categorization/`, `semver/`)
- Build: `tsup` (not tsc) → single bundled `dist/index.js`
- Coverage: 80% minimum across statements/branches/functions/lines (V8 provider)

## COMMANDS

```bash
pnpm build     # tsup → dist/index.js (must commit dist/)
pnpm test      # vitest run
pnpm lint      # eslint
```

## NOTES

- `dist/index.js` is committed — GitHub Actions requires pre-built JS
- Config accepts both inline YAML/JSON and file path via action inputs
- Security updates get special handling: always flagged, may override bump type
- `renovate-parser.ts` is a barrel file re-exporting functions from `src/parser/`
- Constructor config parameters became optional function parameters (e.g., `assessImpact(deps, options?)`)
