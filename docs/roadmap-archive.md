# Roadmap archive

Shipped roadmap entries, newest first. The reasoning is in `decisions/`, the
test evidence in `testing.md`'s run log.

## 2026-10-02

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
