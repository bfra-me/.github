# @bfra.me/.github

## 2.0.4
### Patch Changes


- Restore tsx to support sourcemaps while debugging; adjust bootstrap and version scripts. ([#386](https://github.com/bfra-me/.github/pull/386))


- Add code scanning and dependency review workflow templates. ([#387](https://github.com/bfra-me/.github/pull/387))


- Updated dependency `@bfra.me/eslint-config` to `0.7.1`. ([#382](https://github.com/bfra-me/.github/pull/382))


- Updated dependency `@bfra.me/prettier-config` to `0.13.3`. ([#383](https://github.com/bfra-me/.github/pull/383))

## 2.0.3
### Patch Changes


- Updated dependency `eslint` to `9.16.0`. ([#366](https://github.com/bfra-me/.github/pull/366))


- Updated dependency `@bfra.me/eslint-config` to `0.7.0`. ([#369](https://github.com/bfra-me/.github/pull/369))


- Updated dependency `@bfra.me/prettier-config` to `0.13.2`. ([#368](https://github.com/bfra-me/.github/pull/368))

## 2.0.2
### Patch Changes


- Updated dependency `@bfra.me/prettier-config` to `0.13.0`. ([#361](https://github.com/bfra-me/.github/pull/361))


- Updated dependency `packageManager` to `pnpm@9.14.4`. ([#363](https://github.com/bfra-me/.github/pull/363))


- Updated dependency `packageManager` to `pnpm@9.14.3`. ([#359](https://github.com/bfra-me/.github/pull/359))


- Updated dependency `jiti` to `2.4.1`. ([#362](https://github.com/bfra-me/.github/pull/362))


- Updated dependency `@bfra.me/eslint-config` to `0.4.10`. ([#360](https://github.com/bfra-me/.github/pull/360))


- Updated dependency `@types/node` to `22.10.1`. ([#357](https://github.com/bfra-me/.github/pull/357))

## 2.0.1
### Patch Changes


- Updated dependency `@bfra.me/prettier-config` to `0.12.0`. ([#349](https://github.com/bfra-me/.github/pull/349))

## 2.0.0
### Major Changes


- Update to @bfra-me/renovate-action v5 ([#350](https://github.com/bfra-me/.github/pull/350))


### Patch Changes


- Updated dependency `@bfra.me/prettier-config` to `0.10.0`. ([#348](https://github.com/bfra-me/.github/pull/348))


- Updated dependency `@types/node` to `22.9.4`. ([#343](https://github.com/bfra-me/.github/pull/343))


- Updated dependency `@bfra.me/eslint-config` to `0.4.9`. ([#347](https://github.com/bfra-me/.github/pull/347))


- Updated dependency `@bfra.me/eslint-config` to `0.4.8`. ([#340](https://github.com/bfra-me/.github/pull/340))


- Updated dependency `prettier` to `3.4.0`. ([#345](https://github.com/bfra-me/.github/pull/345))


- Updated dependency `prettier` to `3.4.1`. ([#346](https://github.com/bfra-me/.github/pull/346))


- Updated dependency `@types/node` to `22.10.0`. ([#344](https://github.com/bfra-me/.github/pull/344))

## 1.13.0
### Minor Changes


- Tidy and release latest dependency updates, etc. ([#334](https://github.com/bfra-me/.github/pull/334))


### Patch Changes


- Updated dependency `typescript` to `5.7.2`. ([#338](https://github.com/bfra-me/.github/pull/338))

## 1.12.1
### Patch Changes


- Remove `labeled` trigger on pull request events. ([#301](https://github.com/bfra-me/.github/pull/301))

## 1.12.0
### Minor Changes


- Add a trigger for `workflow_run` events with the 'success' status. ([#299](https://github.com/bfra-me/.github/pull/299))

## 1.11.2
### Patch Changes


- Revert the feature that ran the Renovate reusable workflow if a PR has a `renovate` label; introduced in 747e3b5f4afe41b15bc0cf1a64d30de4a337c816. ([#291](https://github.com/bfra-me/.github/pull/291))

## 1.11.1
### Patch Changes


- Add `create-config-migration-pr` to detected Renovate Dependency Dashboard checkboxes. ([#287](https://github.com/bfra-me/.github/pull/287))


- Switch to `actions/create-github-app-token` to generate workflow access tokens. ([#285](https://github.com/bfra-me/.github/pull/285))

## 1.11.0
### Minor Changes



- * Add support for Renovating any PR that uses the `renovate` label  
  * Add a `path_filter` input for configuring the paths to filter for changes (by [@marcusrbrown](https://github.com/marcusrbrown) with [#264](https://github.com/bfra-me/.github/pull/264))

## 1.10.0
### Minor Changes



- Manually bump Renovate preset versions for updated `packageRules` (by [@marcusrbrown](https://github.com/marcusrbrown) with [#260](https://github.com/bfra-me/.github/pull/260))

### Patch Changes



- Remove `rangeStrategy` from Renovate config (by [@marcusrbrown](https://github.com/marcusrbrown) with [#259](https://github.com/bfra-me/.github/pull/259))


- Pin default `@bfra-me/renovate-config` config preset with actions and workflows (by [@marcusrbrown](https://github.com/marcusrbrown) with [#257](https://github.com/bfra-me/.github/pull/257))

## 1.9.1
### Patch Changes



- Add labels and keep @bfra-me/renovate-action pinned to major version (by [@marcusrbrown](https://github.com/marcusrbrown) with [#253](https://github.com/bfra-me/.github/pull/253))

## 1.9.0
### Minor Changes



- Release all changes since current (by [@marcusrbrown](https://github.com/marcusrbrown) with [#245](https://github.com/bfra-me/.github/pull/245))

## 1.8.2

### Patch Changes

- Set bfra-me/renovate-action ref to v3 floating major branch (by [@marcusrbrown](https://github.com/marcusrbrown) with [#229](https://github.com/bfra-me/.github/pull/229))

## 1.8.1

### Patch Changes

- [#223](https://github.com/bfra-me/.github/pull/223) [`0ec0fdf`](https://github.com/bfra-me/.github/commit/0ec0fdfa3d6090f5069e9ce05d20151329f73bac) Thanks [@marcusrbrown](https://github.com/marcusrbrown)! - Build: Update `release` script to remove `stdin` input

## 1.8.0

### Minor Changes

- [#220](https://github.com/bfra-me/.github/pull/220) [`75ebe89`](https://github.com/bfra-me/.github/commit/75ebe89e1851c181fbaf7b52f20fd8748fc96921) Thanks [@marcusrbrown](https://github.com/marcusrbrown)! - Build: Push releases to a floating major branch (e.g., `v1`)

## 1.7.0

### Minor Changes

- [#210](https://github.com/bfra-me/.github/pull/210) [`47d1804`](https://github.com/bfra-me/.github/commit/47d180433db0ff1f6c883655a871ba56337fad4f) Thanks [@marcusrbrown](https://github.com/marcusrbrown)! - Renovate: Always enable the Renovate cache

### Patch Changes

- [#207](https://github.com/bfra-me/.github/pull/207) [`c9fdedd`](https://github.com/bfra-me/.github/commit/c9fdedd7b1c9281372e4f26ae0f42fed8c1f3e1f) Thanks [@marcusrbrown](https://github.com/marcusrbrown)! - Renovate: Roll up recent `bfra-me/renovate-action` releases

## 1.6.4

### Patch Changes

- [#204](https://github.com/bfra-me/.github/pull/204) [`5ceacad`](https://github.com/bfra-me/.github/commit/5ceacad87f1bcba7f6e428ae21919691f358e7a9) Thanks [@marcusrbrown](https://github.com/marcusrbrown)! - Renovate: Release latest `bfra-me/renovate-action` updates

## 1.6.3

### Patch Changes

- [#196](https://github.com/bfra-me/.github/pull/196) [`d074a69`](https://github.com/bfra-me/.github/commit/d074a69c67d01ff316dfd2905cf5612197afcfe7) Thanks [@marcusrbrown](https://github.com/marcusrbrown)! - Renovate: Roll up recent `bfra-me/renovate-action` updates

## 1.6.2

### Patch Changes

- [#192](https://github.com/bfra-me/.github/pull/192) [`f5766ab`](https://github.com/bfra-me/.github/commit/f5766ab77bef37e336bbfb52ab40f18b0ece35ef) Thanks [@marcusrbrown](https://github.com/marcusrbrown)! - Renovate: Roll up recent `bfra-me/renovate-action` updates

## 1.6.1

### Patch Changes

- [#180](https://github.com/bfra-me/.github/pull/180) [`c8383d2`](https://github.com/bfra-me/.github/commit/c8383d284d194da2c37d3e5d7405ee629be625fe) Thanks [@marcusrbrown](https://github.com/marcusrbrown)! - Update Renovate dependencies and modify CI concurrency to avoid cancellations

## 1.6.0

### Minor Changes

- [#175](https://github.com/bfra-me/.github/pull/175) [`3cc974c`](https://github.com/bfra-me/.github/commit/3cc974c72f413c9211230d74f149d3b0dd37c2bb) Thanks [@marcusrbrown](https://github.com/marcusrbrown)! - Set the default Renovate log level to debug.

## 1.5.3

### Patch Changes

- [#172](https://github.com/bfra-me/.github/pull/172) [`3fa10b8`](https://github.com/bfra-me/.github/commit/3fa10b8fdcfbc9217637bca782d99fbe12b4a255) Thanks [@marcusrbrown](https://github.com/marcusrbrown)! - Roll-up recent `renovate-action` and `renovate-config` updates

## 1.5.2

### Patch Changes

- [#166](https://github.com/bfra-me/.github/pull/166) [`3fa804d`](https://github.com/bfra-me/.github/commit/3fa804d89f526a06c8daa40fad7af507cff378c9) Thanks [@marcusrbrown](https://github.com/marcusrbrown)! - Update the bfra-me/renovate-config version to 3.0.2

## 1.5.1

### Patch Changes

- [#164](https://github.com/bfra-me/.github/pull/164) [`d97d4a8`](https://github.com/bfra-me/.github/commit/d97d4a8db9ceec8ed1e22d20912dc33db78e62ee) Thanks [@marcusrbrown](https://github.com/marcusrbrown)! - Scope concurrency group to the GitHub repository

## 1.5.0

### Minor Changes

- [#162](https://github.com/bfra-me/.github/pull/162) [`18cdb57`](https://github.com/bfra-me/.github/commit/18cdb57ba457f2065286234a17559445c8f27c50) Thanks [@marcusrbrown](https://github.com/marcusrbrown)! - Add `log_level` input to Renovate reusable workflow

## 1.4.1

### Patch Changes

- [#160](https://github.com/bfra-me/.github/pull/160) [`145b8cb`](https://github.com/bfra-me/.github/commit/145b8cb6ed6ca65d80151b0dbad72f8aa54e2f2f) Thanks [@marcusrbrown](https://github.com/marcusrbrown)! - Do not cancel Renovate jobs that push to `main`

## 1.4.0

### Minor Changes

- [#156](https://github.com/bfra-me/.github/pull/156) [`3ea539b`](https://github.com/bfra-me/.github/commit/3ea539b7237d2b4baafb5ccda151b8c52de7e1b0) Thanks [@marcusrbrown](https://github.com/marcusrbrown)! - Rollup several fixes and updates

## 1.3.0

### Minor Changes

- [#151](https://github.com/bfra-me/.github/pull/151) [`570186a`](https://github.com/bfra-me/.github/commit/570186a4391955ed930e1e0906e6f3f4f16cf1b3) Thanks [@marcusrbrown](https://github.com/marcusrbrown)! - Update to `bfra-me/renovate-action` v3

## 1.2.4

### Patch Changes

- [#147](https://github.com/bfra-me/.github/pull/147) [`08b89bd`](https://github.com/bfra-me/.github/commit/08b89bdd09def6e7fc3a1951972a71d69c13c5d2) Thanks [@marcusrbrown](https://github.com/marcusrbrown)! - Disable branch action input for edited Renovate PRs and use correct ref for dry runs.

## 1.2.3

### Patch Changes

- [#145](https://github.com/bfra-me/.github/pull/145) [`d0ede1f`](https://github.com/bfra-me/.github/commit/d0ede1f991976d843539d594c8e5cf9b17329725) Thanks [@marcusrbrown](https://github.com/marcusrbrown)! - Bump @bfra-me/renovate-action to 2.8.0

## 1.2.2

### Patch Changes

- [#143](https://github.com/bfra-me/.github/pull/143) [`ff7cec4`](https://github.com/bfra-me/.github/commit/ff7cec4568e6ac180af05bfbe4fd0cd82e8eac6f) Thanks [@marcusrbrown](https://github.com/marcusrbrown)! - Update concurrency groups in workflows to use `head_ref` or `ref`

## 1.2.1

### Patch Changes

- [#141](https://github.com/bfra-me/.github/pull/141) [`80be368`](https://github.com/bfra-me/.github/commit/80be368da2663430d1f894bfcaf07f16d5aa1601) Thanks [@marcusrbrown](https://github.com/marcusrbrown)! - Fix `autodiscover` input passed to @bfra-me/renovate-action in the Renovate workflow

## 1.2.0

### Minor Changes

- [#139](https://github.com/bfra-me/.github/pull/139) [`61b7f3a`](https://github.com/bfra-me/.github/commit/61b7f3a9ca453fb9f3cf3593888937230cc66139) Thanks [@marcusrbrown](https://github.com/marcusrbrown)! - Make the `renovate` workflow reusable

## 1.1.1

### Patch Changes

- [#135](https://github.com/bfra-me/.github/pull/135) [`58366ec`](https://github.com/bfra-me/.github/commit/58366ec020f2165855d12ef0cf218d0e05ca289c) Thanks [@marcusrbrown](https://github.com/marcusrbrown)! - Update dependencies

## 1.1.0

### Minor Changes

- [#126](https://github.com/bfra-me/.github/pull/126) [`1eeb9c1`](https://github.com/bfra-me/.github/commit/1eeb9c1ee25a916afe69b98a820104326039c64a) Thanks [@marcusrbrown](https://github.com/marcusrbrown)! - Make the `update-repo-settings` workflow reusable

## 1.0.0

### Major Changes

- [#116](https://github.com/bfra-me/.github/pull/116) [`4382791`](https://github.com/bfra-me/.github/commit/4382791c3962157f59c0be9d048ea8cce4856b12) Thanks [@marcusrbrown](https://github.com/marcusrbrown)! - Create initial release
