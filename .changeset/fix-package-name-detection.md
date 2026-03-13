---
renovate-changesets: patch
---

Fix package name detection in changeset generation. Previously used GitHub repo name (.github) instead of actual workspace package name (@bfra.me/.github).