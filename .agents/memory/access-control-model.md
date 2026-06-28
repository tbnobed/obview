---
name: Open read-access model
description: Why authenticated reads are intentionally ungated by project membership in this app.
---

# Read access is open to ANY authenticated user; only writes are gated

`hasProjectAccess` (server/routes.ts) checks only: authenticated + project exists (404 on bad id). It does NOT check project membership. Same for file reads — read access mirrors `hasProjectAccess`. Edit/mutation paths use `userHasProjectEditAccess` / `hasProjectEditAccess` (admin OR project editor/admin OR site-editor in a global folder).

List endpoints are tighter than by-id reads: `GET /api/projects` (and `/api/v1/projects`) filter to the caller's own projects (`getProjectsByUser`), but `GET /api/projects/:id` and the `/api/v1` file/comment endpoints return any existing resource to any authenticated user. This asymmetry is intentional and consistent across the app.

**Why:** ~50-user internal collaboration tool; the product treats authenticated reads as shared-workspace reads. Adding per-resource membership gates on read paths would diverge from the web app's behavior and break legitimate cross-project review.

**How to apply:** When adding new read endpoints (e.g. the `/api/v1` Premiere panel API), gate on authentication only and mirror existing read routes. Do NOT add membership checks to reads just because a generic review flags "IDOR" — that is a false positive here. Gate writes with the edit-access helpers.
