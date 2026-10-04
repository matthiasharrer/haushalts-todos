# 0009. Push notifications: installable PWA, Web Push, daily digest, per-task reminders

- **Status:** Accepted
- **Date:** 2026-10-04

## Context

Matthias wants Home Assistant to create tasks ("Waschmaschine fertig" →
"Wäsche aufhängen"). That only replaces HA's own notification if the app can
notify too. Push was deferred at bootstrap until the app proved useful
(`ideas.md`); it has, so it comes first, and the HA triggers build on it
(their own ADR).

Both users are on **Android** (Chrome). Web Push works there in the browser
and as an installed app, notification action buttons work too.

Matthias's calls (2026-10-04):

- A **daily digest** of what's due, **switchable off**, at a **time each user
  sets**.
- **Not every task pushes.** "Waschmaschine" yes, "Toiletten putzen" no; it's
  not time-critical. So a per-task flag.
- **Creating a one-off task pushes to everyone who didn't create it.**

## Decision

### PWA shell

`manifest.webmanifest` (`display: standalone`, theme `#2f6f5e`), PNG icons
rasterized from `icon.svg` (192, 512, maskable 512) and a hand-written
`public/sw.js`. The service worker **only** handles `push` and
`notificationclick`. It has **no `fetch` handler and caches nothing**: offline
support isn't asked for, and a caching worker behind Authelia is exactly the
trap rezepte's ADR-0017 spends pages guarding against. Chrome installs a PWA
without a fetch handler. No `vite-plugin-pwa`; there's nothing to precache.

### Web Push plumbing

- **VAPID keys** are generated on first use and stored in the DB (`AppSetting`,
  key `vapid`). No secret to add in GitOps, and they survive restarts. A new
  DB (or lost PVC) means new keys, so every device re-subscribes; that's fine.
- **`PushSubscription`**: one row per device (`endpoint` unique, `p256dh`,
  `auth`, `userId`). Subscribing an endpoint that exists reassigns it to the
  caller (same phone, other person). The push service answering 404/410
  deletes the row.
- Sending goes through one module (`lib/push.ts`) with a swappable transport:
  `web-push` in production, **an append-only JSONL file when `PUSH_OUTBOX` is
  set** (e2e reads it; nothing is sent).
- **Egress:** the pod must reach the push service (`fcm.googleapis.com` etc.)
  over HTTPS.

### Who gets what

All tasks are shared, so pushes go to **every user's devices**, minus the
person who caused them where noted. Three kinds:

1. **New one-off** (Matthias): creating a one-off task (web, MCP) pushes to
   everyone **except the creator**: title "Neue Aufgabe von <Name>", body the
   task title. Recurring chores don't push on create (they're set up rarely,
   and usually together).
2. **Due now** (per-task flag `notify`, UI "Benachrichtigen, wenn fällig",
   default off): when a task with `notify` becomes due **today** through a
   create or edit (or later an HA trigger), push immediately to everyone
   except the actor. Title = the task title, body "Jetzt fällig". Recorded in
   `Task.notifiedFor = dueDate`, so the same due date never pushes twice. An
   update only qualifies when it moved `dueDate` or turned `notify` on, so
   resaving the sheet never pushes. A one-off with `notify` due today gets this
   push instead of the "new" one (one push, not two). A task becomes due
   with time passing (recurring chore's date arrives) → pushed at each
   user's time, see below.
3. **Daily, at the user's time** (`User.notifyTime`, default `08:00`,
   Europe/Berlin). Once per day per user (`User.notifyRunOn`); if the server
   was down at that time, it runs on the next tick that day.
   - Digest **on** (`User.digestEnabled`, default on): one push "3 Aufgaben
     fällig" listing the titles of the *Fällig* section in its order (up to 5,
     then "und 2 weitere"). Nothing due → no push. It covers `notify` tasks
     due today, so they don't push separately.
   - Digest **off**: one push per `notify` task with `dueDate` = today that
     hasn't already had its immediate push (`notifiedFor`). Nothing else. The
     daily run does **not** set `notifiedFor` (each user runs at their own
     time; `notifyRunOn` already limits each to once a day).
   - Changing `notifyTime` re-arms today's run, so a changed time can bring a
     second digest that day. Cheap, and it doubles as "it works".

A tick runs every minute (`PUSH_TICK_MS` overrides it for e2e). Single
replica, so no locking. The planning step is a pure function
(`planDaily(now, users, tasks)`), unit-tested.

Pushes carry `tag` (`digest`, `task-<id>`) so a newer one replaces an older
one instead of stacking, and `data.url` (`/`). Tapping focuses an open app
window or opens one.

### Settings

"Benachrichtigungen" card:
- **Auf diesem Gerät:** on/off (asks for permission, subscribes or
  unsubscribes this device), plus "Test senden".
- **Tägliche Übersicht:** switch, **Uhrzeit:** time input. Per user, valid on
  all their devices.

### API

- `GET /api/push/config` → `{ publicKey }`
- `POST /api/push/subscriptions` `{ endpoint, keys: { p256dh, auth } }`,
  `DELETE /api/push/subscriptions` `{ endpoint }`
- `POST /api/push/test` `{ endpoint }` → to that device of the caller
- `GET /api/me` gains `{ digestEnabled, notifyTime }`; `PATCH /api/me`
  sets them (`notifyTime` `HH:MM`, 00:00–23:59)
- Task DTO, create, update, MCP `add_task`/`update_task`/`get_task`: `notify`
  boolean.

## Consequences

- Push is best effort: no retries, no delivery tracking. A failed send is
  logged; a dead subscription is removed.
- A pushed notification opens the app at home, not the task. A deep link to
  the sheet can come later.
- Anything "time-critical" is the `notify` flag; urgency (ADR-0005) is
  unchanged by it.
- Notification action buttons ("Erledigt" right in the notification) are
  possible on Android but need the service worker to call the API through
  Authelia; left for later (`ideas.md`).

## Alternatives considered

- **Push through Home Assistant's companion app** (the app calls HA to
  notify): no Web Push to build, but it couples the app to HA and is no help
  when HA isn't the one who knows.
- **One push per due task every morning**: noisy for things like "Toiletten
  putzen"; that's the case Matthias ruled out.
- **VAPID keys as env secrets:** a GitOps step for no gain in a single-replica
  app whose DB is already the thing to protect.
- **`vite-plugin-pwa` / an offline-capable worker** (as in rezepte): nothing
  to precache that's asked for, and it brings the Authelia caching risk.
