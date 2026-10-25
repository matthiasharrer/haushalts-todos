# 0014. Distroless runtime image, entrypoint in Node

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

The cluster's Trivy Operator reported, for `0.8.0`: 4 Critical, 21 High,
37 Medium, 132 Unknown. Almost none of that was our code. It came from the
`node:22-slim` base: perl-base (3 Critical, `deb12u3`), npm and its bundled
packages (pacote, sigstore, brace-expansion, ip-address, …; about 10 High),
gzip, ncurses, coreutils. The app never runs any of them. perl-base is
essential in Debian, so it can't be removed from a Debian image.

The only reason the image needed a shell and npm was `docker-entrypoint.sh`
(snapshot via `npx prisma db execute`, `npx prisma migrate deploy`).

## Decision

- Runtime stage on **`gcr.io/distroless/nodejs22-debian12`**: Node, glibc,
  libstdc++, OpenSSL, CA certs, tzdata. No shell, apt, npm or perl.
- Production `node_modules` are installed in a separate `node:22-bookworm-slim`
  stage (with openssl, so Prisma fetches the `debian-openssl-3.0.x` schema
  engine, and a toolchain for better-sqlite3) and copied in. All Debian stages
  are pinned to **bookworm** to match debian12's glibc/OpenSSL.
- **`docker-entrypoint.mjs`** replaces the shell script, same behaviour:
  - snapshot with `VACUUM INTO` through better-sqlite3 (already a dependency),
    keep the 5 newest, fail closed when the snapshot fails;
  - skip the snapshot when a failed migration is recorded: now read straight
    from `_prisma_migrations` (`finished_at IS NULL AND rolled_back_at IS
    NULL`, what Prisma calls failed) instead of grepping `migrate status`,
    which saves a CLI start per boot;
  - `prisma migrate deploy` via `node node_modules/prisma/build/index.js`;
  - then `import()` the server in the same process, so node stays PID 1 and
    gets SIGTERM (what `exec node` did).
- Runs as **UID 1000** (the old `node` user), not distroless's `nonroot`
  (65532), because the PVC data is owned by 1000. `HOME=/tmp` (Prisma calls
  `os.homedir()`, which throws without a passwd entry), and
  `PRISMA_SCHEMA_ENGINE_BINARY` points straight at the engine.
- CI builds with `pull: true`, so every build resolves the base images afresh.
- zod raised to 4.6.7 (High in 4.6.5), one deduped copy.

## Consequences

- Expected after the switch: the Debian and npm findings are gone; what stays
  is zlib/glibc/OpenSSL in distroless, Node itself, and npm packages under the
  Prisma CLI (mysql2, deepmerge-ts), which only a Prisma upgrade fixes.
  Check the Trivy report for the new tag (TC-106).
- **No shell in the pod.** `kubectl exec … sh` no longer works; use
  `kubectl debug -it <pod> --image=busybox --target=<container>` for an
  ephemeral debug container. Restoring a snapshot means copying files on the
  PVC, so do it from a debug container or a throwaway pod mounting the PVC.
- The image can't be built in the workspace; the entrypoint was tested by
  running it with an empty environment (no PATH) against a copy of the dev DB:
  snapshot + retention, first deploy, recorded failed migration (no snapshot,
  P3009, exit 1), unwritable backup dir (fail closed), SIGTERM.
- rezepte and xitl-mcp share this Dockerfile pattern; port it there once this
  runs in production.

## Alternatives considered

- **Stay on `node:22-slim`, delete npm.** Removes the npm findings, keeps
  perl, gzip, ncurses and the rest.
- **Alpine.** musl; Prisma's engine and better-sqlite3 would need other
  builds. The project deliberately stays on glibc.
- **Chainguard `cgr.dev/chainguard/node`.** Even smaller, but only `latest` is
  free; pinned versions cost money.
