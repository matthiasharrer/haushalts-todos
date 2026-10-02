# Roadmap

> **What's still open.** This file only holds work that is *not done*. Shipped
> entries move to `roadmap-archive.md` (create it with the first one) rather than
> being ticked off here. Ideas that aren't scheduled live in `ideas.md`; the
> reasoning behind decisions lives in `decisions/`.

_Last updated: 2026-10-02 (bootstrap: vision agreed, skeleton being built)_

## Next — MVP: usable on both phones

The goal of the MVP is to **use it for real** for a few weeks before building
more. Order matters: deploy as soon as the list is usable, add MCP after.

- [ ] **1. Walking skeleton** — monorepo, Hono + Prisma/SQLite, Svelte SPA,
      Authelia identity → `User` table (ADR-0003), `scripts/app.sh`, Dockerfile,
      CI, e2e harness. *In progress.*
- [ ] **2. Task core (API)** — `Task` + `Completion` schema (domain-model.md);
      pure, unit-tested `nextDueDate` (ADR-0004) and `section`/`urgency`
      (ADR-0005); REST endpoints: list (sectioned + sorted), create, edit,
      complete (with optional date), skip, undo latest, archive.
- [ ] **3. Task list (web)** — the main screen: Fällig / Demnächst / Später
      (collapsed) / Irgendwann; quick-add (title only → one-off, no date);
      tick off with an undo toast; edit sheet for notes, priority, due date,
      recurrence (every N days/weeks/months, after completion vs. fixed);
      skip; "zuletzt erledigt von … am …" on each recurring task.
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
