# Roadmap

> **What's still open.** This file only holds work that is *not done*. Shipped
> entries move to `roadmap-archive.md` (create it with the first one) rather than
> being ticked off here. Ideas that aren't scheduled live in `ideas.md`; the
> reasoning behind decisions lives in `decisions/`.

_Last updated: 2026-10-02 (MCP server built; next: first deploy)_

## Next — MVP: usable on both phones

The goal of the MVP is to **use it for real** for a few weeks before building
more. Order matters: deploy as soon as the list is usable, add MCP after.

- [ ] **Matthias tries it** on the Coder link and gives feedback before the
      first deploy. Cheap to change now.
- [ ] **4. First deploy** (MCP is built, so it ships with it) — release `v0.1.0`. Code side: image + manifests
      notes. **Matthias's side (GitOps repo):** deployment (`strategy:
      Recreate`, single replica: SQLite), PVC at `/data`, secret `MCP_TOKEN`
      (random, ≥ 32 chars), ingress with Authelia **except** `/mcp` and
      `/.well-known/` (same as rezepte), an Authelia account + access rule for
      his wife. Then: connect Claude once per person and run TC-44/45 for real.

## After the MVP

Decide after a few weeks of real use, guided by what hurts:

- Tune the urgency constants (ADR-0005).
- Per-task history view.
- Anything from `ideas.md` that turns out to be missed.
