# Architecture

_The current picture. The reasoning is in `decisions/`. Last updated:
2026-10-02 (task core API)._

## Overview

```
Phone ──▶ Ingress (Traefik + Authelia ForwardAuth) ──▶ one container
                                                        ├─ Hono API   /api/*
                                                        ├─ built SPA  /*  (index.html fallback)
                                                        └─ SQLite on PVC  /data/haushalt.db

Claude ──▶ Ingress (Authelia-EXEMPT: /mcp, /.well-known) ──▶ same container   [planned, ADR-0006]
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

## Data

Prisma 7, `prisma-client` generator into `apps/api/src/generated/prisma`
(gitignored), better-sqlite3 driver adapter, WAL on at runtime (`src/db.ts`).

Schema: `User`, `Task`, `Completion` (as in `domain-model.md`), with Prisma
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
| GET    | `/api/tasks` | `{ today, sections: { faellig, demnaechst, spaeter, irgendwann } }`, sorted; excludes archived and done one-offs |
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

One screen (`routes/Home.svelte`): the four sections, a fixed quick-add bar at
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
