# Test plan

> Fixed cases with fixed expectations, so "I tested it" means the same thing
> every time. **This process is binding.** Cases are written from what a
> feature *should* do; a script is one way of running a case.
>
> _Last updated: 2026-10-03_

## Running

```bash
npm run e2e                                    # build, boot :3201 on .e2e/e2e.db, run, tear down
PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright npm run e2e   # if browsers are "missing"
npm run test:unit                              # pure domain logic (TC-06…13)
```

## The process

Every change passes three gates:

1. **Feature cases.** A feature ships with its cases in this file, scripted
   wherever deterministic, and they pass.
2. **Full suite.** `npm run e2e` is green before every commit that touches code.
3. **Eyes on it.** UI changes get looked at in a real browser on a 390×844
   viewport (`npx playwright-cli`) before desktop.

The case author is the lead. The runner is never the agent that implemented the
feature.

## Cases

### Identity (ADR-0003)

| ID    | Case | How |
| ----- | ---- | --- |
| TC-01 | `GET /api/health` answers 200 without any `Remote-*` header. | scripted |
| TC-02 | `GET /api/me` without `Remote-User` → 401 JSON. | scripted |
| TC-03 | With `Remote-User` + `Remote-Name`, `/api/me` returns the user; a changed `Remote-Name` on the next request is stored. | scripted |
| TC-04 | A second `Remote-User` (`anna`) gets its own `User` row; the first is unchanged. | scripted |
| TC-05 | At 390×844 the page loads and greets the user by display name ("Hallo, …"), German UI. | scripted |

### Recurrence (ADR-0004), unit: `apps/api/src/lib/recurrence.test.ts`

| ID    | Case |
| ----- | ---- |
| TC-06 | `AFTER_COMPLETION`, every 2 weeks, due 2026-10-01, completed 2026-10-04 → next due **2026-10-18** (from the completion, not the old due date). Completed early on 2026-09-28 → **2026-10-12**. |
| TC-07 | `FIXED`, every 1 week, due Tue 2026-10-06: completed on time → **2026-10-13**; completed early (Mon 10-05) → **2026-10-13** (the current slot is consumed); completed 9 days late (10-15) → **2026-10-20** (missed slots skipped, never queued). |
| TC-08 | Months clamp: every 1 month from 2026-01-31 → **2026-02-28**; from 2028-01-31 → **2028-02-29**; `FIXED` monthly continues from the clamped date (02-28 → **03-28**). |
| TC-09 | Days unit: every 3 days, `AFTER_COMPLETION`, completed 2026-12-30 → **2027-01-02** (year boundary). |
| TC-10 | "Today" is Europe/Berlin: at 2026-10-02T22:30Z it's already **2026-10-03**; at 2026-03-29T00:30Z (DST night) it's **2026-03-29**. |

### Urgency and sections (ADR-0005), unit: `apps/api/src/lib/urgency.test.ts`

| ID    | Case |
| ----- | ---- |
| TC-11 | Sections relative to today 2026-10-10: due 10-10 or earlier → `faellig`; 10-11…10-17 → `demnaechst`; 10-18 and later → `spaeter`; no due date → `irgendwann`. |
| TC-12 | Scores: NORMAL due today = **1**; HIGH due today = **2**; LOW due today = **0.5**; NORMAL weekly 7 days late = **2**; NORMAL every-12-weeks 7 days late ≈ **1.083**; NORMAL one-off with deadline 7 days late = **2** (scale 7). |
| TC-13 | Ordering within `faellig` is by score desc; ties break by older due date, then lower id. `demnaechst` by due date, then priority (HIGH first). `spaeter` by due date. `irgendwann` by weight × (1 + age days / 30) desc, so a 60-day-old NORMAL (3) outranks a fresh HIGH (2). |

### Task API (scripted e2e: `e2e/tests/tasks-api.spec.ts`)

