---
'renovate-changesets': patch
---

Fix GitHub Actions dependency detection, version display, and changeset formatting

- Recognize `workflow-templates/` directory as GitHub Actions files in both the default config file patterns and the change detector, fixing incorrect manager detection for workflow template updates
- Fix generic summary template producing redundant "Update dependencies dependency" text when updateType and ecosystem labels overlap
- Use inline version comments (e.g., `# 8.87.9`) from workflow files for semver comparison and changeset version display instead of raw commit SHA refs, correctly identifying major/minor/patch updates
- Remove false-positive security classification heuristic that marked all SHA-pinned action updates as security patches, fixing incorrect "Security update" labels on normal dependency updates
- Store both base and head inline version comments on detected changes so changeset summaries show human-readable versions (e.g., `8.87.9` to `9.0.0`) instead of commit SHAs
