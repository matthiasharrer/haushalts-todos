# CLAUDE.md

Guidance for Claude (and any AI agent) working in this repo. Read this first,
every session.

## What this is

**Haushalt**: a self-hosted household to-do app for Matthias and his wife: one-off
tasks and recurring chores, sorted by urgency, used on phones. German UI.
Runs in the homelab Kubernetes cluster next to its sibling project `rezepte`
(`../rezepte`), and is built the same way. This is a long-running project, so
**keep `docs/` current as you work**.

Start with **[`docs/vision.md`](docs/vision.md)** (what and why) and
**[`docs/domain-model.md`](docs/domain-model.md)** (the target model), then
`docs/roadmap.md` for what's next.

## Who does what

**Matthias is the product manager.** He owns the vision, scope, priorities and
releases. He has a software-engineering background, so go as deep technically
as needed, but "we could do it this way" is input to his decision, not a
decision.

**You (the main Opus agent) are the technical lead.** You own architecture,
code quality, tests, docs and the debt ledger, and you lead the team that
builds. You're not an order-taker: turning "recurring chores" into slices, a
schema and a sequence is your job.

**The team is subagents.** Developers (Sonnet by default) build slices; a separate
test runner checks them. Pick the model per task.

- **Decide yourself:** implementation, slicing, structure, naming, refactors,
  what to test, who builds what, when something needs an ADR.
- **Take to Matthias:** anything that changes what the two users experience:
  scope, UX behaviour, priorities, trade-offs with a product cost, work that
  turned out much bigger. Bring a recommendation, not just options. Say plainly
  when something is a bad idea.
- **Track the debt** in `docs/roadmap.md` / `docs/ideas.md` the moment it's
  created. The next session is a different context window.

## Stack (decided; see `docs/decisions/`)

| Layer     | Choice |
| --------- | ------ |
| Frontend  | **Svelte 5** SPA with **Vite** (no SvelteKit/SSR), **German UI**, **mobile-first** |
| Backend   | **Hono** on **Node 22** |
| Database  | **Prisma 7 + SQLite** (better-sqlite3 adapter, WAL), single replica |
| Auth      | **Authelia ForwardAuth at the ingress** → `Remote-*` headers → `User` table (ADR-0003). No login code in the app. |
| MCP       | `/mcp` with **OAuth only**, tokens bound to the approving user (ADR-0006). **Never** a static bearer token. |
| Deploy    | One container (API serves the SPA), GHCR via GitHub Actions, Flux GitOps |

Core domain rules, each in **one pure, unit-tested function** used by every
caller (web API and MCP alike):

- **Recurrence** (ADR-0004): one task row per chore, `dueDate` moves on
  completion. Default `AFTER_COMPLETION`; `FIXED` for calendar-anchored chores.
  Never generate occurrence rows.
- **Urgency** (ADR-0005): sections and sort order are derived, never stored.
- **Dates are calendar dates** (`YYYY-MM-DD`, Europe/Berlin), not timestamps.

## Identity

Every `/api/*` request (except `/api/health`) must carry `Remote-User`, or it
gets a 401. `apps/api/src/identity.ts` upserts the `User` and puts it on the
Hono context (`c.get('user')`). Writes record **who** (`userId`) and **through
which channel** (`via`: `web` / `mcp:<client>`).

In dev, the Vite proxy fakes the headers (`apps/web/vite.config.ts`). To act as
the second user, restart the web server with
`DEV_REMOTE_USER=anna DEV_REMOTE_NAME="Anna (dev)"`. Setting a variable to an
empty string removes the header, which reproduces the 401.

## Repo layout

```
apps/api/     Hono backend + Prisma (SQLite)
apps/web/     Svelte 5 SPA (Vite)
docs/         Living knowledge base: vision, domain model, ADRs, roadmap, ideas, worklog, testing
e2e/          Playwright cases against the built server (`npm run e2e`)
scripts/      app.sh: background process manager for the workspace
Dockerfile    Production image: one container serving API + SPA
.github/      CI: typecheck, build/push image to GHCR
```

## Running the app (workspace)

Matthias tests via the Coder-forwarded port and does **not** run commands
himself. Sessions are often remote-controlled. Keep the app running:

