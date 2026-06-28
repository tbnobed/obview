---
name: Premiere panel /api/v1 write API
description: Design constraints/divergences of the bearer-authed /api/v1 surface used by the Premiere UXP panel.
---

# Premiere panel /api/v1 write API

The panel's external API lives under `/api/v1/*`, authed by `apiAuth` (session
cookie OR `Authorization: Bearer <api_session token>`). Reads are deliberately
**open to any authenticated user** (same as the web app) — do not "fix" this as
IDOR. Writes mirror the web routes' authz exactly.

## Divergence to remember
- **v1 approve omits the uploader email side-effect.** The web
  `POST /api/files/:fileId/approve` sends a directed-review SendGrid email to the
  uploader; the panel's `POST /api/v1/files/:id/approve` updates the approval +
  file review state + activity log but does **not** send that email.
  **Why:** kept Task #1 minimal; approve-from-panel was scoped to state changes
  only. **How to apply:** if the directed-review loop must fire for
  panel-originated approvals, port the SendGrid block from the web approve route.

## Share-link v1 routes
- Live **inside `registerShareLinkRoutes`** (server/share-links.ts), not in
  routes.ts, so they can reuse `createForScope` + `canManageFileShares` without a
  circular import. `apiAuth` is injected via the deps object from
  `registerRoutes`. Same edit-access gate as the web file share-link routes.
