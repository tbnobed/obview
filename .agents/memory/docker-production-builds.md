---
name: Docker production builds
description: Non-obvious dependency and external-asset constraints in the multi-stage production image.
---

The application builder must not rely on dev-dependency inclusion. Keep the required Vite/esbuild/CSS toolchain available as regular dependencies and assert the binaries exist before copying source or compiling.

The runtime schema verification also uses tsx, so tsx must remain a regular dependency unless that verification path is replaced with compiled JavaScript.

**Do not use npm in the builder.** npm 10.8.x and 10.9.x both crash with `Exit handler never called` inside Docker on some hosts, regardless of the npm version pinned. The fix is to use **pnpm 9.15.9 via corepack** with a committed `pnpm-lock.yaml`. The builder runs `pnpm install --frozen-lockfile --prod=false`. A `pnpm-lock.yaml` must be committed alongside `package.json`; generate it with `corepack pnpm@9.15.9 import` from an existing `package-lock.json`.

The Debian bookworm-slim `busybox` package does NOT include the crond applet. Use the `cron` package instead, and install a thin `/usr/local/bin/crond` wrapper (`exec /usr/sbin/cron "$@"`) so the entrypoint's `command -v crond` check succeeds without changes to the entrypoint.

The default `postgresql-client` in Debian bookworm is version 15. If the production PostgreSQL server is version 16, install `postgresql-client-16` from the PGDG apt repo to avoid `pg_dump version mismatch` errors in pre-migration backups. Add the PGDG key and source list before the install step.

For BtbN FFmpeg downloads, use a currently published stable asset with a master-build fallback. Old versioned assets are eventually removed from the upstream `latest` release.

**Why:** npm installer is unreliable in Docker across versions and hosts; pnpm with a frozen lockfile is deterministic. busybox crond is not built into the Debian slim busybox package. pg_dump major version must match the server's PostgreSQL major version or pre-migration backups silently fail.

**How to apply:** After Docker or dependency changes, build the complete final image (`docker build --no-cache`) with production build arguments, then verify inside the resulting image: server bundle, frontend assets, FFmpeg, ffprobe, whisper.cpp, `command -v crond`, and `pg_dump --version`.
