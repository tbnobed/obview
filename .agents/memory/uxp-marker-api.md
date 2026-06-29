---
name: UXP Premiere marker creation API
description: Correct arg order/types for ppro Markers.createAddMarkerAction and the "Illegal Parameter type" trap
---

# Premiere UXP `createAddMarkerAction`

**Verified signature (Adobe UXP types.d.ts):**
`createAddMarkerAction(name, markerType?, startTime?, duration?, comments?)`
- `name` — string, **comes FIRST** (NOT the TickTime).
- `markerType` — use the constant `ppro.Marker.MARKER_TYPE_COMMENT` (also CHAPTER / SEGMENTATION / WEBLINK). A raw `"Comment"` string can throw.
- `startTime` — `ppro.TickTime.createWithSeconds(n)`, n MUST be a finite Number (numeric strings throw).
- `duration` — TickTime for a marker span; for a point marker pass a zero TickTime, NOT `undefined`.
- `comments` — string.

For a point marker pass a zero TickTime for `duration` (NOT `undefined` — see below). There is no color argument — marker color is set via a separate action, not here.

**Why:** `"Illegal Parameter type"` is a generic native-binding error thrown when ANY arg is the wrong type. The recurring bug here was passing a `TickTime` into the first (name/string) slot because the order was assumed to be `(tickTime, name, type, comments)` — it is not. Don't trust intuited arg order for ppro; check the real signature.

**How to apply:** Marker mutations must run inside `project.executeTransaction(compoundAction => { ... compoundAction.addAction(action) })`. `createSetMarkerDurationAction` is NOT a documented method — set duration via the 4th arg of createAddMarkerAction instead. If "Illegal Parameter type" persists, some flows also require wrapping reads in `project.lockedAccess(...)`.

**Passing `undefined` for an optional arg ALSO throws "Illegal Parameter type"** — the native binding rejects `undefined` in a TickTime slot. For a point marker pass `ppro.TickTime.createWithSeconds(0)`, never `undefined`.

**Don't iterate the signature blind.** Because we can't run Premiere here and Adobe's docs disagree across versions, the panel now PROBES variants at runtime: createAddMarkerAction validates types synchronously and throws immediately, so it tries known arg-forms in a try/catch, caches the first that returns an Action, and on total failure surfaces `addArity`, the markerType value/type, and `Object.keys(ppro.Marker)` in the on-screen error. Read that diagnostic from the user's next report to lock the form. The fact that we get "Illegal Parameter type" (not "not a function") proves the method resolves and only an arg type is wrong.
