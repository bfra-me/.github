# update-repository-settings

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
