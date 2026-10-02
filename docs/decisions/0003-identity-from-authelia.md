# 0003. Users come from Authelia; the app keeps a User table

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

Two people use the app and it matters who did what ("wann hat wer zuletzt…").
Authelia already authenticates both at the ingress. Its ForwardAuth middleware
puts `Remote-User`, `Remote-Name`, `Remote-Email` and `Remote-Groups` on every
request it lets through, and Traefik strips any client-supplied copies, so they
are trustworthy on routes behind it (see rezepte `architecture.md`, "Auth").

Rezepte deliberately does *not* record users (its ADR-0029): it has one human,
and its MCP writes arrive with no identity. Neither is true here: there are two
humans, and MCP tokens are bound to a user (ADR-0006).

## Decision

- **No login code in the app.** Authelia stays the only authentication for the
  web UI.
- **A `User` table, filled on first sight.** A middleware on `/api/*` upserts a
  user keyed by `Remote-User` (refreshing name/email) and puts it on the request
  context. A request to `/api/*` without `Remote-User` is **401** (except
  `/api/health`). Unlike rezepte's display-only `/api/me`, identity is load-bearing here.
- Writes record **both** the user and the channel (`via`: `web` /
  `mcp:<client>`).
- **Dev:** the Vite proxy fakes the `Remote-*` headers (as in rezepte),
  overridable with `DEV_REMOTE_USER` etc., so we can act as either person.

## Consequences

- Adding Matthias's wife = an Authelia account plus an access rule for the
  app's domain (homelab/GitOps work, not code).
- The API has a single trust assumption: no route into the pod bypasses the
  ingress (ClusterIP service, network policy), the same as rezepte.
- `Remote-Groups` is unused for now; it's the natural hook if a guest or child
  account ever needs fewer rights.

## Alternatives considered

- **Identity only as a string on rows, no table** (rezepte's actor approach) —
  fine for one user, but assignment, "mine" filters and per-person stats all
  want a real foreign key.
- **App-level accounts** — duplicates Authelia for no gain.
