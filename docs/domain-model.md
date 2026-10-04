# Domain model

The **target** conceptual model. What's actually in the schema right now is in
`apps/api/prisma/schema.prisma`; this file is where the schema is heading. The
reasoning is in ADR-0004 (recurrence), ADR-0005 (urgency), ADR-0008 (seasons) and ADR-0003
(identity).

## Entities

```
User 1───* Completion *───1 Task
  │                          │
  └──────── created ─────────┘
```

### User

Created on first sight from Authelia's `Remote-User` (ADR-0003). No
registration, no passwords.

| Field         | Notes                                        |
| ------------- | -------------------------------------------- |
| `username`    | `Remote-User`, unique — the stable key        |
| `displayName` | `Remote-Name`, refreshed on every request     |
| `email`       | `Remote-Email`, optional                      |
| `digestEnabled` | Push (ADR-0009): daily overview on/off. Default on. |
| `notifyTime`  | `HH:MM` (Europe/Berlin) of the daily run. Default `08:00`. Changing it re-arms today's run. |
| `notifyRunOn` | Berlin date the daily run last happened for this user; server-managed, never exposed. |

A user's **push subscriptions** (`PushSubscription`: `endpoint` unique,
`p256dh`, `auth`, `lastSuccessAt`) are their devices; one device belongs to one
user at a time. `AppSetting` is a key/value table; today it only holds the VAPID
key pair (`vapid`).

### Task

One row per task — **including** recurring chores. A recurring chore is *not*
a series of generated occurrence rows; it's one task whose `dueDate` moves
forward each time it's completed (ADR-0004).

| Field        | Notes |
| ------------ | ----- |
| `title`      | Required. Short, imperative: "Bettwäsche wechseln". |
| `notes`      | Optional free text. |
| `priority`   | `LOW` · `NORMAL` · `HIGH` — UI: *kann warten* · *normal* · *wichtig*. Default `NORMAL`. |
| `dueDate`    | Calendar date `YYYY-MM-DD` (Europe/Berlin), nullable. One-off: the deadline, or null = "irgendwann". Recurring: the **next** due date, always set. Trigger task: null while *waiting*, the fire day while *fired* (ADR-0010). |
| `recurrence` | Null for one-off and trigger tasks. Otherwise `{ every, unit, mode }` — see below. |
| `triggerRefire` | `PUSH` · `NONE`, null = not a trigger task; non-null **is** the kind marker (ADR-0010). What a repeated fire does while the task is already fired. Mutually exclusive with `recurrence`. |
| `hookTokenHash` | Trigger task only: SHA-256 hex of the Home Assistant bearer token; the token itself is never stored and shown once. Dropped when the task stops being a trigger task. |
| `firedAt`    | Trigger task only: when it last fired (instant). |
| `doneAt`     | One-off only: set when ticked off; the task leaves the active list. Recurring tasks never get `doneAt`. |
| `notify`     | Push everyone (but the actor) when the task becomes due (ADR-0009). Default false. |
| `notifiedFor`| The `dueDate` this task has already pushed for; server-managed, makes "due now" fire once per date. |
| `archivedAt` | Soft delete / "nicht mehr relevant" for either kind. |
| `createdById`, `createdVia` | Who and through which channel (`web`, `mcp:<client>`). |

**Recurrence**

| Field   | Values |
| ------- | ------ |
| `every` | Positive integer |
| `unit`  | `DAY` · `WEEK` · `MONTH` |
| `mode`  | `AFTER_COMPLETION` (default) · `FIXED` |
| `season`| Optional `{ from, to }`, months 1–12 inclusive, may wrap the year end (ADR-0008). Null = all year. |

- `AFTER_COMPLETION`: next due = completion date + interval.
- `FIXED`: next due = first slot on the anchored grid that is after both the
  current due date and the completion date. Missed slots are skipped, never
  queued.
- `season`: a next due date outside the window jumps to the 1st of the next
  start month. An overdue chore stays due past its season's end (ADR-0008).

**Trigger task** (ADR-0010): the third kind, next to one-off and recurring.
One row forever, no generated copies. *Waiting* (`dueDate` null) it is only in
the Routinen list; `POST /hooks/<id>` with its token makes it *fired*
(`dueDate` = today, `firedAt` = now, due-now push to everyone). A second fire
keeps the date and, per `triggerRefire`, pushes again (`renotify`) or does
nothing. Completing or skipping logs a `Completion` as usual and sends it back
to waiting (`dueDate` null, never `doneAt`); undo restores the fired date.
Completing a waiting one is a 400. A waiting trigger task is not "Irgendwann":
home and the digest never see it.

### Completion

The log. One row each time a task is ticked off **or skipped**.

| Field          | Notes |
| -------------- | ----- |
| `taskId`       | |
| `userId`       | Who did it — from Authelia (web) or the token's bound user (MCP). |
| `via`          | `web` · `mcp:<client name>` |
| `kind`         | `DONE` · `SKIPPED` ("diesmal nicht" — moves the date, isn't a completion in stats) |
| `at`           | Timestamp of the tap. |
| `date`         | The calendar date it counts for (normally today; editable: "hab ich gestern gemacht"). |
| `dueDateBefore`| The task's `dueDate` before this completion — makes **undo** exact: delete the latest completion, restore this value. |

## Derived, never stored

- **Section**: *Fällig* (due ≤ today), *Demnächst* (due within 7 days),
  *Später* (further out), *Irgendwann* (no due date). Home shows them as
  Fällig · Irgendwann · Demnächst · Später, and *Später* holds one-offs only.
  Recurring chores further out live in the "Wiederkehrend" view (ADR-0007).
- **Urgency score** — the sort key within *Fällig* (ADR-0005).
- **Last done** — latest `DONE` completion of a task.
- **Resting** — a seasonal chore out of season and not overdue (ADR-0008);
  display only.
