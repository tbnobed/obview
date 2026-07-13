---
name: Annotation overlay aspect-lock
description: Why frame-drawing overlays must sit on an aspect-locked media box, not a letterboxed container.
---

Annotation drawings (AnnotationCanvas / AnnotationOverlay) store shapes as
0–1 coordinates normalized to the **media box they were drawn/measured in**,
then multiply by that box's width/height to render. There is no per-video-rect
mapping inside the overlay.

**Rule:** any player that shows annotations must size the overlay to the actual
video rectangle, not a letterboxed container. The web media-player does this by
aspect-locking its box to the video (`style aspectRatio: videoWidth/videoHeight`
+ `w-full` + maxHeight/maxWidth 100% + flex "0 1 auto"). A plain flex container
with `object-contain` video letterboxes the video (black bars) while the overlay
canvas covers the whole box → drawings stretch into the bars and look absent.

**Why:** the panel-player (`/panel-player/:token`, panel-player-page.tsx) used a
plain container and annotations appeared missing/misplaced. Fixed by mirroring
media-player's aspect-locked box.

**How to apply:** when adding annotation display to a new player surface, copy
media-player's aspect-lock (track videoAspect from loadedmetadata, reset per
file) and give the box a definite width (`w-full`) so it can't collapse — its
only child (the video) is absolutely positioned and contributes no layout size.
