-- Adds a personal API token to users for external integrations (the Premiere
-- UXP panel and any future programmatic clients).
--
-- The column stores the SHA-256 HASH of the token, never the plaintext. The
-- plaintext (`obv_` + 40 hex) is shown to the user exactly once at generation
-- time (see the token routes in server/routes.ts and hashApiToken in
-- server/auth.ts). Nullable: existing users have no token until they generate one.
--
-- Idempotent so re-applying on container restart is safe.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS api_token text;
