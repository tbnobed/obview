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

## Divergence cuts both ways — DON'T duplicate what `registerRoutes` already does

`registerRoutes(app)` (server/routes.ts) itself calls `setupAuth(app)`, which registers
`express-session` + `passport.initialize()` + `passport.session()`. `index.ts` relies on
that single call. `production.ts` had ALSO called `setupAuth(app)` directly, so prod
stacked the session/passport middleware **twice** on every request.

**Symptom this caused:** users had to sign in twice (prod-only). Two session middlewares
both patch `res.end` and write `Set-Cookie`; on login the second middleware owns
`req.session` (where `regenerate`/`login`/`save` happen) but the first writes a cookie for
the old empty session, so the first login "doesn't take." Fix was to remove the redundant
`setupAuth` call from `production.ts` and let `registerRoutes` be the single source.

**Why:** parity bugs between the two entry files go both directions — prod can be missing
something index.ts has (the trash sweep, upload timeouts) OR can double-apply something
registerRoutes already does. **How to apply:** before adding middleware/auth/session setup
to either entry file, check whether `registerRoutes` already does it.

## SPA catch-all ordering differs: prod registers it BEFORE registerRoutes

In `production.ts` the SPA fallback `app.get('*')` is registered **before**
`registerRoutes(app)` runs, and it only skips `/api/` and `/public/`. In `index.ts`/dev the
SPA fallback is vite's, registered **after** `registerRoutes`. So any route that must win
over the SPA fallback (e.g. a crawler/Open-Graph `<head>` injector on user-facing paths like
`/s/:token`, `/share/:token`) will work in dev but be silently swallowed by the static
`index.html` in prod if it's only registered inside `registerRoutes`.

**How to apply:** mount such "must-run-before-SPA-fallback" routes as a standalone exported
function and call it from BOTH places — in `production.ts` explicitly before its `app.get('*')`,
and in dev's `registerRoutes` path (guarded with `NODE_ENV !== 'production'` to avoid a no-op
double registration in prod). The handler must `next()` for non-crawler/normal browsers so they
still fall through to the SPA shell.

**The share URL itself is a BARE token at the root** (`https://host/<token>`), resolved purely
client-side by `ShareResolverPage` on the wouter `/:token` route — there is NO server route for
it. `/s/:token` and `/share/:token` are internal/canonical paths the client uses, NOT what gets
pasted into Slack. So a crawler OG handler that only matches `/s/` and `/share/` never fires on
real shared links; it must also match `/:token` at the root. Registering `/:token` server-side is
safe **only because** the handler `next()`s for non-crawler UAs and for tokens that don't resolve
to a live share — otherwise it would shadow every single-segment route and marketing page.
