---
name: UXP Premiere marker creation API
description: Correct arg order/types for ppro Markers.createAddMarkerAction and the "Illegal Parameter type" trap
---

# Premiere UXP `createAddMarkerAction`

Signature is `(tickTime, name, type, comments)`:
- `tickTime` — `ppro.TickTime.createWithSeconds(n)`, n MUST be a real finite Number (coerce; numeric strings from the JSON API throw).
- `name` — string label.
- `type` — marker type value, e.g. `ppro.Constants.MarkerType.COMMENT` (fall back to the literal `"Comment"` if Constants isn't exposed).
- `comments` — MUST be a string.

**Why:** `"Illegal Parameter type"` is a generic native-binding error thrown when ANY arg is the wrong type. Two separate bugs produced it here: (1) a numeric-string timestamp into `createWithSeconds`, and (2) a **color integer passed in the `comments` slot** (old code wrongly did `(...tickTime, name, commentText, COLOR_NUMBER)`). There is no color argument in this call.

**How to apply:** When a UXP marker/TickTime call throws "Illegal Parameter type", check EACH argument's type against the real signature — don't assume it's the first/timestamp one. Marker color (if ever needed) must be set via a separate action, not inside createAddMarkerAction. Marker mutations must run inside `project.executeTransaction(compoundAction => ...)` and be added via `compoundAction.addAction(...)`.
