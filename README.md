<h3 align="center">
  <img alt="transparent" src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/misc/transparent.png" height="30" width="0px"/>
  .github
  <img alt="transparent" src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/misc/transparent.png" height="30" width="0px"/>
</h3>

<p align="center">
  <a href="https://github.com/bfra-me/.github/releases/latest" title="Latest Release on GitHub"><img alt="GitHub Release" src="https://img.shields.io/github/v/release/bfra-me/.github?sort=semver&style=for-the-badge&logo=github&label=release"></a>
  <a href="https://github.com/bfra-me/.github/actions?query=workflow%3Amain" title="Search GitHub Actions for Main workflow runs" ><img alt="GitHub Workflow Main Status" src="https://img.shields.io/github/actions/workflow/status/bfra-me/.github/main.yaml?branch=main&style=for-the-badge&logo=github%20actions&logoColor=white&label=main"></a>
  <a href="https://securityscorecards.dev/viewer/?uri=github.com/bfra-me/.github" title="View OpenSSF Scorecard"><img alt="OpenSSF Scorecard" src="https://api.securityscorecards.dev/projects/github.com/bfra-me/.github/badge?style=for-the-badge"></a>
</p>

<p align="center">
  Community health files and configuration for the <a href="https://github.com/bfra-me">@bfra-me</a> GitHub organization
</p>

&nbsp;

This repository is used as a template for `.github` repositories. After creating a new repository using the template, this file should be replaced by [.github/README.md](.github/README.md).

It contains a collection of reusable workflows and workflow templates for the GitHub Actions ecosystem. Global settings for the @bfra-me organization are defined here.

## Reusable Workflows

This repository contains reusable workflows that can be used in other repositories.

### `renovate.yaml`

Renovate is used to manage the dependencies of the repository. This workflow runs a self-hosted Renovate bot (see: [@bfra-me/renovate-action](https://github.com/bfra-me/renovate-action) to create and update the dependency update PRs.

### `update-repo-settings.yaml`

Update repository settings. Repository settings are defined in [.github/settings.yml](.github/settings.yml) in the same format used by the [Reository Settings App](https://github.com/repository-settings/app). The workflow uses the [elstudio/actions-settings](https://github.com/elstudio/actions-settings/tree/v3-beta) action to update the repository settings.

## Development

This repository uses [pnpm](https://pnpm.io/) as the package manager.

To install the dependencies, run:

```bash
pnpm bootstrap
```

### Releases

Releases are managed using [changesets](https://github.com/changesets/changesets). Renovate dependency updates are captured in changesets by the `renovate-changeset` workflow.
