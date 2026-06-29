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
- `duration` — TickTime for a marker span, or `undefined` to omit.
- `comments` — string.

Pass `undefined` for `duration` when there's no range; `comments` still works as the 5th arg. There is no color argument — marker color is set via a separate action, not here.

**Why:** `"Illegal Parameter type"` is a generic native-binding error thrown when ANY arg is the wrong type. The recurring bug here was passing a `TickTime` into the first (name/string) slot because the order was assumed to be `(tickTime, name, type, comments)` — it is not. Don't trust intuited arg order for ppro; check the real signature.

**How to apply:** Marker mutations must run inside `project.executeTransaction(compoundAction => { ... compoundAction.addAction(action) })`. `createSetMarkerDurationAction` is NOT a documented method — set duration via the 4th arg of createAddMarkerAction instead. If "Illegal Parameter type" persists, some flows also require wrapping reads in `project.lockedAccess(...)`.
