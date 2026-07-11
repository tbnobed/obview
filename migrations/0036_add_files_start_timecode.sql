-- Source start timecode for marker exports ("HH:MM:SS:FF"; ";" before FF =
-- drop-frame). Set by the Premiere panel at upload time from the sequence's
-- zero point; NULL = unknown (exports fall back to the timecode embedded in
-- the media, read from video_processing.media_info).
ALTER TABLE files ADD COLUMN IF NOT EXISTS start_timecode text;
