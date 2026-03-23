---
"renovate-changesets": patch
---

Refactor single-use classes into plain exported functions

Replace 16 classes that existed only to instantiate and call a single method
with plain functions accepting an optional config parameter. Large modules
(>200 LOC) split into sub-module directories (impact/, categorization/,
multi-package/, multi-package-gen/, detectors/gha-*, detectors/go-*,
detectors/breaking-change-*). RenovateParser facade removed in favor of
barrel re-exports from parser/. ChangesetTemplateEngine, GroupedPRManager,
and GitOperations retained as classes (multiple public methods / complex state).
