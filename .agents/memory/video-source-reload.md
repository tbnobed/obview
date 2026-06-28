---
name: video element source reload
description: Why swapping a <video>'s child <source> src doesn't reload, and the fix used in version-compare
---

# <video> won't reload when only its child <source> src changes

Changing the `src` of a child `<source>` element (or even the parent `<video src>`)
via React re-render does **not** make the browser fetch/play the new media. The
element keeps showing the old/blank frame until something calls `video.load()` or
the element is remounted.

**Fix used:** put `key={fileId}` on the `<video>` (and `<img>`) so React fully
remounts the element when the selected version changes. This both reloads the
source and re-fires `onLoadedData`/`onError` so per-pane loading/error overlays
reset correctly.

**Why it matters here:** `version-compare.tsx` (same-file A/B version compare)
previously showed a stale/blank pane when switching versions because it only
swapped the `<source>` src with no key and no `.load()`.

**How to apply:** any media element whose source is swapped by state (compare
views, players, galleries) needs either a `key` tied to the source id or an
explicit `el.load()` in an effect. Keying also conveniently resets media-event
state.

Related: real frame rate lives on `videoProcessing.frameRate` (via
`GET /api/files/:id/processing`) — never hardcode 30fps for timecode/stepping.
