---
"@bfra.me/.github": patch
---

Update AGENTS.md to reflect current file structure

- Correct `renovate-changesets` src file count from 96 to 125
- Add missing files to `renovate-changesets/AGENTS.md` structure listing:
  action-config.ts, action-outputs.ts, changeset-info-formatter.ts,
  changeset-writer.ts, run-generation-helpers.ts, run-generation-outputs.ts,
  pr-comment-creator.ts, pr-description-updater.ts, summary-generator-types.ts,
  and utils/ directory
- Add missing test files to listing: setup.ts, extract-dependencies-from-title.test.ts,
  phantom-dependency-regression.test.ts
