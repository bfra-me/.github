---
'@bfra.me/.github': patch
---

Fix phantom dependency extraction and duplicates in renovate-changesets action

- Eliminate phantom dependencies extracted from upstream release notes in PR bodies by scoping body parsing to Renovate's structured table/bullet sections and stripping `<details>` blocks and footer markers
- Deduplicate enhanced dependencies using field-level merge in the detector runner, preserving parser metadata while letting detector data win for version and path fields
- Recompute `isGroupedUpdate` from validated (post-filter) dependency list instead of the pre-filtered inflated count
- Parse PR title and body once in `extractPRContext` instead of re-parsing per commit, preventing dependency count inflation in multi-commit PRs
- Cross-validate body-extracted dependencies against actual file diff patches with case-insensitive matching and fail-open when patches are unavailable
- Derive all downstream flags (`isGroupedUpdate`, `isSecurityUpdate`) from the canonical deduplicated and validated dependency list
