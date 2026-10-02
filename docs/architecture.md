# Architecture

_The current picture. The reasoning is in `decisions/`. Last updated:
2026-10-02 (task core API)._

## Overview

```
Phone ──▶ Ingress (Traefik + Authelia ForwardAuth) ──▶ one container
                                                        ├─ Hono API   /api/*
                                                        ├─ built SPA  /*  (index.html fallback)
                                                        └─ SQLite on PVC  /data/haushalt.db

Claude ──▶ Ingress (Authelia-EXEMPT: /mcp*, /.well-known/*) ──▶ same container   (ADR-0006)
```

One Node process serves the API and the built Svelte SPA (`WEB_DIST`,
`apps/api/src/static.ts`). Single replica, because SQLite lives on the PVC.
`docker-entrypoint.sh` snapshots the DB, then runs `prisma migrate deploy`,
then starts the server.

## Auth and identity

Authelia authenticates at the ingress and passes `Remote-User`, `Remote-Name`,
`Remote-Email` and `Remote-Groups`. Traefik strips client-supplied copies, so
these headers are trustworthy behind the ingress. `apps/api/src/identity.ts`
(on `/api/*`, except `/api/health`):

- no `Remote-User` → **401**;
- otherwise it upserts `User` by `username` (writing only when name or email
  changed) and sets `c.get('user')`.

`GET /api/me` returns `{ id, username, displayName, email }`.

**Dev:** the Vite proxy (`:5174` → `:3001`) overwrites the `Remote-*` headers
with fakes (`DEV_REMOTE_USER` etc.; an empty value removes the header).
**e2e:** the browser context sends `Remote-User: matthias` via
`extraHTTPHeaders`; API cases set headers per request.

## MCP (ADR-0006, ported from rezepte ADR-0023/24/25/38)

`apps/api/src/mcp/`: `mount.ts` (the `/mcp` gate; keeps rezepte's duck-typed
`isAuthInfo` guard against `@hono/node-server`'s `Response` swap, a fail-open
otherwise), `verifier.ts`, `oauthRoutes.ts` (DCR `/mcp/register`, consent
`/oauth/authorize`, `/mcp/token`, `/.well-known/*`), `server.ts` (10 tools),
`format.ts` (German labels in tool results). Signing in `lib/mcpOAuth.ts`:
stateless HMAC blobs keyed by `MCP_TOKEN`. **OAuth only:** `MCP_TOKEN` is
never accepted as a bearer. Unset means `/mcp` is not mounted (404).

**User binding.** `/oauth/authorize` runs the identity middleware (no
`Remote-User` → 401). Approving binds `McpClient.userId` with one conditional
update (unbound or already this user; otherwise a German 403). `uid` is signed
into code, access and refresh tokens. The token grants and the verifier all
require `client.userId === uid`. Tools get `{ userId, clientName }` only from
`authInfo.extra` and write through `lib/tasks.ts` as
`Actor { userId, via: "mcp:<client name>" }`. No tool takes a user argument.
Revoke = delete the row, effective on the next request.

**Ingress (GitOps side):** exempt `/mcp` (prefix, covers `/mcp/register` and
`/mcp/token`) and `/.well-known/`. **Everything else stays behind
Authelia, `/oauth/authorize` included**; that is what makes consent identify the user.
`PUBLIC_URL` (optional) overrides the origin in discovery documents;
otherwise `X-Forwarded-*` (`lib/externalOrigin.ts`).

Settings (`#/einstellungen`, gear in the header): endpoint URL, how-to, my
clients (rename, revoke) via `/api/mcp/config` and `/api/mcp/clients` (scoped
to the caller).

## Data

Prisma 7, `prisma-client` generator into `apps/api/src/generated/prisma`
(gitignored), better-sqlite3 driver adapter, WAL on at runtime (`src/db.ts`).

