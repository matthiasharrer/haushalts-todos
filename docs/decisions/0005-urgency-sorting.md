# 0005. Sort due tasks by urgency, not just by date

- **Status:** Accepted (the constants are a starting point, to be tuned after real use)
- **Date:** 2026-10-02

## Context

Matthias wants "some priority system for sorting the due tasks other than just
time". A plain 1–5 priority field tends to drift until everything is "high",
and sorting purely by due date treats a slipped weekly chore the same as a
slipped quarterly one.

## Decision

The list has four sections:

| Section        | Contains                        | Sorted by |
| -------------- | ------------------------------- | --------- |
| **Fällig**     | `dueDate ≤ today`               | urgency score, highest first |
| **Demnächst**  | due within the next 7 days      | due date, then priority |
| **Später**     | due further out (collapsed)     | due date |
| **Irgendwann** | one-off tasks without a date    | priority weight × (1 + age in days / 30) |

**Urgency score** for a due task:

```
overdueDays = today − dueDate                    (≥ 0 in "Fällig")
scale       = recurrence interval in days        (recurring)
            = 7                                  (one-off with a deadline)
score       = weight × (1 + overdueDays / scale)
weight      = LOW 0.5 · NORMAL 1 · HIGH 2
```

So a normal chore due today scores 1, an important one 2, and a normal weekly
chore one week late also scores 2. A quarterly chore needs a quarter of
lateness to get there.

Priority is three levels with German labels *kann warten* / *normal* /
*wichtig*. Default *normal*; most tasks should never need changing.

Section and score are **derived, never stored**. They're computed in one pure,
unit-tested function, so changing the formula is a code change with no migration.

## Consequences

- The constants (7-day "Demnächst" window, 7-day scale for one-offs, weights,
  the 30-day aging for "Irgendwann") are guesses. Tune them after a few weeks
  of use.
- Undated tasks stay in "Irgendwann" however old they get; aging only reorders
  them within it. If they rot there, an idea for later is to promote stale
  ones.

## Alternatives considered

- **Due date only** — what Matthias explicitly didn't want.
- **Manual 1–5 or Eisenhower matrix** — more ceremony per task and drifts.
- **Fully automatic, no manual priority** — can't express "this one actually
  matters" (e.g. smoke-detector battery).
