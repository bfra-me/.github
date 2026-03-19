---
'renovate-changesets': patch
---

Fix GitHub Actions version detection and dependency naming

- Extract inline version comments from raw YAML content before `js-yaml` strips them, enabling correct semver comparison for SHA-pinned actions (e.g., `# 8.87.9` → `# 9.0.0` now correctly detected as major)
- Use full action path as dependency name (`owner/repo/path/to/action` for sub-path actions, `owner/repo` for top-level) instead of stripping to last segment
