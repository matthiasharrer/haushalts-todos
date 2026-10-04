# Roadmap

> **What's still open.** This file only holds work that is *not done*. Shipped
> entries move to `roadmap-archive.md` (create it with the first one) rather than
> being ticked off here. Ideas that aren't scheduled live in `ideas.md`; the
> reasoning behind decisions lives in `decisions/`.

_Last updated: 2026-10-04 (`v0.2.0` tagged: seasonal chores, ADR-0008; first deploy of `v0.1.0` done; next: deploy `v0.2.0`, Matthias's side)_

## Next — MVP in real use

The MVP is deployed. **Use it for real** for a few weeks before building
more.

- [ ] **Deploy `v0.2.0`** (seasonal chores, ADR-0008): bump the image tag in
      the GitOps repo; the migration runs on container start. Matthias's side.
- [ ] **MCP against the real ingress:** connect Claude once per person and run
      TC-44/45 for real (unverified so far; skip if already done).

## After the MVP

Decide after a few weeks of real use, guided by what hurts:

- Tune the urgency constants (ADR-0005).
- Per-task history view.
- Anything from `ideas.md` that turns out to be missed.
