-- Add annotations column to comments_unified table for draw-on-frame support
-- This column stores JSON-encoded drawing annotations (freehand, circle, rect, arrow)
-- with normalized 0-1 coordinates for resolution-independent rendering

ALTER TABLE comments_unified ADD COLUMN IF NOT EXISTS annotations TEXT;
