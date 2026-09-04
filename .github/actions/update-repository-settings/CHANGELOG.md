# update-repository-settings

## 0.2.1
### Patch Changes


- Treat equivalent GitHub branch-protection read-back representations as matching declared settings. ([#2687](https://github.com/bfra-me/.github/pull/2687))

## 0.2.0
### Minor Changes


- Report what the GitHub API actually returned when a settings plugin fails, verify that branch protection was applied, and retry transient server errors. ([#2684](https://github.com/bfra-me/.github/pull/2684))
  
  Plugin failures previously collapsed to `err.message`, so a 500 with an empty message rendered as an empty bullet. Failures now carry the status, the GitHub request ID, and a redacted response body, and the aggregate names which setting types applied alongside those that did not. The branch-protection payload is logged at debug level with principal-identifying fields scrubbed.
  
  After each successful branch-protection update, the applied protection is read back and compared against the declared config. Divergence surfaces as a warning and a job summary row; it never fails the run.

## 0.1.10
### Patch Changes


- Update dependencies across 3 packages ([#2652](https://github.com/bfra-me/.github/pull/2652))
  
  **Dependencies updated**: `js-yaml`
  
  **Merged changeset** combining 3 related updates across affected packages.
  
  **Affected packages**: `renovate-changesets`, `update-metadata`, `update-repository-settings`

## 0.1.9
### Patch Changes


- Refresh pnpm lockfile dependencies ([#2620](https://github.com/bfra-me/.github/pull/2620))
  
  **Multi-package update** for package `update-repository-settings`.

## 0.1.8
### Patch Changes


- Refresh pnpm lockfile dependencies ([#2585](https://github.com/bfra-me/.github/pull/2585))
  
  **Multi-package update** for package `update-repository-settings`.

## 0.1.7
### Patch Changes


- Bump TypeScript build target to ES2024 and esbuild target to node24 to match the Node.js 24 runtime. Add `engines: { node: ">=24" }` to all action packages. Fix deprecated `import ... assert` → `import ... with` syntax in tsup configs. ([#2040](https://github.com/bfra-me/.github/pull/2040))

## 0.1.6
### Patch Changes


- Update action runtime from Node.js 20 to Node.js 24. ([#1891](https://github.com/bfra-me/.github/pull/1891))

## 0.1.5
### Patch Changes


- Fix `update-repository-settings` not updating required status checks when the config uses `contexts`. The GET response includes both `checks` and `contexts` (for backward compatibility), and after deep-merging, the cleanup always deleted `contexts` in favor of `checks` — silently discarding the config's desired status checks. ([#1885](https://github.com/bfra-me/.github/pull/1885))

## 0.1.4
### Patch Changes


- Fix branch protection for user-owned repos: force `restrictions` to `null` (entire field is org-only) and fully remove `dismissal_restrictions` (GitHub docs: "Omit this parameter for personal repositories") instead of only stripping `users`/`teams` sub-fields. ([#1848](https://github.com/bfra-me/.github/pull/1848))

## 0.1.3
### Patch Changes


- Fix 422 error when configuring branch protection on user-owned repositories ([#1846](https://github.com/bfra-me/.github/pull/1846))
  
  The action no longer sends `users` and `teams` fields in `bypass_pull_request_allowances`, `dismissal_restrictions`, and `restrictions` for non-organization repositories, as GitHub's API rejects these fields for user-owned repos.

## 0.1.2
### Patch Changes


- Skip repository owner when applying collaborator settings to prevent GitHub API 422 errors on user-owned repositories ([#1743](https://github.com/bfra-me/.github/pull/1743))

## 0.1.1
### Patch Changes


- Updated dependency `@actions/github` to `^9.0.0`. ([#1684](https://github.com/bfra-me/.github/pull/1684))
