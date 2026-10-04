# Roadmap archive

Shipped roadmap entries, newest first. The reasoning is in `decisions/`, the
test evidence in `testing.md`'s run log.

## 2026-10-04

- **Seasonal chores (ADR-0008), `v0.2.0`.** Month window per recurring chore,
  resting chores in Wiederkehrend, season change recomputes a resting date.
  TC-50…57. (Matthias's request, not a planned roadmap item.) Deployed by
  Matthias on 2026-10-04.
- **4. First deploy** of `v0.1.0` (Matthias, GitOps repo): deployment,
  PVC `/data`, `MCP_TOKEN` secret, ingress with Authelia except `/mcp` and
  `/.well-known/`.
- **MCP against the real ingress.** Matthias connected claude.ai: OAuth flow
  and read tools work (TC-44 for real). A write through the real connector
  (TC-45 attribution) wasn't tried; it's covered by the e2e suite.

## 2026-10-02

- **5. MCP server (ADR-0006).** OAuth only, tokens bound to the approving user,
  10 German-described tools over the task service, settings page with my
  clients. TC-42…49. Real-connector round trip pending the deploy.
- **Home vs. Wiederkehrend (ADR-0007).** Matthias's first feedback: recurring
  chores as templates in their own tab, home = actionable list (Fällig ·
  Irgendwann · Demnächst · Später, Später one-offs only). TC-36…41.
- **3. Task list (web).** Sections, quick-add, tick off + undo toast, edit
  sheet (priority, due date, recurrence, skip, "Erledigt am…", delete), German
  labels, dark mode. TC-26…35.
- **2. Task core (API).** `Task` + `Completion`, pure `nextDueDate` /
  sections / urgency, service layer `lib/tasks.ts`, REST endpoints. TC-06…25.
- **1. Walking skeleton.** Monorepo, Hono + Prisma/SQLite, Svelte SPA,
  Authelia identity → `User`, app.sh, Dockerfile, CI, e2e. TC-01…05.
