# Test plan

> Fixed cases with fixed expectations, so "I tested it" means the same thing
> every time. **This process is binding.** Cases are written from what a
> feature *should* do; a script is one way of running a case.
>
> _Last updated: 2026-10-02_

## Running

```bash
npm run e2e                                    # build, boot :3201 on .e2e/e2e.db, run, tear down
PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright npm run e2e   # if browsers are "missing"
npm --workspace @haushalt/api run test:unit    # pure logic (from slice 2 on)
```

## The process

Every change passes three gates:

1. **Feature cases.** A feature ships with its cases in this file, scripted
   wherever deterministic, and they pass.
2. **Full suite.** `npm run e2e` is green before every commit that touches code.
3. **Eyes on it.** UI changes get looked at in a real browser on a 390×844
   viewport (Playwright MCP) before desktop.

The case author is the lead. The runner is never the agent that implemented the
feature.

## Cases

### Identity (ADR-0003)

| ID    | Case | How |
| ----- | ---- | --- |
| TC-01 | `GET /api/health` answers 200 without any `Remote-*` header. | scripted |
| TC-02 | `GET /api/me` without `Remote-User` → 401 JSON. | scripted |
| TC-03 | With `Remote-User` + `Remote-Name`, `/api/me` returns the user; a changed `Remote-Name` on the next request is stored. | scripted |
| TC-04 | A second `Remote-User` (`anna`) gets its own `User` row; the first is unchanged. | scripted |
| TC-05 | At 390×844 the page loads and greets the user by display name ("Hallo, …"), German UI. | scripted |

## Run log

| Date | Scope | Result |
| ---- | ----- | ------ |
| 2026-10-02 | Skeleton: TC-01…05, full suite | **5/5 pass** (6.1 s), lead run before the first commit |
