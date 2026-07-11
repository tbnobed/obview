---
name: Marker export timecode
description: How real timecode flows into NLE marker exports (EDL/FCPXML/CSV) and drop-frame math traps.
---

# Timing resolution order
Marker exports resolve timing from DB truth before client hints:
- fps: exact ffprobe `r_frame_rate` fraction (handles 23.976/29.97) > integer frame_rate column > `?fps=` query > 30.
- start TC: `files.start_timecode` (Premiere panel sends it via tus metadata, strictly validated `HH:MM:SS:FF`, `;` = drop-frame) > timecode tag embedded in the media (ffprobe format/stream tags) > none (zero-based, legacy behavior).
**Why:** the client player only knows playback fps guesses; the web export button still sends `fps=30&duration=` but those are now just fallbacks — no client change needed.
**How to apply:** any new export format must go through `resolveMarkerExportOpts` in `marker-export`, and share-link export routes must mirror the authenticated route.

# Drop-frame math traps
- SMPTE DF renumbering: skip 2 labels/min at 29.97 (4 at 59.94) except every 10th minute. Naive expectation trap: 60 real seconds is frame 1798, which correctly displays **00:00:59;28** — the "1 minute = 00:01:00;02" identity applies to frame 1800, not to 60 wall-clock seconds. Don't "fix" this.
- 17982 frames @29.97 DF = exactly 00:10:00;00 (good self-test).
- FCPXML wants whole-number timebase + `ntsc=TRUE` for fractional rates; markers stay relative — only the `<timecode>` block carries the real start. EDL needs `FCM: (NON-)DROP FRAME` and offsets both src/rec TCs.

# Premiere UXP sequence start TC
`seq.getZeroPoint()` and `seq.getSettings().videoFrameRate` vary by build: value can be seconds, ticks (number or string), fps, or ticks-per-frame (TICKS_PER_SECOND = 254016000000). Read defensively and return null on any doubt — server falls back to the media's embedded TC tag, so a wrong guess is worse than no value.

# Dev DB drizzle push hang
`npm run db:push` (even with --force / piped newline) hangs on an interactive prompt about an unrelated `api_sessions` unique constraint in this dev DB. Workaround: apply additive columns with direct `psql "$DATABASE_URL" -c "ALTER TABLE ... ADD COLUMN IF NOT EXISTS ..."` — matches the hand-written idempotent migration files anyway.