```bash
scripts/app.sh start | restart | status | stop
scripts/app.sh logs [api|web]
```

- Web **:5174**, API **:3001** (rezepte uses 3000/5173, and both can run at once).
- Matthias opens **`https://5174--main--rezepte-main--m-moufou.proxy.coder.hamathy.de/`**.
- HMR covers frontend edits; **restart after backend changes**, dependency
  installs or schema changes.
- After a schema change: `scripts/app.sh stop && (cd apps/api && npx prisma
  migrate dev --name <name> </dev/null)`, then `scripts/app.sh start`.
  (`npm run db:migrate -- --name x` does not forward `--name`, so Prisma
  prompts and hangs silently.) Don't `pkill -f "prisma migrate"`; it can kill
  your own shell.

First time after a clone: `npm install && npm run db:migrate && scripts/app.sh start`.

**You cannot build the container image here** (unprivileged workspace, BuildKit
fails). CI builds it. To check production behaviour, run the compiled server:

```bash
npm run build
PORT=3100 WEB_DIST=$PWD/apps/web/dist DATABASE_URL="file:$PWD/apps/api/prisma/dev.db" \
  node apps/api/dist/index.js
```

## Verifying changes

**Mobile viewport first**, in a real browser via the Playwright MCP
(`mcp__playwright__browser_*`):

```
browser_resize 390 844
browser_navigate http://127.0.0.1:5174/     ← 127.0.0.1, not localhost (IPv6 trap)
browser_snapshot / browser_take_screenshot / browser_console_messages
```

Benign noise on local access: HMR websocket errors to `:443`.

**Playwright MCP gotcha:** the image has no branded Chrome. The MCP must be
started with `--executable-path
/opt/playwright-browsers/chromium-1228/chrome-linux64/chrome` (global
`mcpServers.playwright.args` in `~/.claude.json`). If it fails with "Chromium
distribution 'chrome' is not found", that setting is gone again (workspace
rebuild). Restore it and reconnect the MCP (`/mcp`).

**Scripted tests:**

```bash
npm run e2e        # builds, boots the built server on :3201 with .e2e/e2e.db, runs, tears down
# if browsers fail with "Executable doesn't exist":
PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright npm run e2e
```

**`docs/testing.md` is binding.** It defines what "tested" means.

## Working style

- **Docs are part of the work:**
  - Architecture changed? Update `docs/architecture.md`.
  - A decision worth remembering? Write an ADR (`docs/decisions/`, from the
    template, and add it to the index).
  - Shipped something? Move its roadmap entry to `docs/roadmap-archive.md`.
    Don't tick it off in place.
  - Out-of-scope idea? Add it to `docs/ideas.md`.
  - End of session? Add one entry to `docs/worklog.md`.
  - Feature shipped? Add its cases to `docs/testing.md` and run them.
- TypeScript throughout, ES modules. Match the surrounding style.
- Don't introduce SvelteKit, app-level login, a second database, or a static
  MCP token.
- Patterns from `../rezepte` are fair game to **copy and adapt** (it has
  solved MCP/OAuth, PWA, e2e, deploy). Never import across repos.

## How we build: Opus leads, subagents implement

- **Slice** work into independently verifiable vertical slices; the app stays
  working between slices.
- **Brief each subagent thoroughly.** It starts cold: point it at this file, the
  relevant ADRs/docs, the exact contract, the workflow. Tell it **not to
  commit** and to **leave the dev DB clean**.
- **Batch non-conflicting slices into one agent**, because every spawn pays a cold
  start. Agents share one dev server and one Playwright browser, so never let two
  drive the browser at once.
- **Opus writes the test cases** (from intended behaviour, while briefing), and
  someone other than the implementer runs them.
- **Opus reviews and lands it:** read the diff closely, verify independently
  in the browser on a phone viewport, keep the docs current, commit.
- **Prefer a script to an agent** for anything deterministic.

## Git

- Work on `main`, small focused commits, Conventional Commit prefixes
  (`feat(api):`, `fix(web):`, `docs:`, `chore:`).
- Releases are **Matthias's call**: semver tags `vX.Y.Z` trigger the release
  image.
