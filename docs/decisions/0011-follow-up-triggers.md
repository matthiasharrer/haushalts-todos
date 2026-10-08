# 0011. Follow-ups: a trigger task fires a set number of hours after another task is done

- **Status:** Accepted. Extends ADR-0010 (a second fire source next to Home Assistant).
- **Date:** 2026-10-08

## Context

Matthias's laundry chain: HA fires "Wäsche aufhängen" when the dryer (or
washer) is done. **24 hours after** it's ticked off, "Wäsche aufräumen" should
be due, with a push. ADR-0010 parked this as "second trigger source: after
task X + delay", with the delay in **days** until due times exist.

Days don't work for this. A due date is a calendar day (ADR-0004), so "1 day
after" means "tomorrow". Laundry hung at 22:00 would be due at the next
morning's digest, about 9 hours later, while it's still wet. Matthias:
**hours, days aren't enough.** A push at 2 a.m. (hung at 2 a.m.) is accepted:
the phone stays quiet at night anyway.

Due times in general (Matthias wants them) are a bigger change: sections,
"overdue" within a day, the digest, recurring chores with a time, MCP. They
get their own ADR. This ADR doesn't need them.

## Decision

### The follow-up is a trigger task with a second fire source

A trigger task (ADR-0010) can name a **predecessor** and a **delay in whole
hours** (1–720). When the predecessor is **done**, the follow-up gets a
**scheduled fire time** `fireAt = time of the completion + delay`. Until then
it stays **waiting**: invisible on home, shown in Routinen with when it
comes. At `fireAt` it **fires exactly like an HA fire** (`fireTask`): due
today, `firedAt` set, the "Jetzt fällig" push to everyone if `notify` is on;
if it's still fired from last time, its refire setting applies.

So the follow-up doesn't need a due time: the exact moment lives in `fireAt`,
and from there on it's an ordinary fired trigger task with a due *date*. When
due times come, a fired follow-up simply gets its fire time as the due time.

### Rules

- **Predecessor:** any active task (one-off, recurring, trigger), not the task
  itself. Otherwise 400. Chains (A → B → C) and several follow-ups per
  predecessor just work. A cycle (A → B → A) isn't forbidden. It's harmless:
  each step still needs someone to tick it off.
- **Only "done" schedules.** Skip doesn't. A back-dated completion ("Erledigt
  am … gestern") still counts from *now*: there's no time of day in the past.
- **Done again while one is pending:** the latest completion wins (`fireAt`
  moves later). For laundry, that's "tidy up once everything is dry".
- **Undo** of the predecessor's completion that scheduled it clears a pending
  `fireAt` (tracked by `fireAtCompletionId`). An earlier pending time that a
  later completion replaced isn't restored. That's a rare edge, accepted.
- **Any fire that wakes the task** (scheduled or HA) clears a pending `fireAt`.
- **Editing the follow-up:**
  - removing the predecessor, choosing another one, or switching away from
    *trigger* clears `fireAt`;
  - changing only the hours while one is pending recomputes it from the
    original completion time. If that's already past, it fires on the next
    tick.
- **Archiving the predecessor** unlinks its follow-ups (predecessor and hours
  cleared). A pending `fireAt` still fires.
- An archived follow-up never fires.

### Scheduler

The existing one-minute ticker (`startNotifyTicker`) also runs
`runFollowUpTick(now)`. It finds active trigger tasks with `fireAt <= now`.
For each one, it first claims it with a conditional update (`fireAt` back to
null where it still has that value), then calls `fireTask(id, now)`. A restart
catches up on the next tick, so a fire is late by at most a minute (or by the
downtime), never lost.

### Data

`Task` gains:
- `afterTaskId` (nullable self-relation, "follows");
- `afterHours` (nullable int; both set or both null);
- `fireAt` (nullable timestamp);
- `fireAtCompletionId` (nullable int, no FK).

### API

- **Input:** `trigger: { refire, after?: { taskId, hours } | null }`.
  - create: absent = no predecessor;
  - update: absent = unchanged, `null` = remove.
- **DTO:**
  - `trigger` gains `after: { taskId, title, hours } | null` and
    `fireAt: string | null` (ISO);
  - every task gains `followUps: { id, title, hours }[]` (its active
    follow-ups, possibly empty).
- **`GET /api/tasks/choices`** returns `{ tasks: { id, title }[] }`: every
  active task (not archived, not a finished one-off), sorted by title. It's
  what the sheet's picker lists.

### UI

- **Sheet, kind *Auslöser*:** a field **„Folgt auf“** with a select:
  - „Keine (nur Home Assistant)“ (default);
  - every other active task.
  With a task chosen, it shows **„nach [24] Stunden“** (number, default 24).
  - While one is pending, a hint says „Kommt Do. 15.10. um 22:15“.
  - Saving a **new** trigger task **with** a predecessor doesn't open the
    token dialog: a follow-up rarely needs HA. The Home Assistant block is
    still there to generate a token later.
- **Sheet of a predecessor** (any kind): a hint „Danach: Wäsche aufräumen
  (nach 24 h)“, one line per follow-up.
- **Routinen row** of a waiting trigger task:
  - with a pending `fireAt`: „kommt heute 22:15“ / „kommt morgen 22:15“ /
    „kommt Do. 15.10. 22:15“;
  - with a predecessor and nothing pending: „nach „Wäsche aufhängen“ + 24 h“;
  - otherwise „wartet“ as before.
  A fired one is unchanged („ausgelöst heute 22:15“).

### MCP

- `add_task` / `update_task`: `trigger.after: { task_id, hours } | null`.
- `list_recurring` / `get_task` labels: „Auslöser · kommt morgen 22:15“,
  „Auslöser · nach „X“ + 24 h“.
- `followUps` comes along in the DTO.

## Consequences

- The laundry chain is two trigger tasks: "Wäsche aufhängen" (HA token) and
  "Wäsche aufräumen" (follows it, 24 h). No HA config for the second.
- `fireAt` is the app's first stored point in time that drives behaviour.
  Due times can reuse the ticker.
- The old "follow-up tasks" idea (generated instances) is gone for good.

## Not now

- **Due times** in general: own ADR, next (Matthias wants them).
- Quiet hours for pushes (accepted for now: the phone handles the night).
- A delay in minutes, or "at the next 8:00".

## Alternatives considered

- **Delay in days on calendar dates** (ADR-0010's plan): wrong for laundry
  (see Context).
- **Due times first, follow-up = "due at completion + 24 h"**: needs the big
  due-time change before this small one. It would also show the follow-up a
  day in advance on home, where it's clutter. A pending follow-up belongs in
  Routinen, like a waiting HA trigger.
- **A generated one-off task per completion:** duplicates and a second list.
  ADR-0010 already settled on "one row that comes and goes".
