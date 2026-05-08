-- Adds optional in/out range columns to unified comments so the timeline can
-- carry Frame.io / Premiere-style range markers (single-point comments leave
-- both columns NULL and continue using `timestamp`).

ALTER TABLE comments_unified
  ADD COLUMN IF NOT EXISTS in_point integer,
  ADD COLUMN IF NOT EXISTS out_point integer;
