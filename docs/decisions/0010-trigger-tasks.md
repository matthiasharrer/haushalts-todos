# 0010. Trigger tasks: a task that becomes due when Home Assistant fires it

- **Status:** Accepted. Amends ADR-0006 (a narrow token that isn't an MCP bearer) and ADR-0007 (the "Wiederkehrend" view becomes "Routinen").
- **Date:** 2026-10-04

## Context

Home Assistant knows when the washer or dryer is done (smart plugs) and today
sends its own "fertig" notification. Matthias wants that in the task app
instead: "Waschmaschine fertig" → "Wäsche aufhängen" is due, and both phones
get a push (ADR-0009).

How it was shaped (2026-10-04):

- HA runs **in the same cluster**, so it can call the app over the cluster
  network and nothing has to be exempted from Authelia. HA's `rest_command`
  calls any URL with headers and JSON.
- Calling `/api/tasks` with a forged `Remote-User` would work with no code,
  but makes the network the only credential and leaves duplicates unsolved.
  Matthias wants it **explicit, with a token managed in the app, and
  configurable duplicate handling**.
- A token for the whole API would be the static bearer ADR-0006 rules out.
  **One token per trigger** can only ever fire that one predefined task.
- Matthias agreed to **fold triggers into the task model** next to recurring
  chores, with one shared list, instead of separate "trigger templates".

## Decision

### A third kind of task: *Auf Auslöser*

A task is **one-off**, **recurring** (ADR-0004) or **trigger**. Like a
recurring chore it's **one row forever** that comes and goes. It never
generates copies, so a second fire can never create a duplicate.

| State | `dueDate` | Where it shows |
| --- | --- | --- |
| **waiting** | `null` | only in *Routinen* ("wartet") |
| **fired** | the day it fired | home, like any task due that day (*Fällig*) |

- **Fire** (`POST /hooks/<id>`): a waiting task gets `dueDate = today`,
  `firedAt = now`, and, with `notify` on, the "due now" push (ADR-0009) to
  **everyone** (there's no acting user to leave out). Title = the task title,
  body "Jetzt fällig", tag `task-<id>`.
- **Fire while already fired:** the date stays (it's been waiting since
  then, so urgency keeps growing), `firedAt` moves. What else happens is the
  task's **refire** setting:
  - `PUSH` (default, "Erneut benachrichtigen"): push again, if `notify` is on.
    The notification carries `renotify`, so the phone alerts again despite
    the same tag.
  - `NONE` ("Nichts tun"): nothing.
- **Complete or skip** (existing endpoints): a `Completion` is logged as
  always (`dueDateBefore` = the fired date) and the task goes back to
  **waiting** (`dueDate = null`). Never `doneAt`. Undo restores the fired date.
- A trigger task is never in *Irgendwann*: home and the daily digest only see
  it while fired.
- `recurrence` and `trigger` are mutually exclusive (400).
- **Changing kind** in the sheet:
  - to *trigger*: recurrence cleared, `dueDate = null` (waiting);
  - away from *trigger*: the token is dropped. To one-off: the date is kept
    (null → *Irgendwann*). To recurring: the existing rule applies (today if
    null).
- Creating a trigger task, or switching a task to *trigger*, always leaves it
  **waiting**; a `dueDate` sent along is ignored. Completing or skipping a
  waiting one is a 400 (nothing to do yet).
- The sheet hides the date for trigger tasks. A later `PATCH` with a date
  isn't forbidden: the task then simply counts as fired (no push of its own
  beyond ADR-0009's due-now rule).

### Token and endpoint

- **`POST /hooks/<taskId>`** with `Authorization: Bearer <token>`, no body.
  - Mounted **outside `/api`**, so it needs no `Remote-User`.
  - **Not exempted at the ingress:** from outside, Authelia stands in front
    of it. HA reaches it in-cluster
    (`http://<service>.<namespace>.svc.cluster.local/hooks/<id>`). If HA ever
    moves out of the cluster, exempting `/hooks/*` is a GitOps change, and the
    token already covers it.
  - Responses:
    - `200 { taskId, result: 'fired' | 'repushed' | 'ignored' }`;
    - `401` for a missing or wrong token, an unknown or archived task, or a
      task that isn't a trigger. One answer, so the endpoint doesn't reveal
      which ids exist.
- **Token:** 32 random bytes, base64url, prefixed `hh_`.
  - Stored only as a **SHA-256 hash** (`Task.hookTokenHash`). The token is
    high-entropy, so no slow hash is needed. Compared in constant time.
  - **Shown once**, when it's generated, together with a ready-to-paste HA
    snippet.
  - **"Neuen Token erzeugen"** replaces it, and the old one stops working at
    once.
- `POST /api/tasks/:id/hook-token` (behind Authelia like all of `/api`) →
  `{ token, url }`: generate or replace. 400 if the task isn't a trigger.
- **Snippet URL:** `HOOK_BASE_URL` (set in GitOps to the in-cluster service
  URL), falling back to the request's external origin.

### Data

`Task` gains:
- `triggerRefire` (`PUSH` | `NONE`, null = not a trigger task; it *is* the kind
  marker);
- `hookTokenHash` (nullable);
- `firedAt` (nullable).

DTO, create and update gain
`trigger: { refire, hasToken, firedAt } | null`. Clients send `{ refire }`;
`hasToken` and `firedAt` are read-only.

### UI

- **Tab "Routinen"** (was "Wiederkehrend", hash `#/routinen`, the old hash
  still works). Two groups:
  - **Wiederkehrend:** as before;
  - **Auf Auslöser:** fired first, then waiting. Each row says "wartet" or
    "ausgelöst heute 14:32", plus "zuletzt … · Name".
- **Sheet:** the "Wiederholung" switch becomes a three-way choice
  **Einmalig · Wiederkehrend · Auslöser**.
  - *Auslöser* hides the date and shows "Wenn schon fällig: Erneut
    benachrichtigen · Nichts tun".
  - Choosing *Auslöser* on a new task turns "Benachrichtigen" on (it can be
    turned off).
  - An existing trigger task shows a "Home Assistant" block: "Token aktiv"
    or "Kein Token", and a button "Token erzeugen" / "Neuen Token erzeugen"
    (the second asks first).
  - After generating, a dialog shows the URL and a `rest_command` YAML
    snippet with a copy button, and says it won't be shown again.
  - Saving a **new** trigger task generates the token right away and opens
    that dialog.
- Home: a fired trigger task looks like any due task, with a small bolt icon.
  Quick-add stays one-off only.

### MCP

- `add_task` / `update_task` accept `trigger: { refire }` (or null to turn it
  off).
- `list_recurring` also lists trigger tasks, with "Auslöser · wartet" or
  "ausgelöst …".
- The **token is never handed out over MCP**: it's a secret meant for HA, and
  the web sheet is the one place it's shown.

## Consequences

- HA config per trigger is one `rest_command` (or one shared one with the id
  and token as variables) and one automation step.
- Push to "everyone" includes whoever is standing next to the washer. That's
  accepted: HA doesn't know who's home.
- A leaked token can only make "Wäsche aufhängen" due and push it. It's
  revoked by generating a new one or by archiving the task.
- *Irgendwann* semantics are unchanged for one-offs. Every place that reads
  `dueDate = null` as "undated one-off" must also check the kind; that's
  `listTasks` today.

## Not now (`ideas.md`)

- **Second trigger source "after task X + delay"**: "Wäsche abhängen", 1 day
  after "Wäsche aufhängen" is done. It replaces the old follow-up-task idea,
  without its generated-instances problem.
- **Due times** (Matthias wants them). That makes "24 h later" exact.
- HA passing data (title or note suffix), HA completing a task, a read
  endpoint for an HA sensor.

## Alternatives considered

- **Forged `Remote-User` over the cluster network:** no code, but every pod
  that can reach the app can act as anyone, and duplicates aren't handled.
- **One API token in Settings:** a credential for everything, no user behind
  it. That's ADR-0006's rejected static bearer.
- **Separate trigger templates that spawn one-off tasks:** needs duplicate
  rules by title and a second list to manage. The task model already has
  "one row that comes and goes".
- **Token in the URL path:** simpler to paste, but it ends up in access logs.
  A header is no extra work in HA.