| ID    | Case |
| ----- | ---- |
| TC-14 | `POST /api/tasks {title}` → 201, a one-off with no due date, priority `NORMAL`, `createdBy` = the calling user; it appears in `irgendwann` of `GET /api/tasks`. Missing/blank title → 400. |
| TC-15 | Create a recurring task without `dueDate` → due **today**, so it's in `faellig`. With `dueDate` in 3 days → `demnaechst`. Invalid recurrence (every 0, unknown unit) → 400. |
| TC-16 | Complete a recurring `AFTER_COMPLETION` weekly task as `matthias` → `dueDate` = today + 7, it moves to `demnaechst`/`spaeter`, and `lastDone` = today by Matthias. A `Completion` with `via: "web"` exists. |
| TC-17 | Complete with an explicit earlier `date` (yesterday) → next due = yesterday + interval. A date in the future → 400. |
| TC-18 | Completing a one-off sets it done: it disappears from every section of `GET /api/tasks`. **Undo** brings it back unchanged. |
| TC-19 | Undo on a recurring task restores the previous `dueDate` exactly; a second undo restores the one before that. Undo with no completions → 409. |
| TC-20 | Skip a recurring task → due date moves like a completion, but `lastDone` is unchanged (a skip is not "done"). Skip on a one-off → 400. |
| TC-21 | Two users: a task created by `matthias` is completed by `anna` → `lastDone.by` is Anna; both see the same list (shared, ADR-0003). |
| TC-22 | `PATCH` title, notes, priority, dueDate, and recurrence (including `null` → becomes one-off) → reflected in the list (a recurring task > 7 days out is read from `/api/recurring`, ADR-0007); unknown id → 404. |
| TC-23 | `DELETE /api/tasks/:id` archives: gone from the list; completions kept in the DB. |
| TC-24 | `GET /api/tasks` puts a HIGH task due today above a NORMAL task due today, and a NORMAL weekly task 8 days late above both. |
| TC-25 | `lastDone` is the completion with the latest **date**, not the latest tap: Matthias completes today, then Anna logs one dated 3 days ago → `lastDone` is today by Matthias. Undo still reverts the latest *recorded* completion (Anna's). |

### Task list UI (scripted e2e at 390×844: `e2e/tests/tasks-ui.spec.ts`)

| ID    | Case |
| ----- | ---- |
| TC-26 | **Quick-add:** type a title in the "Neue Aufgabe" field at the bottom, press Enter → it appears under **Irgendwann**; the field is cleared and keeps focus (so several can be added in a row). Blank input adds nothing. |
| TC-27 | **Sections:** headings appear in the order **Fällig · Irgendwann · Demnächst · Später** (ADR-0007), each with its count; empty sections are not shown. **Später** is collapsed by default (heading + count only) and expands on tap. With no tasks at all, an empty-state text is shown instead. |
| TC-28 | **Tick off a recurring task** that is due today: tap its round check button → it leaves Fällig and shows up in Demnächst/Später with "zuletzt heute · Matthias". A toast "… erledigt" with **Rückgängig** appears; tapping Rückgängig puts it back in Fällig with its old due date. |
| TC-29 | **Tick off a one-off:** it disappears from the list; Rückgängig in the toast brings it back. |
| TC-30 | **Edit sheet:** tapping a task's text opens a sheet. Change the title, set priority **wichtig**, turn on Wiederholung "alle 2 Wochen, nach Erledigung" and save → the sheet closes and the row shows the new title, a "wichtig" marker and "alle 2 Wochen". |
| TC-31 | **Skip** ("Diesmal überspringen", only offered for recurring tasks) → the due date moves on, "zuletzt …" is unchanged. |
| TC-32 | **Done on an earlier day:** "Erledigt am…" with yesterday's date on a weekly after-completion task → next due shows as 6 days from today. |
| TC-33 | **Delete:** "Löschen" in the sheet asks for confirmation; confirming removes the task from the list. Cancelling keeps it. |
| TC-34 | **Phone layout:** no horizontal scroll at 390 px; the check button and every sheet button are at least 44×44 px; due info reads in German ("heute", "seit 3 Tagen", "morgen", "in 4 Tagen", "Fr. 17.10."). |
| TC-35 | **Errors are visible:** if an API call fails (server returns 500), the user sees a German error message and the list isn't silently wrong; Save is disabled while the title is empty. |

### Home vs. recurring view (ADR-0007)

| ID    | Case | How |
| ----- | ---- | --- |
| TC-36 | API: a recurring task due in 20 days is **not** in any section of `GET /api/tasks`; a one-off due in 20 days **is** in `spaeter`. `GET /api/recurring` lists all active recurring tasks sorted by due date (then id), including that one; archived and one-off tasks are not in it. | scripted (API) |
| TC-37 | A bottom tab bar shows **Aufgaben** and **Wiederkehrend**; switching changes the view and the URL hash; reloading on `#/wiederkehrend` stays there. The quick-add bar is only on Aufgaben. | scripted |
| TC-38 | **Wiederkehrend** lists every recurring chore with next date, rhythm and "zuletzt …"; a chore due in 20 days is shown here but not on Aufgaben. With no recurring chores, an empty-state text and the "+" button are shown. | scripted |
| TC-39 | "+" in Wiederkehrend opens the sheet with the rhythm fields shown directly (**no** Wiederholung switch, so you can't make a one-off here); defaults 1 Woche, nach Erledigung, due today; saving "Filter wechseln, alle 3 Monate, nach Erledigung, fällig heute" → it appears in Wiederkehrend **and** under Fällig on Aufgaben. | scripted |
| TC-40 | **Convert:** a one-off added via quick-add, turned recurring ("alle 1 Woche") in the sheet on Aufgaben → it appears in Wiederkehrend. Ticking a chore off in Wiederkehrend works the same as on Aufgaben (toast with Rückgängig). | scripted |
| TC-41 | **Demnächst** is visually quieter than Fällig (smaller or muted heading/text) but its check buttons still work and keep the 44 px target. | scripted (target size) + eyes |

### Seasonal chores (ADR-0008)

| ID    | Case | How |
| ----- | ---- | --- |
| TC-50 | `seasonDate`: season März–Oktober (3–10): 2026-10-31 → unchanged; 2026-11-01 → **2027-03-01**; 2026-02-10 → **2026-03-01**; 2026-03-01 → unchanged. Wrapping Nov–Feb (11–2): 2026-12-15 and 2027-01-31 → unchanged; 2026-03-01 → **2026-11-01**. Single month Juni (6–6): 2026-07-01 → **2027-06-01**. No season → unchanged. | unit (`recurrence.test.ts`) |
| TC-51 | `nextDueDate` with a season: `AFTER_COMPLETION` every 2 weeks, März–Oktober, completed 2026-10-10 → **2026-10-24** (in season); completed 2026-10-20 → **2027-03-01**. `FIXED` weekly due Tue 2026-10-27, completed on time → **2027-03-01**. Every 1 month, Nov–Feb, completed 2027-02-15 → **2027-11-01**. | unit |
| TC-52 | API create: a recurring task with a season that excludes the current month and no `dueDate` → due on the **1st of the season's next start month**, so it's not on `GET /api/tasks` and has `resting: true` in `/api/recurring`. Validation → 400: month 0 or 13, only one of `from`/`to`, season on a one-off. A full-year window (`{from:1,to:12}`, `{from:3,to:2}`) comes back as `season: null`. | scripted (API) |
| TC-53 | **Overdue stays due:** a recurring task whose season is only *last* month, with a `dueDate` in last month → it's in `faellig` (`resting: false`). Completing it → `dueDate` = the 1st of that month next year, `resting: true`, gone from home. Undo → back to the old date, in `faellig`. | scripted (API) |
| TC-54 | API update: adding a season to a chore whose `dueDate` is outside it snaps the date to the next season start; patching only the title of an overdue chore whose season has ended does **not** move its date, **nor does** resending its unchanged `dueDate` + `recurrence` (what the web sheet does on every save); `recurrence: null` clears the season. | scripted (API) |
| TC-55 | **UI (390×844):** the sheet's Wiederholung section has a "Nur in bestimmten Monaten" switch; turned on it shows two month selects (von/bis), default **März–Oktober**. Saving "Rasen mähen, alle 2 Wochen, März–Oktober" → Wiederkehrend shows the rhythm with the season ("alle 2 Wochen · März–Oktober"). A resting chore shows muted with "ruht bis <Monat>". Reopening the sheet shows the saved months; turning the switch off and saving removes the season. Targets ≥ 44 px, no horizontal scroll. | scripted + eyes |
| TC-57 | **Un-resting on season change:** a weekly `AFTER_COMPLETION` chore with a season excluding the current month (so `resting`), completed with `date` = 10 days ago → it rests (due = next season start). Removing the season (`recurrence` without season, same `dueDate` resent) → due **today** (completion + 7 days lies in the past → at the earliest today), in `faellig`. Completed 3 days ago → **today + 4**; completed today → **today + 7**. Changing to a season that includes the current month (completed 10 days ago) → **today**. Changing to a different season that also excludes today → the new season's next start. A resting chore with no completion, season removed → today. Sending a different `dueDate` in the same patch → that date wins. A non-resting chore's date is not recomputed. | scripted (API) |
| TC-56 | **MCP:** `add_task` / `update_task` accept `recurrence.season` (`null` clears it); `list_recurring` and `get_task` show the season in `recurrenceLabel` ("alle 2 Wochen, März–Oktober") and a `resting` flag; invalid months → `isError: true` with a German message. | scripted |

### MCP server (ADR-0006): scripted e2e

| ID    | Case |
| ----- | ---- |
| TC-42 | **Gate:** `POST /mcp` without a token → 401 with `WWW-Authenticate: Bearer … resource_metadata="…/.well-known/oauth-protected-resource"`. With `MCP_TOKEN` unset the server mounts no `/mcp` at all (404, log line "MCP disabled"). |
| TC-43 | **OAuth only:** the raw `MCP_TOKEN` sent as a bearer → 401, exactly like any invalid token. A tampered or expired access token → 401. |
| TC-44 | **Discovery + flow:** `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource` advertise `/mcp/register`, `/oauth/authorize`, `/mcp/token`. Full flow: register (DCR, `client_name`) → `GET /oauth/authorize` **without** `Remote-User` → 401; with `Remote-User: matthias` → a German consent page naming the client **and** "Matthias" → approve (CSRF) → code → `/mcp/token` with PKCE → access + refresh token → `tools/list` lists the tools below. Negative: PKCE mismatch → `invalid_grant`; CSRF mismatch → rejected; deny → redirect with `error=access_denied`; an unregistered `redirect_uri` → error page, **never** a redirect. |
| TC-45 | **User binding:** client A approved by `matthias`; `add_task` via A → `createdBy` Matthias, `createdVia` `mcp:<A's name>`; `complete_task` via A → `lastDone.by` Matthias, completion `via` `mcp:<A's name>`. Client B approved by `anna` → her `complete_task` is attributed to Anna. A refresh keeps the binding. |
| TC-46 | A client already bound to `matthias` cannot be approved by `anna`: the consent page refuses with a German message (403) and issues no code. |
| TC-47 | **Tools behave like the web:** `list_tasks` returns the same sections and order as `GET /api/tasks`; `list_recurring` matches `GET /api/recurring`; `search_tasks` finds "Waschmaschine reinigen" for "waschmaschine" and "Kühlschrank abtauen" for "kuhlschrank" (case and umlaut tolerant), active tasks only; `complete_task` (incl. `date`), `skip_task`, `undo_last`, `update_task`, `archive_task` have the same semantics as the REST endpoints. An unknown id or invalid input → a tool result with `isError: true` and a German explanation, not a protocol error. |
| TC-48 | `get_task` returns the task plus its history (latest first, up to 20): date, DONE/SKIPPED, who, via. |
| TC-49 | **Settings** (`#/einstellungen`, reachable from the header): shows the MCP endpoint URL (`<origin>/mcp`) and a short German how-to; lists **only my** clients (name, "verbunden seit", "zuletzt benutzt"); rename works; **revoke** (with confirm) → that client's access token gets 401 at `/mcp` immediately and its refresh token `invalid_grant`. Anna's clients are not visible to Matthias, and he can't revoke them via the API (404). The raw `MCP_TOKEN` appears nowhere in the page or any API response. |

## Run log

| Date | Scope | Result |
| ---- | ----- | ------ |
| 2026-10-04 (prod) | TC-44 against the real ingress, via claude.ai | **pass (Matthias, by hand):** connector added, OAuth through Authelia, listing tasks works. TC-45 (attribution of a write) not run for real; e2e covers it. |
| 2026-10-04 (release) | `v0.2.0`: TC-57 (new; lead fixed its arithmetic after the implementer flagged it), full suite + unit | **e2e 53/53** (11.2 s), **unit 27/27**, tsc + svelte-check clean, lead run after review of the `updateTask` recompute branch. |
| 2026-10-03 | ADR-0008 seasonal chores: TC-50…56 (new), TC-15/22/47 amended (`season: null`), full suite | **e2e 52/52** (11.2 s), **unit 27/27**, tsc + svelte-check clean, lead run. Lead found in review that the web sheet resends `dueDate` + `recurrence` on every save, so snapping on "field present" would have moved an overdue past-season chore on rename. Changed to "date or season actually changed", added to TC-54. Lead browser check at 390×844: resting chore muted with "ruht bis Dezember" (wrapping Dez–Feb), sheet with the month selects. |
| 2026-10-02 (release) | `v0.1.0`: MCP server TC-42…49 (new) + spinner, full suite + unit | **e2e 46/46** (27.0 s), **unit 25/25** (incl. ported OAuth signing tests), tsc + svelte-check clean, lead run. Lead reviewed verifier, mount guard, consent (GET/POST) and both token grants line by line, and checked the dev server by hand (401 without token, discovery, consent 401 without `Remote-User`) plus the settings page at 390 px. **Unverified until deploy:** a real Claude connector through the ingress (needs the Authelia exemptions). |
| 2026-10-02 | ADR-0007 (home vs. Wiederkehrend): TC-27 amended, TC-36…41 new, full suite | **e2e 33/33** (21.0 s), `svelte-check` 0/0, lead run after review (lead hid the Wiederholung switch in create mode; TC-39 amended). Screenshots of both views, the create sheet and dark mode reviewed by the lead. TC-22 now reads far recurring tasks from `/api/recurring`. |
| 2026-10-02 | Task list UI: TC-26…35 (new), full suite | **e2e 27/27** (18.7 s), `svelte-check` 0/0, lead run. Lead browser check at 390×844 via playwright-cli (tick off → moves to Demnächst with "zuletzt heute", toast with Rückgängig) plus the implementer's light/dark/sheet screenshots. TC-05 no longer asserts the empty-list text (the e2e DB is shared across specs). |
| 2026-10-02 | Task core API: TC-06…13 (unit), TC-14…25 (e2e), full suite | **unit 12/12, e2e 17/17** (lead run). TC-25 added by the lead in review (`lastDone` ordering fix). The e2e helpers read `.e2e/e2e.db` read-only via better-sqlite3 for completion rows the API doesn't expose (TC-16, TC-23). |
| 2026-10-02 | Skeleton: TC-01…05, full suite | **5/5 pass** (6.1 s), lead run before the first commit |
