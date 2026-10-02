# Ideas

> Parking lot for things that are **not scheduled**. An idea moves to
> `roadmap.md` when it's decided and scheduled. Newest at the bottom of each
> section is fine; keep entries short and dated.

## Deferred on purpose (bootstrap, 2026-10-02)

- **PWA push reminders.** Matthias: interesting, but only once the app has
  proven useful. Precondition: the PWA install/offline groundwork from
  rezepte (its ADR-0017) ported over. Likely shape: one daily digest
  ("3 Aufgaben fällig") rather than a push per task.
- **Assigned / personal tasks.** "Mostly shared, maybe optional assignment
  later." The `User` table (ADR-0003) already makes this a nullable
  `assigneeId` plus a "Meine" filter.
- **Rooms / categories / tags.** Flat list first; add when the list gets long
  enough to need it.
- **Shopping list.** Stays in Microsoft To Do (Einkaufsliste MCP) for now.

## Matthias's ideas, 2026-10-02 (not thought through yet; decide after real use)

- **Follow-up tasks** ("Wäsche waschen" → "Wäsche aufhängen"). Cheap version:
  a one-off can *wait for* another task (`waitsForId`, optional offset "3 Tage
  danach"); hidden or greyed ("wartet auf …") until the predecessor is done,
  then it gets its due date. **Expensive** if the predecessor is recurring:
  every completion would have to spawn a new follow-up, i.e. generated
  instances, the thing ADR-0004 avoids. Lead's recommendation: one-off chains only.
- **When a task *can* be done** (e.g. Wertstoffhof must be open). Three levels:
  1. "frühestens ab" date: hidden (or under Später) until then; also covers
     seasonal chores. Very cheap.
  2. Weekday mask ("nur Mi/Fr/Sa"): ranks up and shows "heute möglich" only
     on those days. Cheap; probably the useful core of the idea.
  3. Real opening hours with times: a lot of logic for little gain. Lead
     recommends against.
- **Calendar subscription (iCal feed)** of due tasks as all-day events, e.g. in
  Google Calendar on the phone. Technically simple, but Google refreshes
  subscribed calendars only every ~12–24 h (ticked-off tasks linger a day),
  and the feed must bypass Authelia with a secret token in the URL (like
  rezepte's `/s` share links). Matthias himself unsure it helps; MCP already
  answers "what's due". Lead's recommendation: park.
- **Fixed interval vs. "after completion"**: already exists per chore
  ("fester Rhythmus" / "nach Erledigung" in the sheet, ADR-0004). If
  Matthias didn't notice it, it may be too hidden; revisit the sheet layout
  or the default after use.

## Maybe later

- **Who does how much** — completion stats per person over time. The data is
  there from day one (Completion log). Handle with care: it's a household, not a
  KPI dashboard.
- **Seasonal chores** — "only March–October" (garden, gutters).
- **Urgency details to revisit after real use** (ADR-0005): not-yet-due
  tasks score just their weight (overdue clamped at 0); MONTH counts as 30
  days for the scale; monthly FIXED tasks drift after clamping (31 Jan → 28 Feb
  → 28 Mar), as ADR-0004 specifies.
- **Hard delete / purge of archived tasks.** "Löschen" only archives; there's
  no way to really remove rows. Fine for now; maybe an "Archiv" view later.
- **Undo after an edit:** undo restores `dueDateBefore` even if the due date
  was edited by hand in between. Rare; revisit if it ever bites.
- **German MCP validation errors.** The SDK's own input-schema errors come back
  in English ("Input validation error: …"); domain errors are German. Harmless
  for a model; fix only if it ever shows to a person.
- **Promote stale "Irgendwann" tasks** into view if they rot (ADR-0005).
- **Link to rezepte?** e.g. "Kühlschrank auswischen" — probably not; noted so
  nobody re-derives it.
