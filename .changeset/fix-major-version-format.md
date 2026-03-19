---
'renovate-changesets': patch
---

Improve version display in changeset summaries for major updates and SHA-pinned actions

- Major version updates now show `to vN (N.N.N)` format instead of `from X to Y` (e.g., `to v9 (9.0.0)`)
- Commit SHA refs are detected and suppressed from version text — only human-readable semver versions are displayed
- Minor/patch updates retain the existing `from X to Y` format
- Applied consistently across all ecosystem summary generators: npm, GitHub Actions, Go, Docker, Python, Cargo, Helm, Terraform, NuGet, Composer, JVM, Ansible, Pre-commit, GitLab CI, CircleCI
