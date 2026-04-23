-- Migration 0018: Multi-scope share links with per-link settings
-- Adds project/folder/file share links supporting password, expiry, and per-link toggles.

CREATE TABLE IF NOT EXISTS share_links (
  id              text PRIMARY KEY,
  token           text NOT NULL UNIQUE,
  scope_type      text NOT NULL,
  scope_id        integer NOT NULL,
  name            text,
  password_hash   text,
  expires_at      timestamp,
  allow_downloads boolean NOT NULL DEFAULT false,
  allow_comments  boolean NOT NULL DEFAULT true,
  require_email   boolean NOT NULL DEFAULT false,
  revoked_at      timestamp,
  created_by_id   integer NOT NULL REFERENCES users(id),
  created_at      timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS share_links_scope_idx ON share_links (scope_type, scope_id);
CREATE INDEX IF NOT EXISTS share_links_token_idx ON share_links (token);
