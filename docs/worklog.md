# Worklog

> One short entry **per working session**, newest first: where we left off, why,
> dead-ends, gotchas. Git covers the fine-grained "what".

## 2026-10-04 — Trigger tasks for Home Assistant (ADR-0010)

- Path to the design: Matthias first asked whether HA could just call the API
  over the cluster network (works with a forged `Remote-User`, but then the
  network is the only credential, and nothing handles duplicates). He wanted it
  explicit: a token managed in the app and configurable duplicate handling.
  He also agreed to fold triggers into the task model next to recurring chores
  (one row, waiting ↔ due, so a duplicate can't happen) and the "Routinen" list.
- His laundry follow-up ("Wäsche abhängen" a day after "aufhängen") becomes a
  second trigger source, "after task X + delay" (`ideas.md`, next). He'd like
  **due times**; that needs its own ADR, after the follow-up.
- Built by a Sonnet agent from ADR-0010 and TC-72…81. Agent calls the lead
  kept:
  - create mode offers only Wiederkehrend · Auslöser (ADR-0007's "no one-off
    from Routinen");
  - a fresh fire always pushes;
  - `listRecurring` sorts in JS (SQLite sorts NULL first).
- Lead in review:
  - the "Home Assistant" token block showed for a task switched to Auslöser
    but not yet saved (the API would 400); it now shows a hint until saved.
  - TC-30/37–40 texts amended to the kind choice and "Routinen".
- **v0.3.0 in prod: push didn't arrive.** The pod log showed `ETIMEDOUT` to
  `fcm.googleapis.com:443`, so egress is blocked; that's on Matthias's side
  (NetworkPolicy or firewall). "Test senden" said "gesendet" anyway, so the
  test push now returns 502 with a German reason ("Push-Dienst nicht
  erreichbar (ETIMEDOUT)…"), and the web client shows a server-sent `message`.
- Open: Matthias opens egress, then TC-71; release with triggers is his call;
  deploy needs `HOOK_BASE_URL`; TC-82 with the real washer.

## 2026-10-04 — Push notifications (ADR-0009)

- Matthias floated Home Assistant creating tasks (washer done → "Wäsche
  aufhängen"), then pulled **push** forward as its precondition. His calls:
  Android only; daily digest switchable, time per user; not every task pushes
  (per-task `notify`); a new one-off pushes to everyone but its creator.
- Built by a Sonnet agent from ADR-0009 and TC-58…71: PWA shell (manifest,
  icons, push-only `sw.js`), VAPID keys in `AppSetting`, `PushSubscription`,
  event pushes after writes, a minute ticker with a pure planner, Settings
  card, sheet switch + bell, MCP `notify`. e2e uses a JSONL outbox.
- Lead fixes in review: daily run no longer sets `notifiedFor` (second
  digest-off user missed pushes); update pushes "due now" only on a real
  change; manifest fetched with credentials (Authelia).
- Open: TC-71 on Matthias's phone; pod egress to FCM at deploy; HA triggers
  next (token question open for Matthias).

## 2026-10-03/04 — Seasonal chores (ADR-0008), `v0.2.0`

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
- 2026-10-04, at Matthias's request: changing or removing the season of a
  *resting* chore now recomputes its date from the latest completion with the
  normal rule, at the earliest today (TC-57). A hand-set date wins. My first
  TC-57 text had wrong arithmetic (3 days ago + 7 ≠ past); the implementer
  flagged it instead of bending the test, which is how it should go.
- **Released `v0.2.0`** (Matthias's go, 2026-10-04). The migration
  `seasonal_chores` is applied by the container entrypoint
  (`prisma migrate deploy`). Dev: rezepte was on :5173, so Haushalt ran on
  :5174 this session.

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
