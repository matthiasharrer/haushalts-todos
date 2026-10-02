# Worklog

> One short entry **per working session**, newest first: where we left off, why,
> dead-ends, gotchas. Git covers the fine-grained "what".

## 2026-10-02 — Bootstrap

Matthias and the lead agreed the vision (`vision.md`): shared household
to-dos for two, one-off + recurring, recurrence counts from the last
completion, urgency sorting beyond the date, flat list, German UI, Authelia
users, MCP with OAuth only. Shopping stays in MS To Do; push is deferred.
ADRs 0001–0006 written. A Sonnet agent built the walking skeleton (identity →
`User`, `/api/me`, greeting page, app.sh, Dockerfile, CI, e2e 5/5); the lead
reviewed it.

- The same day, rezepte dropped its static MCP bearer (rezepte ADR-0038) on
  Matthias's call: "MCP should be OAuth only".
- **Playwright MCP was broken**: its `--executable-path` had vanished from
  `~/.claude.json` (workspace rebuild?). Restored it to
  `/opt/playwright-browsers/chromium-1228/chrome-linux64/chrome`; it needs an
  MCP reconnect to take effect. Later the same session, on Matthias's call,
  browser checks moved to **`playwright-cli`** (devDependency + committed skill
  + `.playwright/cli.config.json`); the MCP is gone. `install --skills` hangs
  (browser download), so the skill is copied by `npm run skills:sync`.
- `docker-entrypoint.sh` refers to a failed-migration runbook generically.
  Port rezepte's `runbook-failed-migration.md` before the first real
  migration hits production.
- **Next:** roadmap item 2 (task core API).
