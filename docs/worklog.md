# Worklog

> One short entry **per working session**, newest first: where we left off, why,
> dead-ends, gotchas. Git covers the fine-grained "what".

## 2026-10-03 — Seasonal chores (ADR-0008)

Matthias asked for seasonal recurring chores ("Rasenmähen nur im Sommer").
Product calls (his): **whole months**, **an overdue chore stays due past its
season's end**, **due on the 1st of the start month** when the season begins.
Built by a Sonnet subagent against TC-50…56; the lead reviewed and ran the suite.

- Design: `seasonFrom`/`seasonTo` columns; `seasonDate()` in `recurrence.ts`
  moves the stored `dueDate` to the next season start. No read-time dormant
  state, so sections and urgency are unchanged. `resting` is display-only.
- **Review catch:** the web sheet always resends `dueDate` + `recurrence`, so
  "snap when the field is in the patch" would have moved an overdue chore just
  by renaming it. Update now snaps only when the date or season *changes*.
- Accepted gap (in the ADR): removing a season doesn't pull a resting chore's
  date back from the 1st of its start month. Edit the date by hand.
- Not deployed/tagged; release is Matthias's call. Dev: rezepte was on :5173,
  so Haushalt ran on :5174 this session.

## 2026-10-02 (later) — MVP built in one session, `v0.1.0` tagged

Same session as the bootstrap. Shipped in order, each reviewed by the lead
and run green before its commit: task core API (ADR-0004/0005), task list UI,
Matthias's first feedback as ADR-0007 (home = actionable list; recurring
chores in their own "Wiederkehrend" tab), the MCP server (ADR-0006, OAuth only,
user-bound tokens), a centered loading spinner. Tagged **`v0.1.0`** for the
first deploy. Final suite: e2e 46/46, unit 25/25.

- **Next is roadmap item 4, the first deploy. It's Matthias's side** (checklist in
  roadmap.md): deployment (Recreate, 1 replica), PVC `/data`, secret
  `MCP_TOKEN`, ingress with Authelia except `/mcp` + `/.well-known/`, and an
  Authelia account and rule for his wife (probably user `tina`, he's not sure;
  the code doesn't care, users are created on first sight). After deploy:
  connect Claude once per person and run TC-44/45 against the real ingress.
- **Dev setup:** Haushalt's dev web server runs on **:5173** (Matthias's
  preference; `WEB_PORT=5173 scripts/app.sh restart`), and rezepte is stopped.
  `apps/api/.env` (gitignored) has a random `MCP_TOKEN`.
- **Lost data, my fault:** a blanket `delete from Task` in a cleanup brief deleted
  Matthias's own trial task "test". The rule is now in CLAUDE.md: clean up only
  what you seeded.
- Matthias's unrefined ideas (follow-up tasks, "can be done when" windows,
  iCal feed) are in ideas.md with the lead's take. **The plan is to use it for a few
  weeks first.**
- Browser checks: `npx playwright-cli` (skill + config committed); the
  Playwright MCP is gone from `~/.claude.json`. To catch a loading state,
  delay the API with `run-code` + `page.route` (≥ 10 s, since each CLI call is
  a separate step).

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
