# Roadmap

> **What's still open.** This file only holds work that is *not done*. Shipped
> entries move to `roadmap-archive.md` (create it with the first one) rather than
> being ticked off here. Ideas that aren't scheduled live in `ideas.md`; the
> reasoning behind decisions lives in `decisions/`.

_Last updated: 2026-10-02 (task list UI shipped; waiting on Matthias's feedback from real use, then deploy)_

## Next — MVP: usable on both phones

The goal of the MVP is to **use it for real** for a few weeks before building
more. Order matters: deploy as soon as the list is usable, add MCP after.

- [ ] **Matthias tries it** on the Coder link and gives feedback before the
      first deploy. Cheap to change now.
- [ ] **4. First deploy** — release `v0.1.0`. Code side: image + manifests
      notes. **Matthias's side (GitOps repo):** deployment, PVC, ingress with
      Authelia, an Authelia account + access rule for his wife.
- [ ] **5. MCP server** (ADR-0006) — port rezepte's `/mcp` + OAuth, bind
      clients/tokens to the approving user, a small German-friendly tool set;
      Settings page listing *my* connected clients with revoke. **Matthias's
      side:** ingress exemption for `/mcp` and `/.well-known` (same as rezepte).

## After the MVP

Decide after a few weeks of real use, guided by what hurts:

- Tune the urgency constants (ADR-0005).
- Per-task history view.
- Anything from `ideas.md` that turns out to be missed.
