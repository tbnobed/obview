---
name: Retired obtv-ai server
description: Distinguishes the obsolete obtv-ai host from the active production environment.
---

The `obtv-ai` server is retired and no longer serves the application. It has not been cleaned up: the old Docker upload volume and build cache still occupy most of its root disk. Do not interpret its disk usage, Docker volumes, processes, or hardware as the current production environment.

**Why:** The user explicitly confirmed that `obtv-ai` is the old server and corrected the record that no cleanup has occurred.

**How to apply:** Treat commands and diagnostics from a shell prompt on `obtv-ai` as pending retirement cleanup only. Never imply cleanup has happened until deletion commands have actually run and fresh disk usage confirms reclaimed space. Confirm the hostname of the active server before production recommendations.