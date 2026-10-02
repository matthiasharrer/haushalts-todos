# 0006. MCP server with OAuth, tokens bound to the approving user

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

Matthias wants an MCP server "like rezepte's, bypassing Authelia with its own
auth", so both of us can manage tasks from Claude. Rezepte solved this over
ADR-0023 (MCP over Streamable HTTP at `/mcp`), ADR-0024 (stateless OAuth: signed
blobs, dynamic client registration, consent page behind Authelia) and ADR-0025
(client management in Settings). That design is proven in production, including
the ingress exemptions.

The one new requirement: there are two users, so an MCP write has to know
*whose* Claude made it.

## Decision

- **Reuse rezepte's MCP/OAuth design**: copy and adapt
  `apps/api/src/mcp/` (`mount.ts`, `server.ts`, `verifier.ts`, `oauthRoutes.ts`)
  and its ADRs' layout:
  - `/mcp`, `/mcp/register`, `/mcp/token` and `/.well-known/*` are **exempt from
    Authelia** at the ingress (bearer auth instead);
  - the consent page lives at **`/oauth/authorize`, deliberately off the `/mcp`
    prefix**, so it **stays behind Authelia**.
- **Tokens are bound to a user.** Authelia has already identified whoever
  approves a client on the consent page. The app records that user on the
  client (`McpClient.userId`) and every token issued to it. MCP calls act as
  that user: completions are attributed to them, `via = mcp:<client name>`.
- **OAuth only — no static bearer token, ever** (Matthias, 2026-10-02; rezepte
  dropped its static bearer the same day, its ADR-0038). Every MCP caller goes
  through the consent page and is therefore a known user. A server-side secret
  still exists, but only to sign the stateless OAuth tokens; it's never
  accepted as a bearer.
- Tools speak German-friendly but stay small: list/search tasks (with section
  and urgency), add task, complete/skip/undo, edit. Exact tool set is decided
  when the slice is built.

## Consequences

- Each of us connects our own Claude once; revoking a client is per person.
- The ingress config (GitOps repo, Matthias's side) needs the same two-prefix
  exemption as rezepte. Until it exists, MCP is built but unreachable from
  outside.
- Code is copied from rezepte, so fixes there need porting by hand.

## Alternatives considered

- **Per-client attribution only** (rezepte today) — would lose "who did it"
  for every Claude-driven completion.
- **Pass the user as a tool argument** — trusts the model to tell the truth
  about who it's acting for.
- **A static bearer for scripts/automations** — a credential with no user
  behind it and no per-client revoke. Rejected outright.
