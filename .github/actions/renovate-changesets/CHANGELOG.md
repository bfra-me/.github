# @bfra.me-actions/renovate-changesets

## 0.2.25
### Patch Changes


- Restore check for existing changeset files. ([#1809](https://github.com/bfra-me/.github/pull/1809))

## 0.2.24
### Patch Changes


- Fix composite action name extraction and cap GitHub Actions changeset type at patch ([#1805](https://github.com/bfra-me/.github/pull/1805))
  
  - Normalize composite action references (`owner/repo/path/to/action-name`) to extract just the last path segment as the dependency name, preventing phantom duplicates from full-path vs short-name mismatches
  - Cap GitHub Actions changeset type at `patch` (matching the configured `changesetType`), preventing minor/major escalation for root package workflow reference updates

- Fix changeset regeneration and version display for major updates ([#1804](https://github.com/bfra-me/.github/pull/1804))
  
  - Remove early exit when changeset files already exist on the PR branch, allowing the action to always regenerate with the latest logic
  - Sync enhanced detector versions (inline version comments like `# 9.0.0`) back into prContext.dependencies before summary generation, fixing missing version text in changeset bodies

## 0.2.23
### Patch Changes


- Improve version display in changeset summaries for major updates and SHA-pinned actions ([#1798](https://github.com/bfra-me/.github/pull/1798))
  
  - Major version updates now show `to vN (N.N.N)` format instead of `from X to Y` (e.g., `to v9 (9.0.0)`)
  - Commit SHA refs are detected and suppressed from version text — only human-readable semver versions are displayed
  - Minor/patch updates retain the existing `from X to Y` format
  - Applied consistently across all ecosystem summary generators: npm, GitHub Actions, Go, Docker, Python, Cargo, Helm, Terraform, NuGet, Composer, JVM, Ansible, Pre-commit, GitLab CI, CircleCI

## 0.2.22
### Patch Changes


- Fix literal `\n` escape sequences in commit messages by converting them to actual newlines after template placeholder replacement ([#1789](https://github.com/bfra-me/.github/pull/1789))


- Fix false security classification triggered by OpenSSF Scorecard badge URLs in Renovate PR bodies ([#1791](https://github.com/bfra-me/.github/pull/1791))
  
  - Strip URLs and markdown link targets from PR content before checking security keywords
  - Prevents badge URLs like `securityscorecards.dev` from triggering false positives

## 0.2.21
### Patch Changes


- Fix GitHub Actions dependency detection, version display, and changeset formatting ([#1783](https://github.com/bfra-me/.github/pull/1783))
  
  - Recognize `workflow-templates/` directory as GitHub Actions files in both the default config file patterns and the change detector, fixing incorrect manager detection for workflow template updates
  - Fix generic summary template producing redundant "Update dependencies dependency" text when updateType and ecosystem labels overlap
  - Use inline version comments (e.g., `# 8.87.9`) from workflow files for semver comparison and changeset version display instead of raw commit SHA refs, correctly identifying major/minor/patch updates
  - Remove false-positive security classification heuristic that marked all SHA-pinned action updates as security patches, fixing incorrect "Security update" labels on normal dependency updates
  - Store both base and head inline version comments on detected changes so changeset summaries show human-readable versions (e.g., `8.87.9` to `9.0.0`) instead of commit SHAs

## 0.2.20
### Patch Changes


- Fix phantom dependency extraction and duplicates in renovate-changesets action ([#1774](https://github.com/bfra-me/.github/pull/1774))
  
  - Eliminate phantom dependencies extracted from upstream release notes in PR bodies by scoping body parsing to Renovate's structured table/bullet sections and stripping `<details>` blocks and footer markers
  - Deduplicate enhanced dependencies using field-level merge in the detector runner, preserving parser metadata while letting detector data win for version and path fields
  - Recompute `isGroupedUpdate` from validated (post-filter) dependency list instead of the pre-filtered inflated count
  - Parse PR title and body once in `extractPRContext` instead of re-parsing per commit, preventing dependency count inflation in multi-commit PRs
  - Cross-validate body-extracted dependencies against actual file diff patches with case-insensitive matching and fail-open when patches are unavailable
  - Derive all downstream flags (`isGroupedUpdate`, `isSecurityUpdate`) from the canonical deduplicated and validated dependency list

## 0.2.19
### Patch Changes


- Fix markdown link extraction pairing Renovate table headers (Age, Confidence) as dependency names ([#1753](https://github.com/bfra-me/.github/pull/1753))

## 0.2.18
### Patch Changes


- Fix template engine bypassing manager-specific summary generation when no organization templates are configured ([#1739](https://github.com/bfra-me/.github/pull/1739))

## 0.2.17
### Patch Changes


- Fix changeset summary generation for GitHub Actions dependency updates: infer `github-actions` ([#1734](https://github.com/bfra-me/.github/pull/1734))
  manager from workflow files when title/commit parsing yields `unknown`, support major-only version
  targets (e.g. `to v4`), extract dependency versions from Renovate markdown tables, and filter
  spurious tokens like `update` from the dependency list.

## 0.2.16
### Patch Changes


- Fix changeset body formatting to remove synthetic dependency names ([#1705](https://github.com/bfra-me/.github/pull/1705))
  
  The renovate-changesets action was generating changeset bodies with
  synthetic dependency names like "npm-dependencies", "pnpm-dependencies",
  and "github-actions-dependencies" instead of actual package names.
  
  This fix:
  - Disables file-based dependency extraction that generated synthetic names
  - Adds filtering to remove any remaining synthetic patterns
  - Ensures only real dependency names from PR title/body parsing appear in changesets
  
  This resolves issues where changesets showed:
  "Update unknown dependencies: lint-staged, npm-dependencies, pnpm-dependencies"
  When they should show:
  "Update dependency `lint-staged` to `16.3.3`."

## 0.2.15
### Patch Changes


- Fix package name detection in changeset generation. Previously used GitHub repo name (.github) instead of actual workspace package name (@bfra.me/.github). ([#1699](https://github.com/bfra-me/.github/pull/1699))

## 0.2.14
### Patch Changes


- Updated dependency `@actions/exec` to `^3.0.0`. ([#1670](https://github.com/bfra-me/.github/pull/1670))


- Updated dependency `@actions/github` to `^9.0.0`. ([#1671](https://github.com/bfra-me/.github/pull/1671))


- Updated dependency `@actions/core` to `^3.0.0`. ([#1669](https://github.com/bfra-me/.github/pull/1669))

## 0.2.13
### Patch Changes


- Updated dependency `minimatch` to `10.2.3`. ([#1630](https://github.com/bfra-me/.github/pull/1630))


- Updated dependency `minimatch` to `10.2.4`. ([#1633](https://github.com/bfra-me/.github/pull/1633))

## 0.2.12
### Patch Changes


- Updated dependency `minimatch` to `10.2.1`. ([#1612](https://github.com/bfra-me/.github/pull/1612))


- Updated dependency `minimatch` to `10.2.2`. ([#1622](https://github.com/bfra-me/.github/pull/1622))

## 0.2.11
### Patch Changes


- Updated dependency `minimatch` to `10.2.0`. ([#1604](https://github.com/bfra-me/.github/pull/1604))


- Updated dependency `minimatch` to `10.1.3`. ([#1602](https://github.com/bfra-me/.github/pull/1602))

## 0.2.10
### Patch Changes


- Updated dependency `minimatch` to `10.1.2`. ([#1586](https://github.com/bfra-me/.github/pull/1586))

## 0.2.9
### Patch Changes


- Updated dependency `@actions/github` to `^7.0.0`. ([#1564](https://github.com/bfra-me/.github/pull/1564))

## 0.2.8
### Patch Changes


- Updated dependency `@actions/core` to `^2.0.0`. ([#1512](https://github.com/bfra-me/.github/pull/1512))


- Updated dependency `@actions/exec` to `^2.0.0`. ([#1513](https://github.com/bfra-me/.github/pull/1513))

## 0.2.7
### Patch Changes


- Updated dependency `tsup` to `8.5.1`. ([#1361](https://github.com/bfra-me/.github/pull/1361))

## 0.2.6
### Patch Changes


- Updated dependency `@types/js-yaml` to `4.0.9`. ([#1333](https://github.com/bfra-me/.github/pull/1333))

## 0.2.5
### Patch Changes


- Updated dependency `minimatch` to `10.1.1`. ([#1296](https://github.com/bfra-me/.github/pull/1296))

## 0.2.4
### Patch Changes


- Updated dependency `@bfra.me/eslint-config` to `0.27.0`. ([#1046](https://github.com/bfra-me/.github/pull/1046))

## 0.2.3
### Patch Changes


- Updated dependency `@bfra.me/eslint-config` to `^0.26.0`. ([#1012](https://github.com/bfra-me/.github/pull/1012))

## 0.2.2
### Patch Changes


- Updated dependency `@bfra.me/eslint-config` to `0.25.0`. ([#947](https://github.com/bfra-me/.github/pull/947))

## 0.2.1
### Patch Changes


- Replace broken regex globbing with [minimatch](https://isaacs.github.io/minimatch/). ([#902](https://github.com/bfra-me/.github/pull/902))

## 0.2.0
### Minor Changes


- Add a `comment-pr` input (default: `true`) for posting a comment with changeset details. ([#888](https://github.com/bfra-me/.github/pull/888))


- Add compatible @scaleway/changesets-renovate inputs. ([#888](https://github.com/bfra-me/.github/pull/888))


### Patch Changes


- Fix issues with Renovate changeset generation. ([#894](https://github.com/bfra-me/.github/pull/894))

## 0.1.1
### Patch Changes


- Updated dependency `@changesets/write` to `^0.4.0`. ([#871](https://github.com/bfra-me/.github/pull/871))

## 0.1.0
### Minor Changes


- Create a GitHub Action to update changesets based on Renovate dependency updates. ([#866](https://github.com/bfra-me/.github/pull/866))
