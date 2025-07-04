---
description: Enforces best practices for pnpm package management, including dependency management, security, performance, and tooling. This rule ensures efficient and consistent project setup and development workflows.
applyTo: '**/package.json,.pnpmfile.cjs,.npmrc'
---

- **Overview**
  - pnpm (Performant npm) is a package manager that optimizes disk space and installation speed through a shared dependency model. This guide outlines best practices for using pnpm to ensure efficient and maintainable projects.

- **Dependency Management**
  - **Use `pnpm install` to install dependencies.**
    - This command installs dependencies defined in `package.json` and generates/updates the `pnpm-lock.yaml` file.
  - **Use `pnpm add <package>` to add new dependencies.**
    - Example: `pnpm add lodash` adds Lodash as a project dependency.
    - Specify version ranges (e.g., `pnpm add lodash@^4.0.0`) to control updates.
  - **Use `pnpm remove <package>` to remove dependencies.**
    - Example: `pnpm remove lodash` removes Lodash from the project.
  - **Keep `pnpm-lock.yaml` under version control.**
    - This file ensures deterministic dependency resolution across different environments.
    - Do not manually edit this file.
  - **Update dependencies regularly using `pnpm update`.**
    - This command updates dependencies to their latest versions within the specified ranges in `package.json`.
    - Review changes carefully to avoid breaking changes.
  - **Use workspaces for monorepos.**
    - Define workspaces in `pnpm-workspace.yaml` to manage multiple packages in a single repository.
    - Example `pnpm-workspace.yaml`:

    ```yaml
    packages:
      - 'packages/*'
    ```

  - **Leverage `.pnpmfile.cjs` for patching dependencies.**
    - Use this file to apply patches to dependencies during installation. This is preferred over directly modifying files in `node_modules`.
    - Example:

    ```javascript
    // .pnpmfile.cjs
    module.exports = {
      hooks: {
        readPackage(pkg, context) {
          if (pkg.name === 'some-problematic-package') {
            pkg.dependencies['another-package'] = 'fixed-version';
          }
          return pkg;
        },
      },
    };
    ```

  - **Use `pnpm dedupe` to optimize the dependency tree.**
    - This command analyzes and optimizes the dependency graph by removing duplicate packages, further saving disk space.

- **Code Organization and Structure:**
  - **Directory Structure:**
    - `src/`: Contains the main application source code.
    - `packages/`: (For monorepos) Contains individual packages within the monorepo.
    - `test/`: Contains unit, integration, and end-to-end tests.
    - `config/`: Configuration files for different environments.
  - **File Naming Conventions:**
    - Use descriptive names for files and directories.
    - Follow a consistent naming convention (e.g., `kebab-case` for files, `PascalCase` for components).
  - **Module Organization:**
    - Organize code into reusable modules.
    - Use ES modules (`import`/`export`) for better maintainability and tree-shaking.
  - **Component Architecture:**
    - Adopt a component-based architecture for UI development (if applicable).
    - Use a framework like React, Vue, or Angular with pnpm.
  - **Code Splitting:**
    - Use dynamic `import()` statements to split code into smaller chunks.
    - Optimize initial load time by loading only necessary code.

- **Common Patterns and Anti-patterns:**
  - **Design Patterns:**
    - Singleton: Use sparingly for global state management.
    - Factory: Create instances of objects without specifying their concrete classes.
    - Observer: Define a one-to-many dependency between objects.
  - **Recommended Approaches:**
    - Use environment variables for configuration.
    - Implement proper logging for debugging.
    - Write comprehensive tests.
  - **Anti-patterns:**
    - Avoid global state when possible.
    - Don't directly modify files in `node_modules`.
    - Don't commit `node_modules` to version control.
  - **State Management:**
    - Use a state management library like Redux, Zustand, or Valtio for complex applications (if applicable).
  - **Error Handling:**
    - Implement try-catch blocks for error handling.
    - Use error tracking services like Sentry to monitor errors in production.

- **Performance Considerations:**
  - **Optimization Techniques:**
    - Minimize bundle size through tree-shaking and code splitting.
    - Optimize images and other assets.
    - Use caching to reduce network requests.
  - **Memory Management:**
    - Avoid memory leaks by properly releasing resources.
    - Use tools like the Chrome DevTools memory profiler to identify memory issues.
  - **Rendering Optimization:** (If applicable to UI frameworks)
    - Use virtualization for large lists.
    - Optimize rendering performance with techniques like memoization.
  - **Bundle Size Optimization:**
    - Use tools like Webpack Bundle Analyzer to analyze bundle size.
    - Remove unused code and dependencies.
  - **Lazy Loading:**
    - Load components or modules on demand using dynamic imports.

