# 0008. Seasonal chores: a month window that moves the due date

- **Status:** Accepted
- **Date:** 2026-10-03

## Context

Matthias: some recurring chores only make sense part of the year, e.g.
"Rasenmähen" only in summer. Without a season they nag all winter, and
"diesmal nicht" every two weeks until March is noise.

## Decision

- A recurring chore can have an optional **season**: a month window
  `{ from, to }`, months `1…12`, both inclusive. It may wrap the year end
  (`{ from: 11, to: 2 }` = November–February). `from === to` is a single
  month. A window covering all 12 months is the same as no season and is
  stored as none. Only recurring chores have a season. Making a task one-off
  clears it.
- **Granularity is whole months** (Matthias's call): garden and gutter chores
  don't need day precision, and the sheet stays two selects.
- **The season only moves the stored `dueDate`. Nothing extra is derived at
  read time.** One pure helper, `seasonDate(date, season)`, returns `date` if
  it falls inside the season, otherwise the **1st of the next start month**
  after it. It's applied:
  - in `nextDueDate` (ADR-0004), after the normal rule, so a completion or skip
    whose next date falls outside the season jumps to the next season start.
    Both modes go through it. For `FIXED`, the grid then continues from that
    1st, because the grid is anchored on the current due date anyway.
  - on create of a seasonal chore, to its `dueDate` (given or defaulted to
    today); on update only when the date or the season actually changes.
    An in-season date is left alone. An update that changes neither must not
    move an overdue chore whose season has ended (the web sheet resends both
    on every save).
- **At season start the chore is due on the 1st of the start month**
  (Matthias's call), not one interval later. If that's too early, move the
  date or skip.
- **An overdue chore stays due when its season ends** (Matthias's call). It
  stays in *Fällig* until it's done or skipped, and only then jumps to the next
  season. So there's no time-dependent "dormant" logic in sections or urgency;
  ADR-0005 and ADR-0007 are unchanged. A resting chore is simply one whose
  `dueDate` is the next season start, months out, so home doesn't show it.
- **Derived for display only:** `resting` = has a season, today is outside it,
  and `dueDate > today`. The "Wiederkehrend" view shows such a chore muted with
  "ruht bis <Monat>"; MCP gets the same flag.
- Storage: two nullable columns `seasonFrom`, `seasonTo` on `Task`. API and
  MCP carry it as `recurrence.season: { from, to } | null`.

## Consequences

- Undo needs nothing new: `dueDateBefore` restores the date exactly, season
  jump or not.
- **Changing or removing the season of a resting chore recomputes its date**
  (Matthias, 2026-10-04): what it would be without the old season's jump,
  i.e. the normal rule applied to the latest completion or skip
  (`nextDueDate` with the completion's `date` and `dueDateBefore`, without a
  season), then the new season, and **at the earliest today**, so it doesn't
  show up as overdue for time it spent resting. Without any completion: today,
  then the new season. Only when the chore was resting before the edit and
  the patch doesn't change `dueDate` itself; a date set by hand always wins.
- Urgency scale for a seasonal chore is still its interval (ADR-0005), not
  the season gap.

## Alternatives considered

- **Day-precise windows** (15.03.–31.10.): more flexible, fiddlier form, no
  real chore that needs it yet.
- **Hide out-of-season chores at read time** (a derived "dormant" state, even
  when overdue): Matthias prefers that an overdue chore stays visible until
  someone deals with it, and the stored-date approach needs no extra state.
- **"frühestens ab" date** (ideas.md): a one-time gate. It doesn't repeat every
  year, so it doesn't fit seasonal chores.
