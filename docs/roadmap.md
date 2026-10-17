# Roadmap

> **What's still open.** This file only holds work that is *not done*. Shipped
> entries move to `roadmap-archive.md` (create it with the first one) rather than
> being ticked off here. Ideas that aren't scheduled live in `ideas.md`; the
> reasoning behind decisions lives in `decisions/`.

_Last updated: 2026-10-17 (`v0.7.0` in use; unreleased: list refresh, ADR-0013)_

## Next — MVP in real use

The MVP is deployed and every manual check has passed. **Use it for real**
for a few weeks before building more.

Both users are on Android; there is no iPhone in the household, so iOS-only
checks don't apply.

Open manual check: **TC-105** (list refresh on reopening the installed app,
ADR-0013) after the next release.

## After the MVP

Decide after a few weeks of real use, guided by what hurts:

- Tune the urgency constants (ADR-0005).
- Per-task history view.
- Anything from `ideas.md` that turns out to be missed.
- **Due times** (pushed back by Matthias, 2026-10-08): own ADR when it comes
  up again. Collect his use cases first; they drive sections, in-day
  "overdue", push at the time, recurring chores with a time, digest, MCP.