- **Security Best Practices:**
  - **Common Vulnerabilities:**
    - Cross-site scripting (XSS).
    - Cross-site request forgery (CSRF).
    - Dependency vulnerabilities.
  - **Input Validation:**
    - Validate all user inputs to prevent injection attacks.
    - Sanitize inputs before displaying them.
  - **Authentication and Authorization:**
    - Implement secure authentication and authorization mechanisms.
    - Use JWT (JSON Web Tokens) for authentication.
  - **Data Protection:**
    - Encrypt sensitive data.
    - Protect against data breaches by following security best practices.
  - **Secure API Communication:**
    - Use HTTPS for all API communication.
    - Implement proper CORS (Cross-Origin Resource Sharing) configuration.

- **Testing Approaches:**
  - **Unit Testing:**
    - Write unit tests for individual components and functions.
    - Use a testing framework like Jest or Mocha.
  - **Integration Testing:**
    - Test the integration between different parts of the application.
  - **End-to-End Testing:**
    - Test the entire application flow from end to end.
    - Use a tool like Cypress or Playwright.
  - **Test Organization:**
    - Organize tests in a clear and consistent manner.
    - Use descriptive names for test files and functions.
  - **Mocking and Stubbing:**
    - Use mocking and stubbing to isolate units of code during testing.
    - Tools like Jest and Sinon.JS provide mocking capabilities.

- **Common Pitfalls and Gotchas:**
  - **Frequent Mistakes:**
    - Forgetting to commit `pnpm-lock.yaml`.
    - Directly modifying files in `node_modules`.
    - Incorrectly configuring workspaces.
  - **Edge Cases:**
    - Handling optional dependencies.
    - Managing peer dependencies.
  - **Version-Specific Issues:**
    - Check the pnpm release notes for any breaking changes or known issues.
  - **Compatibility Concerns:**
    - Ensure compatibility between pnpm and other tools in the development environment.
  - **Debugging Strategies:**
    - Use `console.log` for debugging.
    - Use a debugger in your IDE or the Chrome DevTools.
    - Use `pnpm ls` to inspect the dependency tree.

- **Tooling and Environment:**
  - **Recommended Tools:**
    - IDE: VS Code, IntelliJ IDEA, WebStorm
    - Build Tools: Webpack, Rollup, Parcel
    - Linters: ESLint, Stylelint
    - Formatters: Prettier
  - **Build Configuration:**
    - Configure build tools to optimize for production.
    - Use environment variables for different build configurations.
  - **Linting and Formatting:**
    - Use ESLint and Prettier to enforce code style and quality.
    - Configure linting and formatting to run automatically on commit.
  - **Deployment:**
    - Use a CI/CD pipeline to automate deployment.
    - Deploy to a cloud provider like AWS, Azure, or Google Cloud.
  - **CI/CD Integration:**
    - Integrate pnpm into your CI/CD pipeline.
    - Use caching to speed up builds.

- **`.npmrc` Configuration**
  - **`shamefully-hoist=true`**: Avoid using this option unless absolutely necessary. While it can resolve certain dependency issues, it circumvents pnpm's strict dependency isolation, potentially leading to unexpected behavior. Consider alternative solutions like aliasing dependencies or using `.pnpmfile.cjs` to patch problematic packages.
  - **`strict-peer-dependencies=true`**: Enforces strict peer dependency requirements, preventing potential runtime errors caused by incompatible peer dependency versions.
  - **`node-linker=hoisted`**: While this option might seem appealing for compatibility with tools expecting a flat `node_modules` structure, it negates pnpm's benefits. Avoid it and explore alternatives if possible. If required, understand the implications for disk space usage and dependency isolation.
  - **`public-hoist-pattern[]=*`**: Avoid using this. Prefer controlled hoisting using explicit configurations if truly needed.
  - **`auto-install-peers=true`**: Let pnpm handle peer dependencies by default.

- **Examples**
  - **Migrating from npm/Yarn to pnpm**

    ```bash
    # Install pnpm globally
    npm install -g pnpm

    # Remove node_modules
    rm -rf node_modules

    # Remove package-lock.json or yarn.lock
    rm package-lock.json || rm yarn.lock

    # Install dependencies with pnpm
    pnpm install
    ```

  - **Using pnpm with Docker**
    - Optimize Docker images by leveraging pnpm's caching.

    ```dockerfile
    FROM node:18-alpine AS builder

    WORKDIR /app

    COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
    RUN npm install -g pnpm && pnpm install --frozen-lockfile

    COPY . ./
    RUN pnpm build

    FROM node:18-alpine
    WORKDIR /app

    COPY --from=builder /app/dist ./
    COPY --from=builder /app/node_modules ./node_modules

    CMD ["node", "index.js"]
    ```

  - **Using `.pnpmfile.cjs` to alias dependencies**

    ```javascript
    // .pnpmfile.cjs
    export default {
      hooks: {
        readPackage(pkg) {
          if (pkg.dependencies && pkg.dependencies['old-package']) {
            pkg.dependencies['new-package'] = pkg.dependencies['old-package'];
            delete pkg.dependencies['old-package'];
          }
          return pkg;
        },
      },
    };
    ```

- **Conclusion**
  - By following these best practices, you can leverage pnpm to build efficient, secure, and maintainable Node.js projects. Embrace pnpm's unique dependency management approach to optimize disk space, installation speed, and overall development workflow.
