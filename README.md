# Haushalt

Household to-do app for two. Hono + Prisma/SQLite API (`apps/api`), Svelte 5 SPA (`apps/web`).
Auth is Authelia ForwardAuth at the ingress; the API upserts a `User` from the `Remote-*` headers.

```bash
npm install
npm run db:migrate          # creates apps/api/prisma/dev.db (copy apps/api/.env.example to apps/api/.env first)
scripts/app.sh start        # api :3001, web :5174
npm run e2e                 # Playwright, built server on :3201
```

Production: one container (`Dockerfile`), DB at `file:/data/haushalt.db`.
