# Domain model

The **target** conceptual model. What's actually in the schema right now is in
`apps/api/prisma/schema.prisma`; this file is where the schema is heading. The
reasoning is in ADR-0004 (recurrence), ADR-0005 (urgency) and ADR-0003
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

### Task

One row per task — **including** recurring chores. A recurring chore is *not*
a series of generated occurrence rows; it's one task whose `dueDate` moves
forward each time it's completed (ADR-0004).

| Field        | Notes |
| ------------ | ----- |
| `title`      | Required. Short, imperative: "Bettwäsche wechseln". |
| `notes`      | Optional free text. |
| `priority`   | `LOW` · `NORMAL` · `HIGH` — UI: *kann warten* · *normal* · *wichtig*. Default `NORMAL`. |
| `dueDate`    | Calendar date `YYYY-MM-DD` (Europe/Berlin), nullable. One-off: the deadline, or null = "irgendwann". Recurring: the **next** due date, always set. |
| `recurrence` | Null for one-off tasks. Otherwise `{ every, unit, mode }` — see below. |
| `doneAt`     | One-off only: set when ticked off; the task leaves the active list. Recurring tasks never get `doneAt`. |
| `archivedAt` | Soft delete / "nicht mehr relevant" for either kind. |
| `createdById`, `createdVia` | Who and through which channel (`web`, `mcp:<client>`). |

**Recurrence**

| Field   | Values |
| ------- | ------ |
| `every` | Positive integer |
| `unit`  | `DAY` · `WEEK` · `MONTH` |
| `mode`  | `AFTER_COMPLETION` (default) · `FIXED` |

- `AFTER_COMPLETION`: next due = completion date + interval.
- `FIXED`: next due = first slot on the anchored grid that is after both the
  current due date and the completion date. Missed slots are skipped, never
  queued.

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
