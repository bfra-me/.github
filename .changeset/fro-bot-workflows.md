---
'@bfra.me/.github': minor
---

Add Fro Bot AI agent workflows for PR review, scheduled org oversight, and daily autohealing:
- add [fro-bot.yaml](/.github/workflows/fro-bot.yaml): core reusable agent workflow responding to issue/PR
  comments (@fro-bot mentions), PR synchronize events, scheduled daily
  org oversight, workflow_dispatch, and workflow_call; guards against
  forks, bots, and non-member comment authors
- add [fro-bot-autoheal.yaml](/.github/workflows/fro-bot-autoheal.yaml): daily (03:30 UTC) repo self-healing —
  fixes failing PR CI, patches security advisories, audits SHA pinning
  and dist/ freshness, checks code quality, and posts a structured
  summary issue
- add [fro-bot-autoheal-org.yaml](/.github/workflows/fro-bot-autoheal-org.yaml): weekday (05:00 UTC, Mon–Fri) org-wide
  sweep — CI health, Dependabot alerts, tooling-version drift, DX gaps,
  org-pattern adherence, and stale work across all bfra-me repos;
  supports targeting a single repo via workflow_dispatch input
