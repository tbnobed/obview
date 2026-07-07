---
name: iOS faststart playback fallback
description: Why failed transcodes still get a 'source' quality, and what that label means.
---

# iOS faststart playback fallback

When the 720p transcode produces zero renditions, the pipeline stream-copies the
original into a faststart MP4 (`-c:v copy -c:a aac -movflags +faststart`) and records
it under the quality label **`source`** (VideoProcessor.generatePlayableRemux). Clients
(authed MediaPlayer + both share pages) prefer `/qualities/source` when no `720p` exists.

**Why:** iOS Safari refuses to stream a large MP4/MOV whose `moov` atom is at the end
(typical of Premiere/QuickTime exports with no faststart). Transcodes all use
`+faststart`, which is the only reason proxies play on iPhone. A raw failed-transcode
original served from `/content` won't play on iOS. Stream-copy is used (not re-encode)
because re-encoding is the step that already failed/timed out; copy is I/O-bound and
fast even on 10GB+ files.

**How to apply:**
- `source` is NOT a real proxy — it's the full-res original bitstream, just re-containered.
  It can be large (≈ original size) and has no sprite/scrub. Don't treat it as a
  lightweight rendition or wire the HD/720p toggle to it.
- The remux only runs when the source video codec is *positively confirmed*
  h264/hevc. Unknown/undetectable or ProRes/DNxHD/VP9/AV1 → no fallback, file stays
  `failed` (a file iOS can't decode is worse than an honest failure).
- `/qualities/:quality` (authed, `/api/share`, `/api/public/share`) all resolve by
  `q.resolution === param`, so `source` streams with no endpoint changes.
- Server change requires an app Docker image rebuild + redeploy to take effect.
