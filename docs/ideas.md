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

## Maybe later

- **Who does how much** — completion stats per person over time. The data is
  there from day one (Completion log). Handle with care: it's a household, not a
  KPI dashboard.
- **Seasonal chores** — "only March–October" (garden, gutters).
- **Promote stale "Irgendwann" tasks** into view if they rot (ADR-0005).
- **Link to rezepte?** e.g. "Kühlschrank auswischen" — probably not; noted so
  nobody re-derives it.
