---
description: Enforces best practices for GitHub Actions workflows, including automation, testing, security, and CI/CD integration. This ensures efficient, reliable, and secure workflows for software development.
applyTo: '.github/workflows/*.yaml,.github/actions/**/*'
---

- **General Workflow Structure**

  - **Use descriptive names**: Action and job names should clearly indicate their purpose.

    - Example:

    ```yaml
       name: Build and Test
       jobs:
         unit-tests: # Good: Clear and concise
         integration-tests:
         deploy: # Good: Direct and informative
    ```

    ```yaml
       name: Action1 # Bad: Not descriptive
       jobs:
         job1: # Bad: Vague
    ```

  - **Organize workflows logically**: Separate workflows for different purposes (e.g., CI, CD, scheduled tasks).
  - **Leverage workflow templates**: Use workflow templates to promote consistency across repositories.
    - Workflow templates can be stored in a central repository and referenced in other repositories.

- **CI/CD Best Practices**

  - **Automate tests**: Integrate automated tests (unit, integration, end-to-end) into your workflows.
    - Utilize various testing frameworks and tools based on the programming language and project requirements.
  - **Run tests in parallel**: Execute tests concurrently to reduce overall build time.

    - Utilize `strategy: matrix` to parallelize tests across different environments or configurations.
    - Example:

    ```yaml
      jobs:
        test:
          strategy:
            matrix:
              os: [ubuntu-latest, windows-latest]
              node-version: [16.x, 18.x]
          runs-on: ${{ matrix.os }}
          steps:
            - uses: actions/checkout@v3
            - name: Use Node.js ${{ matrix.node-version }}
              uses: actions/setup-node@v3
              with:
                node-version: ${{ matrix.node-version }}
            - run: npm install
            - run: npm test
    ```

  - **Prioritize faster tests**: Run faster tests first to identify failures early in the pipeline.
  - **Publish build results**: Publish the status of the latest build to the relevant channels.
    - Integrate with communication platforms like Slack or Microsoft Teams to notify developers about build failures or successes.
  - **Automate build and deployment**: Fully automate the build, test, and deployment processes.
    - Decouple releases from deployments by using feature flags or environment-specific configurations.
  - **Make the pipeline the only way to deploy**: Do not allow exceptions to the CI/CD process, ensuring that every change goes through the pipeline.
  - **Deploy the same way to all environments**: Use the same automated release mechanism for each environment to avoid surprises in production.
  - **Build only once and promote the result**: If the software requires a build, packaging, or bundling step, that step should be executed only once, and the resulting output should be reused throughout the entire pipeline.

- **Code Quality and Testing**

  - **Run tests locally**: Developers should run tests locally before committing code to the repository.
  - **Commit code frequently**: Encourage small, frequent commits to ease tracking of changes.
  - **Focus on documentation**: Ensure proper documentation, comments, and consistent naming conventions.
  - **Do incremental changes**: Break down features into smaller sub-features, facilitating incremental builds and easier issue isolation.
  - **Involve relevant stakeholders**: Involve developers, QA engineers, and IT operations specialists in the automation planning and execution.

- **Efficiency and Performance**

  - **Use caching**: Cache dependencies and build outputs to speed up workflow execution.

    - Example:

    ```yaml
      steps:
        - uses: actions/checkout@v3
        - name: Cache dependencies
          uses: actions/cache@v3
          with:
            path: ~/.npm
            key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}
            restore-keys:
              ${{ runner.os }}-npm-
        - run: npm install
    ```

  - **Use reusable actions**: Create and use reusable actions to avoid code duplication.
  - **Minimize image size**: Use smaller base images for Docker containers.
  - **Run jobs concurrently**: Utilize parallelization whenever possible.
  - **Keep pipelines fast**: Optimize workflows to reduce execution time and improve development velocity.

- **Security Best Practices**

  - **Secrets Management**: Store sensitive information (API keys, passwords) as encrypted secrets.

    - Use GitHub Secrets to securely store and manage sensitive information.
    - Example:

    ```yaml
      steps:
        - name: Deploy to production
          uses: some-action/deploy@v1
          with:
            api_key: ${{ secrets.PRODUCTION_API_KEY }}
    ```

  - **Avoid hardcoding secrets**: Never hardcode secrets directly into workflow files.
  - **Use a limited account**: Run scripts from a limited account, and escalate privileges only for commands that need higher privileges, which helps prevent catastrophic events.
  - **Scan for vulnerabilities**: Integrate vulnerability scanning tools to detect security vulnerabilities in dependencies and code.
  - **Enforce branch protection rules**: Protect important branches (e.g., `main`) with branch protection rules.
    - Require code reviews, status checks, and signed commits to prevent unauthorized changes.
  - **Use security headers**: Use security headers to protect against common web vulnerabilities.
  - **Monitor for malicious activity**: Monitor GitHub Actions logs for suspicious activity and security breaches.

- **Workflow Management and Optimization**

  - **Monitor CI/CD pipelines**: Problems can and will occur in our pipeline. We may have a test that fails randomly or have problems talking to a third-party service.
  - **Smoke-Test the deployments**: Smoke testing allows us to quickly assess the status of an application by running a set of end-to-end tests targeted at checking the most important, or the most significant, user flows.
  - **Stop the pipeline when it fails**: When a stage in the pipeline fails, we should automatically stop the process. Fix whatever broke and start again from scratch before doing anything else.
  - **Use Infrastructure as Code**: Infrastructure as Code (IaC) is a practice in which infrastructure is provisioned and managed using code and software development techniques, such as version control and continuous integration.
  - **Test the infrastructure code**: Always test the infrastructure code in a non-production environment. Use the same pipeline to test the infrastructure code.
  - **Wrap the inputs in a timeout**: CI/CD servers have a mechanism for timing out any given step of the pipeline. As a best practice, we should always plan for timeouts around the inputs for healthy cleanup of the pipeline.
  - **Avoid complex scripts in code pipeline**: Long scripts generally indicate that they are doing too many things. Small scripts are better to read, and it is faster to understand the purpose.

