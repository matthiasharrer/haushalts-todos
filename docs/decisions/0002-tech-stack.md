# 0002. Tech stack — same as rezepte

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

A small app for two users, self-hosted in the same homelab as `rezepte`, built
the same way (AI-led, many sessions). Rezepte's stack has been through ~35
releases, has a proven single-container deploy, scripted e2e, a working MCP
server with OAuth, and documented workspace traps. Nothing about a household
to-do list needs anything rezepte's stack lacks.

## Decision

Mirror rezepte:

| Layer     | Choice |
| --------- | ------ |
| Frontend  | Svelte 5 SPA with Vite (no SvelteKit/SSR), German UI, mobile-first |
| Backend   | Hono on Node 22 |
| Database  | Prisma 7 + SQLite (better-sqlite3 adapter, WAL), single replica |
| Auth      | Authelia ForwardAuth at the ingress (ADR-0003); MCP has its own OAuth (ADR-0006) |
| Deploy    | One container (API serves the SPA), image built by GitHub Actions → GHCR, Flux GitOps |
| Tests     | Playwright e2e (`npm run e2e`) + `node --test` unit tests for pure logic |

Ports in the workspace: API **3001**, web **5174** (rezepte has 3000/5173;
both run side by side).

Patterns are **copied and adapted** from rezepte, never imported across repos.

## Consequences

- Everything rezepte learned the hard way (Prisma/TS version pins, the e2e
  workspace trap, the MCP/OAuth ingress layout) applies directly.
- Two repos drift independently; a fix in one isn't automatically in the
  other. Acceptable at this size.

## Alternatives considered

- **Adding to rezepte** as a second module — couples two unrelated products,
  their releases and their data; rezepte is single-user by design.
- **An off-the-shelf app** (Grocy chores, Donetick, Vikunja) — viable, but the
  point is an app shaped exactly to how we work, with Claude integration.
