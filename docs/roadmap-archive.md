# Roadmap archive

Shipped roadmap entries, newest first. The reasoning is in `decisions/`, the
test evidence in `testing.md`'s run log.

## 2026-10-08

- **Deployed through `v0.6.0`** (Matthias): `HOOK_BASE_URL` set, the app works
  for Tina, push works on Matthias's phone, and the HA `rest_command` fired a
  trigger task with a push (run by hand in HA, not yet from the real
  automation).

- **Follow-ups (ADR-0011), `v0.6.0`.** A trigger task can follow another task: N hours
  (1–720) after it's done, it fires like an HA trigger (due, push). For the
  laundry chain "Wäsche aufhängen" → 24 h → "Wäsche aufräumen". The delay is in
  hours, not days: days on calendar dates would make it due about 9 h after
  hanging laundry up at 22:00. TC-87…95.

- **Readable notes, `v0.5.0`.** Notes were only visible in a 2-line textarea
  inside the edit sheet, links not clickable (Matthias, on an LLM-written
  task with shop links). Now: a note icon in the list row; the sheet shows
  notes as full text with clickable links (label = host + path, query and
  fragment hidden; `href` unchanged) and a pencil to edit; the textarea grows
  with its content. Plain text only, no Markdown, no `{@html}`. TC-83…86.

## 2026-10-05

- **Header title goes home, `v0.4.1`.** Tapping "Haushalt" in the app bar
  opens Aufgaben from any view (Matthias's request). `/` without a hash
  already landed on Aufgaben, so the default needed no change. TC-37 extended.

## 2026-10-04

- **Trigger tasks for Home Assistant (ADR-0010), `v0.4.0`.** Third task kind
  "Auslöser": one row, waiting until `POST /hooks/<id>` (per-task token,
  hashed, shown once) makes it due and pushes to everyone; refire setting per
  task; "Wiederkehrend" became "Routinen". Also in this release: the test push
  reports why it failed (502 + German reason). TC-72…81; TC-82 (real HA) by
  Matthias. Push egress in prod opened by Matthias the same day; TC-71 he
  tests with Tina and reports bugs separately.
- **Push notifications (ADR-0009), `v0.3.0`.** Installable PWA with a
  push-only service worker, Web Push (VAPID keys in the DB), per-device
  subscriptions, daily digest at a per-user time, `notify` flag per task,
  push to the others on a new one-off. TC-58…71 (TC-71 by hand on Android,
  pending). Pulled forward by Matthias as the base for Home Assistant
  triggers.
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
