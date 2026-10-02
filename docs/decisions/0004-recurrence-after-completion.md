# 0004. Recurring chores are one task with a moving due date, plus a completion log

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

Matthias: recurring chores should mostly be "always two weeks after the last
occurrence was completed", not "an occurrence every two weeks". Household
chores slip; when they slip, the next one should move too, and missed
occurrences must not pile up as a backlog of copies.

## Decision

- A recurring chore is **one `Task` row** with a `recurrence` rule and a
  `dueDate` that is always the **next** due date. No occurrence rows are
  generated.
- Ticking it off writes a **`Completion`** (who, via which channel, when, which
  date it counts for, and the `dueDateBefore`) and moves `dueDate`:
  - `AFTER_COMPLETION` (**default**): `dueDate = completion date + interval`.
  - `FIXED` (calendar-anchored, for bins etc.): `dueDate` = the first slot on
    the anchored grid strictly after both the old due date and the completion
    date. Completing early consumes the current slot; missed slots are skipped.
- **Skip** ("diesmal nicht") writes a `Completion` of kind `SKIPPED` and moves
  the date the same way, but doesn't count as done in history or statistics.
- **Undo** deletes the latest completion of a task and restores
  `dueDateBefore`. Only the latest one can be undone; that covers the mis-tap
  case without a general history editor.
- **Dates are calendar dates** (`YYYY-MM-DD`, Europe/Berlin), not timestamps.
  Chores are due on a day, not at a time, and storing dates avoids a whole
  class of time-zone and DST bugs. "Today" is computed in Europe/Berlin on the
  server.
- Units: `DAY`, `WEEK`, `MONTH`. Month arithmetic clamps to the end of the
  month (31 Jan + 1 month = 28/29 Feb), and the next step continues from the
  clamped date.
- The completion date defaults to today and can be set back ("hab ich gestern
  gemacht"); for `AFTER_COMPLETION` the next due date is computed from that
  date.
- The rule lives in **one pure function** (`nextDueDate(task, completionDate)`)
  with unit tests; the API, the web UI and MCP all go through it.

## Consequences

- History ("when did we last…?") comes for free from the completion log.
- Changing a chore's interval needs no migration of generated rows; the new
  interval simply applies from the next completion. Editing `dueDate` directly
  is allowed (e.g. "make it due tomorrow").
- No way to see "you missed 3 occurrences"; that's the point.

## Alternatives considered

- **Generate occurrence rows** (classic calendar recurrence, RRULE): the
  backlog-of-copies problem this ADR exists to avoid, plus a generator job.
- **RRULE strings** for flexibility: overkill for "every N days/weeks/months";
  we can add a richer rule later if a real chore needs it.