Schema: `User`, `Task`, `Completion`, `McpClient` (`userId` bound at consent, cascade on user delete) (as in `domain-model.md`), with Prisma
enums for priority, unit, mode and completion kind. Dates are `YYYY-MM-DD`
strings (Europe/Berlin); `doneAt`/`archivedAt`/`Completion.at` are timestamps.

## Task logic: three layers

| Layer | File | Notes |
| ----- | ---- | ----- |
| Pure domain | `lib/dates.ts`, `lib/recurrence.ts`, `lib/urgency.ts` | No Prisma. `nextDueDate` (ADR-0004), sections and scores (ADR-0005). Unit-tested (TC-06…13). |
| Service | `lib/tasks.ts` | zod schemas, every operation, and transactions. Takes an `Actor {userId, via}`, so web and (later) MCP share one path. Throws `TaskError(status)`. **Every write goes through here**, because the invariant "a recurring task always has a `dueDate`" lives here. |
| HTTP | `routes/tasks.ts` | Thin: parses, calls the service, maps `TaskError`. |

Endpoints (all behind identity):

| Method | Path | Does |
| ------ | ---- | ---- |
| GET    | `/api/tasks` | `{ today, sections: { faellig, demnaechst, spaeter, irgendwann } }`, sorted; excludes archived and done one-offs, and recurring tasks from `spaeter` (ADR-0007) |
| GET    | `/api/recurring` | `{ today, tasks }`: all active recurring tasks by `dueDate`, then id. The DTO's `section` is still the raw derived one (a far chore says `spaeter`). |
| POST   | `/api/tasks` | create; recurring without a date → due today |
| PATCH  | `/api/tasks/:id` | partial; `recurrence: null` → one-off |
| POST   | `/api/tasks/:id/complete` | `{date?}` (≤ today) → Completion DONE + move date / finish one-off |
| POST   | `/api/tasks/:id/skip` | recurring only → Completion SKIPPED + move date |
| POST   | `/api/tasks/:id/undo` | delete latest *recorded* completion, restore `dueDateBefore` / clear `doneAt`; 409 if none |
| DELETE | `/api/tasks/:id` | archive (204), completions kept |

`lastDone` in the DTO = the DONE completion with the latest `date` (skips
don't count). `urgency` is a number for every dated task (not-yet-due counts
as 0 days late) and null for undated ones.

## Frontend

Svelte 5 SPA, no router yet (single `Home` route), `lib/api.ts` fetch wrapper,
`app.css` with CSS custom properties. German UI, phone viewport first.

Two views, switched by URL hash in `App.svelte` (no router; no hash = Aufgaben), with a bottom tab bar: **Aufgaben** (`routes/Home.svelte`, `#/`) and **Wiederkehrend** (`routes/Recurring.svelte`, `#/wiederkehrend`, from `GET /api/recurring`), see ADR-0007. Toast state lives in `lib/store.svelte.ts` (one `Toast` mounted in `App`, survives tab switches; a `version` counter makes the mounted view refetch). Home has the four sections (Fällig · Irgendwann · Demnächst · Später), a fixed quick-add bar at
the bottom, one toast slot (success with Rückgängig, or a red error), and the
edit sheet (`lib/TaskSheet.svelte`, native `<dialog>`). Rows are
`lib/TaskRow.svelte`. Every mutation refetches `GET /api/tasks`, failures
included, so the list never drifts from the server. German labels live in
the pure `lib/format.ts`. `lib/api.ts` turns every failure into an `ApiError`
with a German message. Dark mode comes from the `light-dark()` tokens in
`app.css`.

## Build and deploy

- CI (`.github/workflows/build-image.yml`): typecheck, then build and push
  `ghcr.io/matthiasharrer/haushalts-todos`, tagged `edge` + `main-<sha>` on
  `main`, and semver + `latest` on `v*` tags.
- Deployment manifests, PVC, ingress and Authelia rules live in the **GitOps
  repo** (Matthias's side). Not set up yet; see roadmap item 4.

## Ports

| | Dev | e2e |
|-|-----|-----|
| API | 3001 | 3201 (built server, serves SPA) |
| Web | 5174 | (served by the API) |
