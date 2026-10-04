# Roadmap

> **What's still open.** This file only holds work that is *not done*. Shipped
> entries move to `roadmap-archive.md` (create it with the first one) rather than
> being ticked off here. Ideas that aren't scheduled live in `ideas.md`; the
> reasoning behind decisions lives in `decisions/`.

_Last updated: 2026-10-04 (trigger tasks, ADR-0010, being built)_

## Next — MVP in real use

The MVP is deployed. **Use it for real** for a few weeks before building
more.

Matthias pulled two features forward (2026-10-04):

1. **Deploy `v0.3.0`** (Matthias): pod egress to `fcm.googleapis.com`
   (HTTPS); then TC-71 on both phones (new one-off reaches the other person).
2. **Trigger tasks for Home Assistant** (ADR-0010, in progress 2026-10-04):
   third task kind "Auslöser", `POST /hooks/<id>` with a per-task token,
   "Wiederkehrend" becomes "Routinen". Deploy: set `HOOK_BASE_URL` to the
   in-cluster service URL; `/hooks` stays behind Authelia at the ingress
   (HA calls in-cluster). Then TC-82 with the real washer.
3. **Follow-up as a trigger source** ("1 Tag nach *Wäsche aufhängen*"), see
   `ideas.md`; then decide on **due times**.

## After the MVP

Decide after a few weeks of real use, guided by what hurts:

- Tune the urgency constants (ADR-0005).
- Per-task history view.
- Anything from `ideas.md` that turns out to be missed.
