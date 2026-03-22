---
"@bfra.me/.github": patch
---

Force flatted to 3.4.2 to fix prototype pollution vulnerability (CVE-2026-33228)

This addresses a HIGH severity security vulnerability in flatted <=3.4.1
discovered via Dependabot alert #39. The vulnerability allows prototype
pollution via the parse() function in NodeJS.

Since flatted is a transitive dependency of eslint via flat-cache and
file-entry-cache, we add a pnpm override to ensure the patched version
is used throughout the dependency tree.
