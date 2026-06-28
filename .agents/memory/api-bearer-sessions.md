---
name: API bearer auth & panel sessions
description: How the /api/v1 bearer auth, multi-session model, and the deliberate no-rate-limit decision work for the Premiere panel.
---

# API bearer auth & panel sessions

## Two bearer paths, checked in order
`apiAuth` (server/auth.ts) accepts a session cookie OR `Authorization: Bearer`. The bearer path resolves the user by **session token first** (`api_sessions` table), then falls back to the **legacy personal token** (`users.api_token`, single per user). Both store only a SHA-256 hash; plaintext is never persisted.

## Multi-session model (shared workstations)
`api_sessions` (userId FK cascade, tokenHash UNIQUE) exists so editors on **shared** workstations sign into the panel with their normal Obviu account (username/email + password) instead of pasting a per-user token. Each `/api/v1/login` mints an **independent** token; `/api/v1/logout` revokes **only** the presented bearer token. So one station signing in/out never logs out another.

**Why:** personal-token paste meant a shared machine leaked one user's long-lived token to everyone; per-login sessions isolate machines.

**How to apply:** any new "log everyone out" / token-rotation feature must operate per-session row, not on a single column. Don't reintroduce a one-token-per-user assumption.

## No rate limiting on credential login — deliberate
Neither the primary web login (`/api/login`, passport) nor `/api/v1/login` has rate limiting. The app only rate-limits **anonymous/public** endpoints (public comments in routes.ts, share-link unlock in share-links.ts).

**Why:** adding a limiter to `/api/v1/login` alone is theater — the identical-exposure `/api/login` stays open, so an attacker just targets that. Closing it properly means limiting the shared credential path app-wide, which is a separate, unrequested security project.

**How to apply:** if asked to harden auth brute-force, do it once at the shared login layer covering BOTH endpoints, not piecemeal on v1.

## Dev vs prod schema apply
`api_sessions` added via idempotent `migrations/0035_add_api_sessions.sql` (prod entrypoint hashes/applies `migrations/*.sql`). Dev DB table applied **directly via psql**, NOT `db:push` — `db:push` false-positive-drops the `session` table (see gotchas).
