# @bfra.me/.github

## 2.6.0
### Minor Changes


- Ignore bot edits to Renovate issues/PRs; ignore pushes to `main`. ([#720](https://github.com/bfra-me/.github/pull/720))


### Patch Changes


- Updated dependency `eslint-plugin-prettier` to `5.4.1`. ([#719](https://github.com/bfra-me/.github/pull/719))


- Update repository metadata files based on the latest organization scan. ([#716](https://github.com/bfra-me/.github/pull/716))

## 2.5.4
### Patch Changes


- Updated dependency `@bfra.me/eslint-config` to `0.20.9`. ([#712](https://github.com/bfra-me/.github/pull/712))


- Updated dependency `@bfra.me/eslint-config` to `0.20.7`. ([#706](https://github.com/bfra-me/.github/pull/706))


- Updated dependency `@bfra.me/eslint-config` to `0.20.8`. ([#709](https://github.com/bfra-me/.github/pull/709))
  Updated dependency `@bfra.me/prettier-config` to `0.15.5`.

## 2.5.3
### Patch Changes


- Updated dependency `eslint` to `9.27.0`. ([#702](https://github.com/bfra-me/.github/pull/702))


- Updated dependency `@changesets/cli` to `2.29.4`. ([#694](https://github.com/bfra-me/.github/pull/694))


- Updated dependency `@bfra.me/eslint-config` to `0.20.6`. ([#691](https://github.com/bfra-me/.github/pull/691))


- Updated dependency `@types/node` to `22.15.18`. ([#700](https://github.com/bfra-me/.github/pull/700))


- Updated dependency `packageManager` to `pnpm@10.11.0`. ([#695](https://github.com/bfra-me/.github/pull/695))

## 2.5.2
### Patch Changes


- Updated dependency `@changesets/cli` to `2.29.3`. ([#682](https://github.com/bfra-me/.github/pull/682))


- Updated dependency `eslint-config-prettier` to `10.1.5`. ([#688](https://github.com/bfra-me/.github/pull/688))


- Updated dependency `eslint-config-prettier` to `10.1.3`. ([#685](https://github.com/bfra-me/.github/pull/685))


- Updated dependency `@bfra.me/eslint-config` to `0.20.5`. ([#678](https://github.com/bfra-me/.github/pull/678))


- Updated dependency `eslint-plugin-prettier` to `5.4.0`. ([#683](https://github.com/bfra-me/.github/pull/683))


- Updated dependency `lint-staged` to `15.5.2`. ([#684](https://github.com/bfra-me/.github/pull/684))

## 2.5.1
### Patch Changes


- Updated dependency `packageManager` to `pnpm@10.10.0`. ([#663](https://github.com/bfra-me/.github/pull/663))


- Updated dependency `eslint-plugin-prettier` to `5.3.1`. ([#675](https://github.com/bfra-me/.github/pull/675))


- Updated dependency `@bfra.me/eslint-config` to `0.20.4`. ([#674](https://github.com/bfra-me/.github/pull/674))


- Updated dependency `@bfra.me/eslint-config` to `0.20.3`. ([#669](https://github.com/bfra-me/.github/pull/669))


- Updated dependency `tsx` to `4.19.4`. ([#665](https://github.com/bfra-me/.github/pull/665))


- Updated dependency `@bfra.me/eslint-config` to `0.20.2`. ([#659](https://github.com/bfra-me/.github/pull/659))


- Updated dependency `@types/node` to `22.15.3`. ([#667](https://github.com/bfra-me/.github/pull/667))


- Updated dependency `eslint` to `9.26.0`. ([#672](https://github.com/bfra-me/.github/pull/672))

## 2.5.0
### Minor Changes


- Enhance AI rule consumption with detailed selection guidelines and migration plan ([#657](https://github.com/bfra-me/.github/pull/657))
  
  ## Primary Change
  - Add detailed priority scoring system to rule-preprocessing.mdc
  - Create comprehensive rule migration plan with rule-migration.mdc
  - Enhance rule relevance detection with explicit signals
  
  ## Secondary Changes
  - Update rule-preprocessing.mdc to conform to new AI-focused template format
  - Add structured conflict resolution decision tree
  - Implement detailed keyword and pattern matching guidance
  - Update project documentation to reflect task completion
  
  ## Migration Required
  All existing rules will need to be migrated to the new AI-focused templates following the guidance in rule-migration.mdc.

### Patch Changes


- Add AI-focused rule templates to cursor-rules.mdc to optimize rule consumption by AI assistants. This includes templates with explicit directive markers, standardized formatting for pattern recognition, scope definition, and priority levels. ([#656](https://github.com/bfra-me/.github/pull/656))


- Add "Related Files" sections to documentation and improve file path handling in templates ([#645](https://github.com/bfra-me/.github/pull/645))
  
  - Add "Related Files" sections to architecture, technical, and product requirement docs
  - Add "Related Files" sections to task documentation files
  - Update memory templates with improved file path handling and examples
  - Standardize file reference format across documentation

- Refactor MCP tool usage documentation for improved clarity and organization. ([#647](https://github.com/bfra-me/.github/pull/647))
  
  - Streamlined the MCP tool usage documentation structure
  - Updated rule cross-references to use proper linking syntax
  - Reorganized sections for better logical flow
  - Improved formatting and consistency
  - Removed duplicated content and redundant instructions

- Update memory files to reflect completion of Cursor Rules Enhancement Tasks #1 and #2. Add detailed information about the AI-Optimized Rule Relationship Diagram and AI-Focused Rule Templates to architecture.md, technical.md, active_context.md, and tasks_plan.md. ([#656](https://github.com/bfra-me/.github/pull/656))


- Updated dependency `packageManager` to `pnpm@10.9.0`. ([#643](https://github.com/bfra-me/.github/pull/643))


- Updated dependency `@bfra.me/eslint-config` to `0.20.1`. ([#658](https://github.com/bfra-me/.github/pull/658))


- Updated dependency `eslint` to `9.25.1`. ([#646](https://github.com/bfra-me/.github/pull/646))


- Add AI-optimized rule relationship visualization to rules.mdc ([#655](https://github.com/bfra-me/.github/pull/655))

## 2.4.0
### Minor Changes


- Add architectural decisions and implementation tasks for two new systems: ([#635](https://github.com/bfra-me/.github/pull/635))
  1. Preference monitoring system integrated with [Knowledge Graph](https://github.com/modelcontextprotocol/servers/tree/main/src/memory) MCP server for maintaining and evaluating user preferences stored alongside other contextual knowledge
  2. Repository metrics and trigger system for automated collection and evaluation of repository health metrics

- Enhance documentation and rules system with comprehensive guidelines for project management. Add new rules for change validation, content context management, and knowledge graph operations. Update technical documentation with system architecture details and development environment specifications. Improve existing rules for memory files and continuous improvement processes. ([#636](https://github.com/bfra-me/.github/pull/636))


- Improve Memory Files framework with enhanced Knowledge Graph integration and better rule cohesion. ([#640](https://github.com/bfra-me/.github/pull/640))
  
  - Update architecture-understanding to include directory structure and improve formatting
  - Create consolidated error-management framework from debug and error-documentation
  - Enhance development-workflow with standardized planning and implementation processes
  - Upgrade rules.mdc as central rule management framework
  - Enhance lessons-learned with proper formatting and knowledge management
  - Update memory_files with Knowledge Graph integration and cross-referencing
  - Add proper integration points between all rules
  - Improve rule formatting for AI agent guidance
  - Remove redundant TypeScript interfaces in favor of descriptive guidance

- Enhance meta rules system with comprehensive framework for rule evolution and maintenance. Introduces structured evaluation metrics, progressive learning system, and detailed quality management protocols. Updates include new integration points for cross-referencing and improved context management in AI agents. ([#638](https://github.com/bfra-me/.github/pull/638))


- Add comprehensive documentation and improve development workflow with Cursor rules ([#628](https://github.com/bfra-me/.github/pull/628))


- Consolidate and modernize core rule system with enhanced integration capabilities. ([#640](https://github.com/bfra-me/.github/pull/640))
  
  - Merge directory-structure into architecture-understanding for unified system structure management
  - Combine debug and error-documentation into new error-management framework
  - Consolidate plan and implement into comprehensive development-workflow system
  - Enhance rules.mdc as central rule management framework
  - Add Knowledge Graph integration across all rules
  - Implement modern tool integration patterns
  - Add type definitions for key interfaces
  - Improve cross-referencing and validation protocols

- Create ADR and implementation tasks for repository metrics and trigger system. This system will provide automated collection and evaluation of repository metrics through GitHub Actions, including code quality, test coverage, build performance, dependency health, and security metrics. ([#635](https://github.com/bfra-me/.github/pull/635))


### Patch Changes


- Fix Cursor rule formatting issues in Memory Files framework. ([#640](https://github.com/bfra-me/.github/pull/640))
  
  - Add proper frontmatter to all rules following cursor_rules.mdc guidelines
  - Update cross-references to point to consolidated files
  - Fix rule-management.mdc (formerly rules.mdc) as central entry point
  - Ensure consistent formatting for AI agent guidance
  - Update references from consolidated files (debug.mdc → error-management.mdc, directory-structure.mdc → architecture-understanding.mdc)

- Updated dependency `@bfra.me/eslint-config` to `0.20.0`. ([#618](https://github.com/bfra-me/.github/pull/618))


- Updated dependency `@changesets/cli` to `2.29.2`. ([#627](https://github.com/bfra-me/.github/pull/627))


- Updated dependency `packageManager` to `pnpm@10.8.1`. ([#624](https://github.com/bfra-me/.github/pull/624))


- Updated dependency `@changesets/cli` to `2.29.1`. ([#626](https://github.com/bfra-me/.github/pull/626))


- Updated dependency `@types/node` to `22.14.1`. ([#625](https://github.com/bfra-me/.github/pull/625))


- Updated dependency `@changesets/cli` to `2.29.0`. ([#623](https://github.com/bfra-me/.github/pull/623))


- Updated dependency `eslint` to `9.25.0`. ([#632](https://github.com/bfra-me/.github/pull/632))


- Optimize Renovate workflow by merging prepare and trigger-updates jobs into a single renovate job for improved maintainability and reduced complexity. ([#633](https://github.com/bfra-me/.github/pull/633))


- Add comprehensive documentation for GitHub Actions workflows including CodeQL Analysis, Dependency Review, Renovate, and OpenSSF Scorecard workflows. ([#630](https://github.com/bfra-me/.github/pull/630))

## 2.3.5
### Patch Changes


- Updated dependency `@bfra.me/eslint-config` to `0.18.1`. ([#614](https://github.com/bfra-me/.github/pull/614))


- Updated dependency `eslint-config-prettier` to `10.1.2`. ([#615](https://github.com/bfra-me/.github/pull/615))


- Updated dependency `@bfra.me/eslint-config` to `0.19.0`. ([#616](https://github.com/bfra-me/.github/pull/616))
  Updated dependency `@bfra.me/prettier-config` to `0.15.4`.

- Updated dependency `lint-staged` to `15.5.1`. ([#617](https://github.com/bfra-me/.github/pull/617))


- Updated dependency `packageManager` to `pnpm@10.8.0`. ([#611](https://github.com/bfra-me/.github/pull/611))

## 2.3.4
### Patch Changes


- Updated dependency `eslint-plugin-prettier` to `5.2.6`. ([#605](https://github.com/bfra-me/.github/pull/605))


- Updated dependency `packageManager` to `pnpm@10.7.1`. ([#603](https://github.com/bfra-me/.github/pull/603))


- Updated dependency `typescript` to `5.8.3`. ([#607](https://github.com/bfra-me/.github/pull/607))


- Updated dependency `@types/node` to `22.13.15`. ([#600](https://github.com/bfra-me/.github/pull/600))


- Updated dependency `eslint` to `9.24.0`. ([#606](https://github.com/bfra-me/.github/pull/606))


- Updated dependency `@types/node` to `22.13.16`. ([#602](https://github.com/bfra-me/.github/pull/602))

## 2.3.3
### Patch Changes


- Increase the Renovate workflow timeout to 30 minutes. ([#597](https://github.com/bfra-me/.github/pull/597))


- Updated dependency `packageManager` to `pnpm@10.4.1`. ([#590](https://github.com/bfra-me/.github/pull/590))


- Updated dependency `typescript` to `5.8.2`. ([#589](https://github.com/bfra-me/.github/pull/589))


- Updated dependency `eslint-plugin-prettier` to `5.2.4`. ([#582](https://github.com/bfra-me/.github/pull/582))


- Updated dependency `eslint-plugin-prettier` to `5.2.5`. ([#591](https://github.com/bfra-me/.github/pull/591))


- Updated dependency `@bfra.me/eslint-config` to `0.18.0`. ([#594](https://github.com/bfra-me/.github/pull/594))


- Updated dependency `packageManager` to `pnpm@10.7.0`. ([#593](https://github.com/bfra-me/.github/pull/593))


- Updated dependency `@bfra.me/eslint-config` to `0.17.0`. ([#584](https://github.com/bfra-me/.github/pull/584))
  Updated dependency `@bfra.me/prettier-config` to `0.15.3`.

- Updated dependency `packageManager` to `pnpm@10.6.5`. ([#590](https://github.com/bfra-me/.github/pull/590))

## 2.3.2
### Patch Changes


- Updated dependency `eslint` to `9.23.0`. ([#579](https://github.com/bfra-me/.github/pull/579))

## 2.3.1
### Patch Changes


- Updated dependency `packageManager` to `pnpm@9.15.9`. ([#567](https://github.com/bfra-me/.github/pull/567))


- Updated dependency `@types/node` to `22.13.10`. ([#571](https://github.com/bfra-me/.github/pull/571))


- Updated dependency `packageManager` to `pnpm@9.15.8`. ([#564](https://github.com/bfra-me/.github/pull/564))


- Updated dependency `lint-staged` to `15.5.0`. ([#570](https://github.com/bfra-me/.github/pull/570))

## 2.3.0
### Minor Changes


- Add security workflows. ([#533](https://github.com/bfra-me/.github/pull/533))


### Patch Changes


- Updated dependency `eslint` to `9.22.0`. ([#563](https://github.com/bfra-me/.github/pull/563))


- Updated dependency `packageManager` to `pnpm@9.15.7`. ([#559](https://github.com/bfra-me/.github/pull/559))


- Updated dependency `prettier` to `3.5.3`. ([#552](https://github.com/bfra-me/.github/pull/552))


- Updated dependency `eslint-config-prettier` to `10.1.1`. ([#560](https://github.com/bfra-me/.github/pull/560))

## 2.2.0
### Minor Changes


- Trigger repository dispatches for all org repos that have a `renovate` workflow. ([#535](https://github.com/bfra-me/.github/pull/535))


### Patch Changes


- Updated dependency `eslint-config-prettier` to `10.0.2`. ([#539](https://github.com/bfra-me/.github/pull/539))

## 2.1.1
### Patch Changes


- Update ESLint and TypeScript config and scripts. ([#534](https://github.com/bfra-me/.github/pull/534))

## 2.1.0
### Minor Changes


- Add workflow automation ([#522](https://github.com/bfra-me/.github/pull/522))

## 2.0.9
### Patch Changes


- Updated dependency `@bfra.me/eslint-config` to `0.16.5`. ([#517](https://github.com/bfra-me/.github/pull/517))
  Updated dependency `@bfra.me/prettier-config` to `0.15.2`.

- Updated dependency `eslint` to `9.21.0`. ([#519](https://github.com/bfra-me/.github/pull/519))


- Updated dependency `prettier` to `3.5.2`. ([#518](https://github.com/bfra-me/.github/pull/518))


- Updated dependency `packageManager` to `pnpm@9.15.6`. ([#511](https://github.com/bfra-me/.github/pull/511))


- Update repository metadata files based on the latest organization scan. ([#500](https://github.com/bfra-me/.github/pull/500))

## 2.0.8
### Patch Changes


- Updated dependency `@bfra.me/eslint-config` to `0.16.3`. ([#456](https://github.com/bfra-me/.github/pull/456))
  Updated dependency `@bfra.me/prettier-config` to `0.15.0`.

- Updated dependency `eslint` to `9.20.0`. ([#477](https://github.com/bfra-me/.github/pull/477))


- Updated dependency `@changesets/cli` to `2.28.0`. ([#488](https://github.com/bfra-me/.github/pull/488))


- Updated dependency `@types/node` to `22.13.4`. ([#485](https://github.com/bfra-me/.github/pull/485))


- Updated dependency `prettier` to `3.5.1`. ([#483](https://github.com/bfra-me/.github/pull/483))


- Updated dependency `eslint` to `9.20.1`. ([#482](https://github.com/bfra-me/.github/pull/482))


- Updated dependency `eslint` to `9.19.0`. ([#461](https://github.com/bfra-me/.github/pull/461))


- Updated dependency `@changesets/cli` to `2.27.12`. ([#458](https://github.com/bfra-me/.github/pull/458))


- Updated dependency `prettier` to `3.5.0`. ([#478](https://github.com/bfra-me/.github/pull/478))


- Updated dependency `@bfra.me/eslint-config` to `0.16.4`. ([#460](https://github.com/bfra-me/.github/pull/460))
  Updated dependency `@bfra.me/prettier-config` to `0.15.1`.

- Updated dependency `eslint-config-prettier` to `10.0.1`. ([#462](https://github.com/bfra-me/.github/pull/462))


- Updated dependency `tsx` to `4.19.3`. ([#489](https://github.com/bfra-me/.github/pull/489))


- Updated dependency `@changesets/cli` to `2.28.1`. ([#490](https://github.com/bfra-me/.github/pull/490))


- Updated dependency `packageManager` to `pnpm@9.15.5`. ([#470](https://github.com/bfra-me/.github/pull/470))


- Updated dependency `@bfra.me/eslint-config` to `0.16.1`. ([#450](https://github.com/bfra-me/.github/pull/450))
  Updated dependency `@bfra.me/prettier-config` to `0.14.1`.

- Updated dependency `@types/node` to `22.13.0`. ([#469](https://github.com/bfra-me/.github/pull/469))

## 2.0.7
### Patch Changes


- Updated dependency `eslint-plugin-prettier` to `5.2.2`. ([#446](https://github.com/bfra-me/.github/pull/446))


- Updated dependency `@bfra.me/eslint-config` to `0.15.0`. ([#431](https://github.com/bfra-me/.github/pull/431))


- Updated dependency `@bfra.me/eslint-config` to `0.13.0`. ([#426](https://github.com/bfra-me/.github/pull/426))


- Updated dependency `@bfra.me/eslint-config` to `0.14.0`. ([#428](https://github.com/bfra-me/.github/pull/428))


- Updated dependency `typescript` to `5.7.3`. ([#440](https://github.com/bfra-me/.github/pull/440))


- Updated dependency `@types/node` to `22.10.6`. ([#447](https://github.com/bfra-me/.github/pull/447))


- Updated dependency `@types/node` to `22.10.3`. ([#433](https://github.com/bfra-me/.github/pull/433))


- Updated dependency `packageManager` to `pnpm@9.15.3`. ([#436](https://github.com/bfra-me/.github/pull/436))


- Updated dependency `packageManager` to `pnpm@9.15.2`. ([#430](https://github.com/bfra-me/.github/pull/430))


- Updated dependency `eslint` to `9.18.0`. ([#443](https://github.com/bfra-me/.github/pull/443))


- Updated dependency `@bfra.me/eslint-config` to `0.16.0`. ([#439](https://github.com/bfra-me/.github/pull/439))
  Updated dependency `@bfra.me/prettier-config` to `0.14.0`.

- Updated dependency `eslint-plugin-prettier` to `5.2.3`. ([#448](https://github.com/bfra-me/.github/pull/448))


- Updated dependency `packageManager` to `pnpm@9.15.4`. ([#445](https://github.com/bfra-me/.github/pull/445))

## 2.0.6
### Patch Changes


- Updated dependency `@bfra.me/eslint-config` to `0.12.2`. ([#422](https://github.com/bfra-me/.github/pull/422))


- Updated dependency `@changesets/cli` to `2.27.11`. ([#417](https://github.com/bfra-me/.github/pull/417))


- Updated dependency `jiti` to `2.4.2`. ([#415](https://github.com/bfra-me/.github/pull/415))


- Updated dependency `packageManager` to `pnpm@9.15.1`. ([#419](https://github.com/bfra-me/.github/pull/419))


- Updated dependency `@bfra.me/eslint-config` to `0.11.0`. ([#412](https://github.com/bfra-me/.github/pull/412))
  Updated dependency `@bfra.me/prettier-config` to `0.13.6`.

- Updated dependency `@bfra.me/eslint-config` to `0.12.1`. ([#414](https://github.com/bfra-me/.github/pull/414))
  Updated dependency `@bfra.me/prettier-config` to `0.13.7`.

- Updated dependency `@types/node` to `22.10.2`. ([#410](https://github.com/bfra-me/.github/pull/410))

## 2.0.5
### Patch Changes


- Updated dependency `@bfra.me/prettier-config` to `0.13.4`. ([#397](https://github.com/bfra-me/.github/pull/397))


- Updated dependency `@bfra.me/eslint-config` to `0.10.0`. ([#405](https://github.com/bfra-me/.github/pull/405))


- Updated dependency `@bfra.me/eslint-config` to `0.8.0`. ([#398](https://github.com/bfra-me/.github/pull/398))


- Updated dependency `@bfra.me/prettier-config` to `0.13.5`. ([#404](https://github.com/bfra-me/.github/pull/404))


- Updated dependency `packageManager` to `pnpm@9.15.0`. ([#396](https://github.com/bfra-me/.github/pull/396))


- Updated dependency `prettier` to `3.4.2`. ([#394](https://github.com/bfra-me/.github/pull/394))


- Updated dependency `eslint` to `9.17.0`. ([#406](https://github.com/bfra-me/.github/pull/406))


- Updated dependency `@bfra.me/eslint-config` to `0.9.0`. ([#400](https://github.com/bfra-me/.github/pull/400))

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
