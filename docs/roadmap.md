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

## Quick-add (from real use, 2026-10-15)

- **Due date + priority in quick-add:** today the one-liner only creates a
  title, so new tasks land in „irgendwann“. Mockups (A: chip row above the
  field, B: chips inside the one-liner, C: quick-pick row Heute/Morgen/
  Wochenende/Datum) are on a private design canvas; Matthias picks. Default
  „Heute“, removable with one tap, plus a „Wichtig“ toggle.
- **Keyboard jump (bug):** on the phone, focusing the quick-add field scrolls
  the list to the top and the position is lost when the keyboard closes. Only
  the bar should move up. Likely iOS Safari scrolling the document for a
  focused input in a `position: fixed` bar; fix candidates: keep the bar on
  `visualViewport` and focus with `preventScroll`, restore `scrollY` on blur;
  `interactive-widget=resizes-content` covers Android Chrome only. Needs a
  test on the real phone; do it together with the chips (same bar).

## After the MVP

Decide after a few weeks of real use, guided by what hurts:

- Tune the urgency constants (ADR-0005).
- Per-task history view.
- Anything from `ideas.md` that turns out to be missed.
- **Due times** (pushed back by Matthias, 2026-10-08): own ADR when it comes
  up again. Collect his use cases first; they drive sections, in-day
  "overdue", push at the time, recurring chores with a time, digest, MCP.
