# Ideas

> Parking lot for things that are **not scheduled**. An idea moves to
> `roadmap.md` when it's decided and scheduled. Newest at the bottom of each
> section is fine; keep entries short and dated.

## Deferred on purpose (bootstrap, 2026-10-02)

- **Assigned / personal tasks.** "Mostly shared, maybe optional assignment
  later." The `User` table (ADR-0003) already makes this a nullable
  `assigneeId` plus a "Meine" filter.
- **Rooms / categories / tags.** Flat list first; add when the list gets long
  enough to need it.
- **Shopping list.** Stays in Microsoft To Do (Einkaufsliste MCP) for now.

## Matthias's ideas, 2026-10-02 (not thought through yet; decide after real use)

- **Follow-up tasks** ("Wäsche aufhängen" erledigt → "Wäsche abhängen" a day
  later). **Superseded 2026-10-04 by ADR-0010:** becomes a second trigger
  source, "after task X is done + delay", for a trigger task. The follow-up is
  itself one persistent row that goes waiting → due, so a recurring or
  triggered predecessor no longer means generated instances. Skip doesn't
  fire it. Matthias wants it; next after the HA hook. Its delay is in days
  until due times exist (below).
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

- **"Erledigt" button in the notification** (Android supports actions). The
  service worker would call the API through Authelia; an expired session
  means a 302 it must handle (ADR-0009).
- **Notification opens the task**, not just home (deep link to the sheet).

- **Who does how much** — completion stats per person over time. The data is
  there from day one (Completion log). Handle with care: it's a household, not a
  KPI dashboard.
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

## From the Home Assistant discussion, 2026-10-04

- **Due times** (Matthias: "Uhrzeit als Fälligkeit wäre schon gut"). Today a
  due date is a calendar day (ADR-0004). A time makes "24 h later" exact and
  lets a reminder push at that time. Touches sections, urgency, digest and the
  sheet; needs its own ADR. Candidate after trigger tasks.
- **HA beyond firing** (ADR-0010 "not now"): pass a title/note suffix
  ("Trockner fertig, 2 h 10 min"); complete a task from HA (dryer door
  opened); a read endpoint so an HA sensor shows "3 fällig".
