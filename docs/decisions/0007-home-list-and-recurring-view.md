# 0007. Home is the to-do list; recurring chores get their own view

- **Status:** Accepted. Amends ADR-0005's section order and what "Später" contains.
- **Date:** 2026-10-02

## Context

After the first UI (roadmap item 3), Matthias wanted to separate the recurring
chores as *templates* (a view to manage them) from their *instances* (what's
due, which belongs in the actual to-do list together with one-off tasks). The
home screen listed every recurring chore however far out it was, so a monthly
chore sat in "Später" for most of the month as noise.

## Decision

- **No change to the data model.** ADR-0004 stands: a recurring chore stays
  one row with a moving `dueDate`. The "instance" is that row while it's
  coming up. Generating real instance rows would bring back the backlog of
  missed copies that ADR-0004 exists to avoid.
- **Home ("Aufgaben") shows what's actionable**, in this order:
  1. **Fällig**: due today or earlier, recurring and one-off, by urgency
     (ADR-0005; longer overdue ranks higher at equal priority).
  2. **Irgendwann**: undated one-offs, aged by ADR-0005's formula.
  3. **Demnächst**: due within the next 7 days, recurring and one-off. It's
     visually quieter, but can still be ticked off (doing a chore early is
     fine).
  4. **Später**: **one-off tasks only**, dated more than 7 days out,
     collapsed.

  Recurring chores more than 7 days out don't appear on home. No toggle:
  when nothing is due, "Demnächst" naturally ends up at the top.
- **"Wiederkehrend" view**: every recurring chore (not archived), sorted by
  next due date, showing rhythm, next date and "zuletzt … · Name". Recurring
  chores are created here ("+" opens the sheet with Wiederholung switched on)
  and edited here (the same sheet as on home).
- **Quick-add on home creates one-offs only**; the existing sheet can still
  turn a one-off into a recurring chore.
- Navigation: a bottom tab bar, **Aufgaben** · **Wiederkehrend**, with the view
  in the URL hash so a reload keeps it.
- API: `GET /api/tasks` drops recurring tasks from `spaeter`. A new
  `GET /api/recurring` returns all active recurring tasks sorted by `dueDate`
  (then id), in the same DTO.

## Consequences

- Home stays short and about now. The full overview of chores lives in one
  place, which is also where per-chore history will go later.
- A long "Irgendwann" pushes "Demnächst" below the fold. Accepted;
  revisit if it bites.

## Alternatives considered

- **A toggle for "Demnächst"**: a setting to maintain for no gain over
  placing it last.
- **Demnächst between Fällig and Irgendwann** (the previous order): shows
  what you can't act on yet ahead of what you can.
