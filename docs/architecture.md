# Architecture

_The current picture. The reasoning is in `decisions/`. Last updated:
2026-10-02 (walking skeleton)._

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

Current schema: `User` only. The target model (Task, Completion) is in
`domain-model.md`.

## Frontend

Svelte 5 SPA, no router yet (single `Home` route), `lib/api.ts` fetch wrapper,
`app.css` with CSS custom properties. German UI, phone viewport first.

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
