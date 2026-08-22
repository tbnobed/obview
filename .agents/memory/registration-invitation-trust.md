---
name: Registration and invitation trust boundary
description: Durable security rules for account creation and bearer invitation flows.
---

Registration visibility in the client is not an access control. Account creation must default to invitation-only on the server, ignore unauthenticated role input, and apply privileges only through a validated invitation flow.

Bearer invitation tokens must never appear in logs or broad API responses. Acceptance must be atomic and one-time, and every membership write path must enforce the same role allowlist with database constraints as a backstop.

**Why:** A publicly reachable development URL exposed a server registration route even though the UI hid signup. A duplicate legacy invitation route and unconstrained membership write also showed that securing only the newest handler is insufficient.

**How to apply:** For any registration, invitation, membership, or auth change, inventory every matching route, verify the production entry point, test unauthenticated requests live, validate roles server-side, and preserve database uniqueness/check constraints.