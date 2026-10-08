# Roadmap

> **What's still open.** This file only holds work that is *not done*. Shipped
> entries move to `roadmap-archive.md` (create it with the first one) rather than
> being ticked off here. Ideas that aren't scheduled live in `ideas.md`; the
> reasoning behind decisions lives in `decisions/`.

_Last updated: 2026-10-08 (deployed through `v0.6.0`; open: Tina's push, real laundry run)_

## Next — MVP in real use

The MVP is deployed. **Use it for real** for a few weeks before building
more.

Open by hand (Matthias):

1. **Tina's push (TC-71):** her app works; whether her phone gets pushes is
   unconfirmed. Check: Einstellungen → "Auf diesem Gerät" on → "Test senden"
   on her phone.
2. **Real laundry chain (TC-95, `v0.6.0`):** "Wäsche aufräumen" follows
   "Wäsche aufhängen" by 24 h; run it once for real. Also the real washer
   automation end to end (TC-82 so far ran the HA action by hand).

## After the MVP

Decide after a few weeks of real use, guided by what hurts:

- Tune the urgency constants (ADR-0005).
- Per-task history view.
- Anything from `ideas.md` that turns out to be missed.
- **Due times** (pushed back by Matthias, 2026-10-08): own ADR when it comes
  up again. Collect his use cases first; they drive sections, in-day
  "overdue", push at the time, recurring chores with a time, digest, MCP.
