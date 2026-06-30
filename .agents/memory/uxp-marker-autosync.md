---
name: UXP marker auto-sync design
description: How comment→marker live sync is scoped and serialized in the Premiere panel, and why.
---

# Marker auto-sync (comments → timeline markers)

The panel pushes Obviu comments onto the active Premiere sequence as markers,
and a 30s poll mirrors newly arrived comments live after the user pulls once.

**Rules that must hold (or markers duplicate / land on the wrong edit):**
- Dedup is **per sequence**, not per file/version. Key by sequence guid (fall
  back to name). A single global "already added" set wrongly reports "up to date"
  when the user pulls into a *different* sequence.
- A pull/auto-sync must record committed comment ids **only after** the
  transaction commits, and the caller must set the target sequence key *before*
  committing so ids land in that sequence's set.
- Serialize all marker commits with an in-flight mutex. The poll calls
  loadComments() un-awaited and user actions (post/reply/resolve/approve) also
  reload — two overlapping syncs compute the same pending items before either
  records them, so without a guard they double-add.
- Auto-sync (poll-driven) must commit **only** when the active sequence still
  equals the one the user manually pulled into. Otherwise switching edits would
  silently dump every comment as markers onto the new timeline.

**Why:** all four were real defects caught in review before this shipped.

**How to apply:** any future marker/timeline write (e.g. ranges, reverse
marker→comment jump) reuses buildMarkerItems()/commitMarkers() and must keep the
per-sequence set + mutex invariants.
