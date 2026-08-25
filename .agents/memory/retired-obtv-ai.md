---
name: Retired obtv-ai server
description: Distinguishes the obsolete obtv-ai host from the active production environment.
---

The `obtv-ai` server is retired and no longer serves the application. Do not interpret its disk usage, Docker volumes, processes, or hardware as the current production environment.

**Why:** The user explicitly confirmed that `obtv-ai` is the old server after sharing its nearly full root disk and unused Docker storage.

**How to apply:** Treat commands and diagnostics from a shell prompt on `obtv-ai` as archival cleanup work only. Confirm the hostname of the active server before making production deployment, performance, storage, or deletion recommendations.