# Roadmap

> **What's still open.** This file only holds work that is *not done*. Shipped
> entries move to `roadmap-archive.md` (create it with the first one) rather than
> being ticked off here. Ideas that aren't scheduled live in `ideas.md`; the
> reasoning behind decisions lives in `decisions/`.

_Last updated: 2026-10-04 (`v0.3.0` tagged: push, ADR-0009; next: deploy + HA triggers)_

## Next — MVP in real use

The MVP is deployed. **Use it for real** for a few weeks before building
more.

Matthias pulled two features forward (2026-10-04):

1. **Deploy `v0.3.0`** (Matthias): pod egress to `fcm.googleapis.com`
   (HTTPS); then TC-71 on both phones (new one-off reaches the other person).
2. **Home Assistant triggers** ("Waschmaschine fertig" → task + push). Own ADR.
   **Open for Matthias:** a narrow per-trigger secret URL (can only fire that
   one trigger, revocable) as a deliberate exception to ADR-0006's "no static
   token". Lead recommends yes.

## After the MVP

Decide after a few weeks of real use, guided by what hurts:

- Tune the urgency constants (ADR-0005).
- Per-task history view.
- Anything from `ideas.md` that turns out to be missed.
