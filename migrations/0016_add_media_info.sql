-- Cache the full ffprobe JSON (format + streams) on the video_processing
-- row at encoding time so the MediaInfo dialog can render technical details
-- instantly without re-running ffprobe on every open.
--
-- IF NOT EXISTS keeps this safe on both fresh installs (where the column is
-- already defined by the consolidated schema) and existing deployments that
-- predate the column.
ALTER TABLE video_processing ADD COLUMN IF NOT EXISTS media_info JSON;
