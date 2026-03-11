# renovate-changesets Action

Auto-generates changeset files for Renovate dependency update PRs. Supports GitHub Actions, NPM, Docker, Python, Go, JVM ecosystems.

## STRUCTURE

```
src/
├── index.ts                          # Entry point — orchestrates the full flow
├── renovate-parser.ts                # Parses Renovate PR metadata (title, body, labels)
├── enhanced-config-provider.ts       # Resolves action config (inline YAML/JSON or file)
├── semver-bump-decision-engine.ts    # Determines patch/minor/major from update context
├── semver-impact-assessor.ts         # Assesses downstream impact of version changes
├── change-categorization-engine.ts   # Classifies changes by ecosystem and type
├── changeset-summary-generator.ts    # Produces human-readable changeset descriptions
├── changeset-template-engine.ts      # Renders changeset .md files from templates
├── changeset-deduplicator.ts         # Prevents duplicate changesets for same dependency
├── multi-package-analyzer.ts         # Handles monorepo multi-package updates
├── multi-package-changeset-generator.ts  # Generates per-package changesets
├── grouped-pr-manager.ts            # Handles Renovate grouped/batch PRs
├── git-operations.ts                # Git add/commit for generated changesets
├── breaking-change-detector.ts      # Flags major version bumps and known breakers
├── security-vulnerability-detector.ts # Detects security-related updates
├── docker-change-detector.ts        # Docker-specific update detection
├── github-actions-change-detector.ts # GHA pin/version update detection
├── npm-change-detector.ts           # NPM/pnpm dependency detection
├── python-change-detector.ts        # Python dependency detection
├── go-change-detector.ts            # Go module detection
└── jvm-change-detector.ts           # JVM (Maven/Gradle) detection

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
| Add new ecosystem support | `src/*-change-detector.ts` | Follow existing detector pattern |
| Change bump logic | `src/semver-bump-decision-engine.ts` | Core version decision logic |
| Fix changeset format | `src/changeset-template-engine.ts` | Template rendering |
| Debug Renovate parsing | `src/renovate-parser.ts` | PR title/body/label parsing |
| Handle grouped PRs | `src/grouped-pr-manager.ts` | Batch update handling |
| Monorepo updates | `src/multi-package-*.ts` | Per-package changeset generation |

## CONVENTIONS

- All `@actions/core`, `@actions/github`, `@actions/exec` calls mocked via hoisted `vi.mock()` in tests
- Each detector follows the same interface: takes PR context, returns categorized changes
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