- **Versioning and Rollbacks**

  - **Use semantic versioning**: Adhere to semantic versioning (SemVer) for consistent version management.
  - **Rollback with version control**: Ensure a seamless rollback mechanism using version control systems. In such cases, the developer who pushed that fix should be able to roll back his changes so that the release is not stalled, and he also gets some more time to relook at his implementation.
  - **Emergency deployments and rollbacks**: As much as we want our code to work perfectly, there are situations when major bugs are discovered in a release after it is already deployed to an environment. In such cases, rolling back the deployment is the best way to recover while we fix the problems.

- **Tooling and Environment**

  - **Use Pipeline as Code**: Pipelines as Code emphasizes that the configuration of delivery pipelines that build, test, and deploy our applications or infrastructure should be treated as code.
  - **Do all work within a stage**: Stages contain a sequence of one or more stage directives. The stages section is where the bulk of the work will be located. Any non-setup work within our pipeline should occur within a stage block.
  - **Linting and Formatting**: Use linters and formatters to enforce code style and consistency (e.g., `yamllint`).

- **GitOps**

  - **Use GitOps**: GitOps is a way of implementing Continuous Deployment for cloud-native applications.
  - **Version control for all**: Everything from source code and configuration to infrastructure and the database should be version controlled.

- **Monitoring and Alerting**

  - **Do application monitoring**: It can provide request and response information, database connection information, remote profiling and tracing for slow spots, and other metrics related to the health of the services.
  - **Review metrics on a regular basis**: The thresholds we establish might be too high or too low. If we're receiving too many alerts, or we aren't notified when a legitimate issue occurs, it's time to review the threshold settings.
  - **Have an alert system**: Alerts allow us to identify problems in the system moments after they occur. By quickly identifying unintended changes to the system, we can minimize service disruptions.

- **Testing Approaches**

  - **Unit testing strategies for GitHub Actions components**: Employ unit tests to validate the behavior of individual action components in isolation.
  - **Integration testing approaches for GitHub Actions applications**: Implement integration tests to ensure that actions interact correctly with other services and resources.
  - **End-to-end testing recommendations for GitHub Actions projects**: Perform end-to-end tests to verify the complete workflow from start to finish.
  - **Test organization best practices for GitHub Actions**: Organize tests into logical groups based on functionality or component.

- **Common Pitfalls and Gotchas**

  - **Frequent mistakes developers make when using GitHub Actions**: Failing to secure secrets, neglecting to cache dependencies, and writing overly complex workflows.
  - **Edge cases to be aware of when using GitHub Actions**: Handling rate limits, managing concurrency, and dealing with transient network errors.
  - **Version-specific issues with GitHub Actions**: Changes in action syntax, deprecation of features, and compatibility issues with older runner environments.
  - **Compatibility concerns between GitHub Actions and other technologies**: Ensuring that actions are compatible with the target operating systems, programming languages, and cloud platforms.

- **Best Practices specific for Docker containers**

  - **Minimize image size**: Utilize multi-stage builds to reduce the final image size, include only required dependencies, and remove unnecessary files.
  - **Pin image versions**: Always pin image versions to avoid unexpected changes and ensure reproducibility.
  - **Avoid running as root**: Avoid running containers as root to minimize the risk of privilege escalation.
  - **Scan images for vulnerabilities**: Use tools like Trivy or Snyk to scan Docker images for known vulnerabilities before deploying them to production.

- **Example of a Comprehensive Workflow YAML**

  ```yaml
  name: CI/CD Pipeline

  on:
    push:
      branches: [main]
    pull_request:
      branches: [main]

  jobs:
    build:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v3
        - name: Set up Node.js
          uses: actions/setup-node@v3
          with:
            node-version: 16.x
        - name: Install dependencies
          run: npm install
        - name: Lint
          run: npm run lint
        - name: Build
          run: npm run build

    test:
      needs: build
      runs-on: ubuntu-latest
      strategy:
        matrix:
          node-version: [16.x, 18.x]
      steps:
        - uses: actions/checkout@v3
        - name: Use Node.js ${{ matrix.node-version }}
          uses: actions/setup-node@v3
          with:
            node-version: ${{ matrix.node-version }}
        - name: Install dependencies
          run: npm install
        - name: Run unit tests
          run: npm run test:unit
        - name: Run integration tests
          run: npm run test:integration
        - name: Upload coverage to Codecov
          uses: codecov/codecov-action@v3

    deploy:
      needs: test
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v3
        - name: Configure AWS credentials
          uses: aws-actions/configure-aws-credentials@v1
          with:
            aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
            aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
            aws-region: us-east-1
        - name: Deploy to S3 bucket
          run: aws s3 sync ./dist s3://my-bucket
        - name: Invalidate CloudFront cache
          run: aws cloudfront create-invalidation --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} --paths "/*"
  ```

By following these best practices, you can create robust, efficient, and secure GitHub Actions workflows for your software development projects.
