---
'renovate-changesets': patch
'update-repository-settings': patch
'update-metadata': patch
---

Bump TypeScript build target to ES2024 and esbuild target to node24 to match the Node.js 24 runtime. Add `engines: { node: ">=24" }` to all action packages. Fix deprecated `import ... assert` → `import ... with` syntax in tsup configs.
