---
name: Production entry point divergence
description: Prod runs server/production.ts (dist/production.js), NOT server/index.ts — background loops added to index.ts silently never run in prod.
---

# Production runs `production.ts`, not `index.ts`

The Dockerfile `CMD` is `node dist/production.js`, built from `server/production.ts`.
The container's entrypoint (`scripts/docker-entrypoint.sh`) computes a `SERVER_ENTRY`
variable pointing at `dist/index.js`, but then runs `exec "$@"` — which is the CMD —
so `SERVER_ENTRY` is **ignored**. The dev workflow (`npm run dev`) uses `server/index.ts`.

**The trap:** `server/index.ts` and `server/production.ts` are two separate Express
bootstraps. Any background job / scheduler / `setInterval` / startup hook added to
`index.ts` runs in dev only and **silently never executes in production**.

**Why this matters (real incident):** the hourly trash auto-purge sweep (hard-deletes
soft-deleted files past `FILE_TRASH_RETENTION_DAYS`, default 7) was added only to
`index.ts`. In prod it never ran, so trash piled up for weeks (files 10–23 days old
still on disk) and was a major contributor to the root-disk-full outage. Diagnosis tell:
`docker compose logs app | grep "serving on port"` returned **0** matches even with no
log rotation — because that log line lives in `index.ts`, which prod doesn't run.
`production.ts` logs `🚀 Production server running on port ...` instead.

**How to apply:** when adding ANY server-side background loop, scheduler, or startup
hook, add it to BOTH `server/index.ts` and `server/production.ts` (inside
`production.ts`'s `server.listen` callback) and keep them mirrored. To verify a feature
is actually live in prod, grep the running bundle for it: `docker compose exec app sh -c
"grep -c 'YOUR_MARKER' dist/production.js"` — grepping `dist/index.js` is misleading
because that file is built but never executed.
