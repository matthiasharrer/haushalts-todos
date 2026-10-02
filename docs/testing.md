# Test plan

> Fixed cases with fixed expectations, so "I tested it" means the same thing
> every time. **This process is binding.** Cases are written from what a
> feature *should* do; a script is one way of running a case.
>
> _Last updated: 2026-10-02_

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
| TC-22 | `PATCH` title, notes, priority, dueDate, and recurrence (including `null` → becomes one-off) → reflected in the list; unknown id → 404. |
| TC-23 | `DELETE /api/tasks/:id` archives: gone from the list; completions kept in the DB. |
| TC-24 | `GET /api/tasks` puts a HIGH task due today above a NORMAL task due today, and a NORMAL weekly task 8 days late above both. |
| TC-25 | `lastDone` is the completion with the latest **date**, not the latest tap: Matthias completes today, then Anna logs one dated 3 days ago → `lastDone` is today by Matthias. Undo still reverts the latest *recorded* completion (Anna's). |

## Run log

| Date | Scope | Result |
| ---- | ----- | ------ |
| 2026-10-02 | Task core API: TC-06…13 (unit), TC-14…25 (e2e), full suite | **unit 12/12, e2e 17/17** (lead run). TC-25 added by the lead in review (`lastDone` ordering fix). The e2e helpers read `.e2e/e2e.db` read-only via better-sqlite3 for completion rows the API doesn't expose (TC-16, TC-23). |
| 2026-10-02 | Skeleton: TC-01…05, full suite | **5/5 pass** (6.1 s), lead run before the first commit |
