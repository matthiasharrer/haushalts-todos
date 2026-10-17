# 0013. Fresh list: refetch on return to the foreground, poll every 30 s while visible

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

Matthias (2026-10-17): opening the installed app showed an old list; tasks the
other person (or MCP, a trigger) had changed didn't appear. The SPA fetched
only on mount and after its own mutations, and an installed PWA stays alive in
the background for days, so "opening" it usually doesn't remount anything.
(ADR-0012 solves the same thing for new builds.)

## Decision

`watchForChanges()` in `lib/store.svelte.ts`, called once from `main.ts`:

- On `visibilitychange` → `visible`, bump `shared.version`, so the mounted
  view (Aufgaben or Routinen) refetches.
- While the page is visible, bump it every **30 s**; the timer stops while
  hidden (no requests from a backgrounded phone).

A background refetch can overlap a mutation's own refetch, so `refresh()` in
both views keeps only the response of the latest request; an older one
landing last would put back the state from before the change.

## Consequences

- One small `GET` per 30 s per open, visible device. Two users: negligible.
- Changes by the other person show within 30 s while open, immediately when
  switching back to the app.
- A failing poll (offline, expired Authelia session) shows the usual error
  line above the still-visible list until the next successful one.
- Settings doesn't take part (nothing there changes from elsewhere).

## Alternatives considered

- **Server push (SSE/WebSocket) on every change:** truly live, but a new
  long-lived connection through Authelia/ingress, reconnect logic and a change
  feed in the API. Not worth it for two people; revisit if 30 s ever feels slow
  (ideas.md).
- **Refetch only on foreground, no poll:** misses the case of both having the
  app open at once.
- **Refetch on a Web Push message (service worker → page):** only covers
  changes that push; foreground + poll covers all of them.
