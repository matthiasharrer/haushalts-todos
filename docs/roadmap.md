# Roadmap

> **What's still open.** This file only holds work that is *not done*. Shipped
> entries move to `roadmap-archive.md` (create it with the first one) rather than
> being ticked off here. Ideas that aren't scheduled live in `ideas.md`; the
> reasoning behind decisions lives in `decisions/`.

_Last updated: 2026-10-05 (`v0.4.1` tagged: header title links to Aufgaben)_

## Next — MVP in real use

The MVP is deployed. **Use it for real** for a few weeks before building
more.

Matthias pulled two features forward (2026-10-04):

1. **Deploy `v0.4.0`** (Matthias): set `HOOK_BASE_URL` to the in-cluster
   service URL (else the HA snippet shows the external, Authelia-protected
   origin). Push egress is open. Then TC-71 with Tina and TC-82 with the real
   washer; bugs come in separately.
2. **Follow-up as a trigger source** ("1 Tag nach *Wäsche aufhängen*"), see
   `ideas.md`; then decide on **due times**.

## After the MVP

Decide after a few weeks of real use, guided by what hurts:

- Tune the urgency constants (ADR-0005).
- Per-task history view.
- Anything from `ideas.md` that turns out to be missed.
