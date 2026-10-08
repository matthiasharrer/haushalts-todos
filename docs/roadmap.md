# Roadmap

> **What's still open.** This file only holds work that is *not done*. Shipped
> entries move to `roadmap-archive.md` (create it with the first one) rather than
> being ticked off here. Ideas that aren't scheduled live in `ideas.md`; the
> reasoning behind decisions lives in `decisions/`.

_Last updated: 2026-10-08 (`v0.6.0` tagged: follow-ups, ADR-0011)_

## Next — MVP in real use

The MVP is deployed. **Use it for real** for a few weeks before building
more.

Matthias pulled two features forward (2026-10-04):

1. **Deploy `v0.4.0`** (Matthias): set `HOOK_BASE_URL` to the in-cluster
   service URL (else the HA snippet shows the external, Authelia-protected
   origin). Push egress is open. Then TC-71 with Tina and TC-82 with the real
   washer; bugs come in separately.
2. **Follow-ups (ADR-0011)** released as `v0.6.0` (2026-10-08). Open: deploy
   (Matthias; the migration rebuilds the `Task` table, no data loss), then
   TC-95 with the real laundry.
3. **Due times** (Matthias, 2026-10-08: "Uhrzeiten für Fälligkeiten generell
   angehen"): own ADR next. Collect his use cases first; they drive sections,
   in-day "overdue", push at the time, recurring chores with a time, digest,
   MCP.

## After the MVP

Decide after a few weeks of real use, guided by what hurts:

- Tune the urgency constants (ADR-0005).
- Per-task history view.
- Anything from `ideas.md` that turns out to be missed.
