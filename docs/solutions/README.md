# Solutions Knowledge Store

`docs/solutions/` holds documented solutions to past problems — bugs that were diagnosed and fixed, plus best practices, workflow patterns, and other institutional knowledge. Each entry is a markdown file with YAML frontmatter so the store is searchable by `problem_type`, `component`, and `tags`. Consult it when implementing or debugging in a documented area.

Entries are written by the `ce:compound` workflow, but the frontmatter contract below is repo-local and authoritative on its own — you do not need the skill to add or read an entry.

## Layout

Files live in a category subdirectory named after their `problem_type` (see [Category mapping](#category-mapping)):

```text
docs/solutions/
├── integration-issues/   # integration_issue
├── logic-errors/         # logic_error
├── process/              # outlier workflow guide kept for inbound cross-link compatibility
└── …                     # other categories created on demand
```

Filename convention: `[problem-slug]-[YYYY-MM-DD].md`.

## Tracks

`problem_type` determines the **track**, which sets the required fields.

| Track | `problem_type` values | Meaning |
| --- | --- | --- |
| **Bug** | `build_error`, `test_failure`, `runtime_error`, `performance_issue`, `database_issue`, `security_issue`, `ui_bug`, `integration_issue`, `logic_error` | Defects and failures that were diagnosed and fixed |
| **Knowledge** | `best_practice`, `documentation_gap`, `workflow_issue`, `developer_experience`, `architecture_pattern`, `design_pattern`, `tooling_decision`, `convention` | Practices, patterns, workflow improvements, conventions, and documentation |

## Required fields (both tracks)

- **module** — module or area affected (e.g. a file path or package name)
- **date** — `YYYY-MM-DD`
- **problem_type** — one value from the Tracks table
- **component** — one of: `service_object`, `background_job`, `database`, `authentication`, `payments`, `development_workflow`, `testing_framework`, `documentation`, `tooling` (the canonical enum also includes Rails/Hotwire values not used in this repo: `rails_model`, `rails_controller`, `rails_view`, `frontend_stimulus`, `hotwire_turbo`, `email_processing`, `brief_system`, `assistant`)
- **severity** — `critical` | `high` | `medium` | `low`

## Bug-track required fields

- **symptoms** — YAML array, 1–5 observable signals (error text, broken behavior)
- **root_cause** — one of: `missing_association`, `missing_include`, `missing_index`, `wrong_api`, `scope_issue`, `thread_violation`, `async_timing`, `memory_leak`, `config_error`, `logic_error`, `test_isolation`, `missing_validation`, `missing_permission`, `missing_workflow_step`, `inadequate_documentation`, `missing_tooling`, `incomplete_setup`
- **resolution_type** — one of: `code_fix`, `migration`, `config_change`, `test_fix`, `dependency_update`, `environment_setup`, `workflow_improvement`, `documentation_update`, `tooling_addition`, `seed_data_update`

The `root_cause` and `resolution_type` enums are inherited verbatim from the canonical schema and include Rails/ORM-specific values that don't occur in this repo. In practice a TypeScript/Actions monorepo uses values like `config_error`, `wrong_api`, `logic_error`, `test_isolation`, `missing_workflow_step`, `incomplete_setup`, `missing_tooling` (root_cause) and `code_fix`, `config_change`, `test_fix`, `dependency_update`, `workflow_improvement`, `documentation_update`, `tooling_addition` (resolution_type). Use the closest fit; the full enum remains valid.

## Knowledge-track fields

No required fields beyond the shared ones. Optional: **applies_when**, **symptoms**, **root_cause**, **resolution_type** (same enums as the bug track, used only when a specific one fits).

## Optional fields (both tracks)

- **related_components** — array of other components involved
- **tags** — array of search keywords, lowercase and hyphen-separated, max 8

## Category mapping

Only the categories currently in use (or commonly expected) are listed; directories for the remaining knowledge-track `problem_type` values (`architecture_pattern`, `design_pattern`, `tooling_decision`, `convention`) are created on demand.

| `problem_type`         | Directory               |
| ---------------------- | ----------------------- |
| `build_error`          | `build-errors/`         |
| `test_failure`         | `test-failures/`        |
| `runtime_error`        | `runtime-errors/`       |
| `performance_issue`    | `performance-issues/`   |
| `database_issue`       | `database-issues/`      |
| `security_issue`       | `security-issues/`      |
| `ui_bug`               | `ui-bugs/`              |
| `integration_issue`    | `integration-issues/`   |
| `logic_error`          | `logic-errors/`         |
| `developer_experience` | `developer-experience/` |
| `workflow_issue`       | `workflow-issues/`      |
| `best_practice`        | `best-practices/`       |
| `documentation_gap`    | `documentation-gaps/`   |

## Validation rules

1. Determine the track from `problem_type`.
2. All shared required fields must be present.
3. Bug-track docs must include `symptoms`, `root_cause`, and `resolution_type`.
4. Knowledge-track docs have no required fields beyond the shared ones.
5. Enum fields must match an allowed value exactly.
6. `date` must match `YYYY-MM-DD`; array fields must respect their min/max counts.
7. `tags` are lowercase and hyphen-separated.
8. The frontmatter `title` provides the document heading — do not add a second `#` H1 in the body (markdownlint `no-multiple-h1`).

### YAML quoting gotchas

- Double-quote any scalar containing ` #` (space-hash) — the parser otherwise treats it as an inline comment and silently drops the rest of the value.
- Double-quote array items that start with a YAML reserved indicator (`{ [ | > ! & * ? : -`) or contain `: ` (colon-space).
