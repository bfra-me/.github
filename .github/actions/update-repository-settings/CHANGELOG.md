# update-repository-settings

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
