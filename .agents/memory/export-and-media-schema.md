---
name: Export routes & media metadata schema gotchas
description: Where video metadata actually lives, and the share-link export download-gating rule
---

# Video metadata lives on `videoProcessing`, not `files`

`frameRate`, `duration`, `spriteMetadata`, `mediaInfo`, qualities, scrub/sprite paths are columns on the `videoProcessing` table — NOT on `files`. `file.frameRate` does not typecheck. To get fps/duration for a file you must look it up via the video-processing record (or accept the client-supplied `?fps=` like the marker exports do, which default to 30).

**Why:** processing-derived fields were split into their own table; easy to assume they're on `files`.
**How to apply:** when you need frame rate / duration / sprite info server-side, query videoProcessing by fileId; don't reach for `file.frameRate`.

# Share-link export routes are intentionally ungated by `allowDownloads`

`/api/public/share/:token/files/:fileId/export/:format` deliberately does NOT check `gated.link.allowDownloads`, because the original formats (XML / EDL / CSV) are text-only marker data. That assumption breaks the moment an export format embeds **media-derived** content (e.g. extracted video frame thumbnails).

**Why:** download-disabled links are meant to withhold the actual media; a PDF with frame thumbnails would leak frames around that toggle.
**How to apply:** any new public export format that includes pixels/frames/audio from the source must gate that content on `gated.link.allowDownloads` (e.g. produce a text-only variant when false). Pure-text exports can stay ungated.
