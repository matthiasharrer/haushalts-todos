# Roadmap archive

Shipped roadmap entries, newest first. The reasoning is in `decisions/`, the
test evidence in `testing.md`'s run log.

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
