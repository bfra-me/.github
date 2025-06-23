---
description: Enforces best practices for configuring Renovate Bot, including automated dependency updates, using presets, defining a review process, and implementing automated testing.
applyTo: '.github/renovate.json*,.github/workflows/renovate.yaml'
---

- **Automated Dependency Updates**

  - Utilize Renovate Bot (or Dependabot) to automate dependency updates, reducing maintenance and security risks.
  - Refer to documentation on setting up Renovate Bot to automatically scan your repositories and projects for dependency updates.

- **Configuration using Presets**

  - Use the `config:best-practices` preset in Renovate to include upgrade best practices, pin dependencies, and migrate configurations.
  - Example of extending the `config:best-practices` preset in your Renovate configuration file:

    ```json
    {
      "extends": ["config:best-practices"]
    }
    ```

  - The `config:best-practices` preset includes:
    - `configMigration`: Automatically migrate old config options to new replacements.
    - `extends config:recommended`: A good base configuration to start from.
    - `docker:pinDigests`: Pin Docker containers to an exact digest for reproducibility.
    - `helpers:pinGitHubActionDigests`: Pin third-party GitHub Actions to a full-length commit SHA for security.
    - `:pinDevDependencies`: Pin development dependencies to ensure consistent tooling.

- **Update Strategy**

  - Update dependencies frequently to keep updates small, make major updates easier, and be ready for CVE patches.
  - Regular updates minimize breaking changes and keep you current with upstream best practices.
  - Automate patch and minor updates while manually reviewing major updates.
  - Use the `:separateMultipleMajorReleases` preset to get separate major updates.

- **Review Process**

  - Define a clear review process for pull requests created by Renovate Bot. Determine who will review PRs and when.
  - Ensure team members are assigned to review pull requests regularly to avoid stale updates.
  - Consider automatically assigning reviewers to pull requests to reduce unmaintained updates and increase the likelihood of prompt reviews.
  - Incorporate release logs and config diffs into the code review process.
  - Use grouping of similar dependencies to combine pull requests and reduce noise.

- **Testing**

  - Implement automated tests to ensure the quality of updates.
  - Without tests, you cannot be sure that everything is working fine after the updates. Set up automated tests with good coverage before enabling Renovate.
  - Run automated tests on every pull request.

- **Noise Reduction**

  - Reduce noise by grouping similar dependencies in pull requests.
  - Use regex-like naming patterns or semantic versioning (e.g., major vs. minor/patch) for grouping.
  - Limit the number of pull requests received per iteration.

- **Configuration Management**

  - Use extensible configuration files for multiple projects or repositories.
  - Define a root configuration file that is extended by every software artifact.

- **Auto Merge**

  - Use auto merge for development and testing dependencies, Typescript type annotations, or patch version updates, where appropriate.
  - Carefully select dependencies suitable for auto-merge.

- **Prioritize Security Updates**

  - Prioritize vulnerability-related updates by creating pull requests for security updates even if the pull-request capacity is exceeded.

- **Reporting**

  - Integrate dependency updates into automated release reports.
  - Label and count dependency-update related releases.
  - Use configured commit message prefixes to mark commits as dependency-bot related.

- **Common Pitfalls and Gotchas**

  - **Configuration Complexity:** Renovate can be highly configurable, which can lead to complex and hard-to-maintain configurations. Start with the `config:best-practices` preset and incrementally add customizations.
  - **Ignoring Updates:** Avoid ignoring updates for long periods, as this leads to dependency debt and makes future updates more difficult. Address updates regularly.
  - **Lack of Testing:** Merging updates without proper testing can lead to unexpected issues in production. Always ensure sufficient test coverage.
  - **Over-Reliance on Auto-Merge:** While auto-merge can be convenient, it's important to carefully consider which dependencies are suitable for automatic updates. Core dependencies and major version updates should be reviewed manually.
  - **Not Reading Changelogs:** Skipping changelogs can lead to missed breaking changes. Always review changelogs for updates to understand potential impacts.

- **Best Practices**

  - **Run Renovate on Every Repository:** Enable Renovate on all projects to automate dependency management.
  - **Talk with Your Team:** Discuss the update strategy with your team and address any concerns.
  - **Make Updating Easy and Fast:** Streamline the update process to encourage frequent updates.
  - **Follow SemVer:** Adhere to Semantic Versioning to minimize breaking changes.

- **Example `renovate.json`:**

  ```json
  {
    "extends": [
      "config:best-practices",
      ":timezone(America/Los_Angeles)",
      ":semanticCommits",
      "group:monorepos",
      "schedule:weekly"
    ],
    "automerge": true,
    "major": {
      "automerge": false
    },
    "labels": ["dependencies"],
    "reviewers": ["your-team-member"]
  }
  ```

- **DON'T:** Use long-lived branches that diverge from main over time.
- **DO:** Ensure company policy allows frequent updates.
