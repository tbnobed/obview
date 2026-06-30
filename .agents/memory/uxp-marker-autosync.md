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
marker→comment jump) reuses the same builders/commit path and must keep the
per-sequence dedup + mutex invariants.

# Deletion sync must be timeline-driven, not memory-driven

Mirroring server-side comment deletions back onto the timeline **cannot** rely on
an in-panel record of what was pushed: the user reloads the panel between actions,
which wipes any in-memory store, so the panel forgets it ever created a marker and
can't remove it. The timeline itself must be the source of truth.

**The design that works: tag every Obviu marker with its comment id.** Write
`[obviu#<id>]` into the marker body. Then on every sync, enumerate the live
markers, parse the tag to recognise ours, and reconcile:
- add markers for comments whose id isn't already tagged on the timeline,
- remove our tagged markers whose comment id is no longer in the comment list.

The tag is the only stable handle — UXP markers expose no custom id field. Because
it lives in the project, add/dedup/delete all survive panel reloads.

**Rules that must hold:**
- All marker enumeration + add/remove actions happen **inside** the
  lockedAccess/executeTransaction runner (marker objects are only valid there).
- **Skip the transaction when there's nothing to add, migrate, or remove** — a
  zero-action executeTransaction can report a false failure.
- The per-sequence in-memory Set is now only a badge hint ("N to add"); it is not
  load-bearing for correctness and is rebuilt from each scan.
- Legacy/pre-tag markers (and markers that match a live comment by name+start)
  are **migrated** in place (remove untagged + re-add tagged) so future deletes
  sync. Consume untagged matches one-to-one so one legacy marker can't suppress
  two same-name/same-time comments.
- If the build lacks `createRemoveMarkerAction`, surface a one-line note that
  deleted markers can't be auto-removed.

**Why:** the in-memory approach silently failed every time the user reloaded the
panel (the actual repeated bug); only a project-persisted tag makes deletion
reliable.
