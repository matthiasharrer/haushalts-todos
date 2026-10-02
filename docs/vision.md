# Vision

_Agreed with Matthias on 2026-10-02 (bootstrap session). This is the "why" and
"what" — the product owner's intent. Change it only when he changes his mind._

## What it is

**Haushalt** — a shared to-do app for the household of Matthias and his wife.
It answers one question well: **"What should we do around the house next?"**

Two kinds of things live in it:

- **One-off tasks** — "Fahrradschloss ersetzen", "Steuerbescheid abheften".
  Optionally with a deadline; often without one ("irgendwann").
- **Recurring chores** — "Kaffeemaschine entkalken", "Bettwäsche wechseln",
  "Filter der Dunstabzugshaube". The interesting part of the app.

## Principles

1. **Recurring means "again N after it was last done"** — not "every N on the
   calendar". If the sheets get changed 3 days late, the next change is due two
   weeks after *that*, not two weeks after the original due date. Missed
   occurrences never pile up. A calendar-anchored mode exists for the few
   things that really are tied to a weekday (bins), but it's the exception.
2. **Sorted by what matters, not just by date.** The list puts the most
   *urgent* thing first, where urgency weighs how overdue something is relative
   to how often it happens, plus a light manual priority. Three days late on a
   weekly chore is worse than three days late on a quarterly one.
3. **Shared by default.** Both people see the same list; either can tick
   anything off. The app knows *who* did it (Authelia identity), but tasks are
   not owned by a person. Optional assignment may come later.
4. **Low ceremony.** Adding a task or ticking one off is a couple of taps on a
   phone. Flat list — no rooms, projects or tags until real use shows we need
   them.
5. **Talk to it.** An MCP server from the start, so either of us can say to
   Claude "ich hab die Waschmaschine gereinigt" or "neue Aufgabe: Filter
   wechseln, alle 3 Monate" — attributed to whoever's Claude it was.
6. **Remembers history.** Every completion is logged, so "wann haben wir das
   zuletzt gemacht?" is always answerable.

## Users and context

- Two users: Matthias and his wife. Both authenticate via **Authelia** (already
  in front of rezepte); the app gets their identity from the ingress.
- **German UI**, **mobile-first** — used on phones, around the house.
- Self-hosted in the homelab Kubernetes cluster, like rezepte.

## Explicitly out of scope (for now)

- **Shopping** — stays in Microsoft To Do (the Einkaufsliste MCP).
- **Push notifications / reminders** — interesting, but deferred until the app
  has proven itself useful. You open it and look.
- **Assigned / personal tasks** — "mostly shared"; optional assignment later.
- **Rooms, categories, tags** — flat list first.

These are tracked in [`ideas.md`](ideas.md).
