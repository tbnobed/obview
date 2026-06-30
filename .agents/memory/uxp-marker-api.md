---
name: UXP Premiere marker creation API
description: Correct call pattern for ppro Markers.createAddMarkerAction — lockedAccess is the real fix, not arg order
---

# Premiere UXP `createAddMarkerAction`

**Verified signature (Adobe UXP types.d.ts):**
`createAddMarkerAction(name, markerType?, startTime?, duration?, comments?): Action`
- `name` — string, comes FIRST.
- `markerType` — `ppro.Marker.MARKER_TYPE_COMMENT` and friends. **These constants ARE plain strings** — `MARKER_TYPE_COMMENT === "Comment"`, `..._CHAPTER === "Chapter"`, `..._SEGMENTATION === "Segmentation"`, `..._WEBLINK === "WebLink"`. Passing the literal `"Comment"` is fine; the constant is not falsy.
- `startTime` / `duration` — MUST be `ppro.TickTime` (`createWithSeconds(n)`, finite Number). Point marker = zero-length TickTime (`createWithSeconds(0)` or `TickTime.TIME_ZERO`), never `undefined`/raw number.
- `comments` — string.

**THE REAL FIX — wrap in `project.lockedAccess`:** The recurring failure was
`"The script object is no longer valid"` (a *stale native handle* error, NOT a
type error). Marker objects/actions are only valid INSIDE a synchronous
`project.lockedAccess(() => { ... })` callback. Required pattern:
1. `await` every async call (`getActiveProject`, `getActiveSequence`,
   `ppro.Markers.getMarkers(seq)`) **before** entering the lock.
2. `project.lockedAccess(() => { ... })` — **synchronous, no `await` inside**
   (an await silently breaks the lock and invalidates every handle).
3. inside it, `project.executeTransaction((compoundAction) => { const a =
   markers.createAddMarkerAction(...); compoundAction.addAction(a); }, "label")`
   — **do NOT `await` executeTransaction** (returns a boolean, not a Promise).
4. Build TickTimes and the action inside the transaction; batch many
   `addAction` calls in one transaction = one undo step.

**Why:** chasing "Illegal Parameter type" sent us down a blind arg-order
probe for many rounds. The runtime diagnostic finally showed the FIRST/most
trustworthy probe error was "script object is no longer valid" with the
canonical `(name,type,start,dur,comment)` form — i.e. the signature was right
all along; the missing piece was `lockedAccess`. The later probe forms returned
misleading "Illegal Parameter type" because throwing inside a shared
`executeTransaction` poisons it, so only the FIRST error in such a probe is
trustworthy.

**How to apply:** Never iterate the signature blind again — it wastes rounds
and the multi-form probe corrupts the transaction. Use the documented signature
+ `lockedAccess`. `createSetMarkerDurationAction` is not a documented method —
set duration via the 4th arg. Color is a separate action, not an arg here.
Guard `lockedAccess` with a `typeof === "function"` fallback for pre-25.6
builds.

## Reading marker properties back (tag-based sync)

Tag-based deletion depends on reading a live Marker's BODY back to find the
`[obviu#id]` tag. Accessor names vary across UXP builds, so reads must try
multiple candidates or every Obviu marker is misclassified as "untagged" and
never removed (the comment is deleted but the marker stays on the timeline).
Use a `firstOf([...])` helper trying: body — `em.comments` / `em.getComments()`
/ `em.comment` / `em.getComment()` / `em.notes` / `em.getNotes()`; name —
`em.name` / `em.getName()`; start — `em.start.seconds` / `em.getStart().seconds`
/ `em.startTime.seconds`.

Removal action factory name also varies: detect among
`createRemoveMarkerAction` / `createDeleteMarkerAction` / `createRemoveAction`
(returns a `make(marker)` closure, null on older builds). When no factory is
found but orphans exist, surface the Markers object's marker-related method
names in the panel status (own + prototype chain, filtered by
/marker|remove|delete|action/i) so the real API name is identified from the
running build instead of guessed.

**Why:** "marker won't delete even though it's correctly tagged" traced to the
body read (`em.comments`) returning empty on the user's build, not to the
removal API. Never assume a single property/getter name on UXP native objects.
