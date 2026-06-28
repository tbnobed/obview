-- API sessions: bearer tokens minted when a user signs in from an external
-- client (the Premiere panel). Unlike users.api_token (a single personal
-- token), this is a table so the SAME user can have many independent,
-- concurrently-valid sessions — required for shared editing workstations where
-- people sign in and out throughout the day and one machine signing in must not
-- invalidate another. Only the SHA-256 hash of the token is stored.
--
-- Idempotent so re-applying on container restart is safe.

CREATE TABLE IF NOT EXISTS api_sessions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamp NOT NULL DEFAULT now()
);

-- Add the FK (cascade so a deleted user's panel sessions are cleaned up) only
-- if it isn't already present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'api_sessions_user_id_fkey'
      AND table_name = 'api_sessions'
  ) THEN
    ALTER TABLE api_sessions
      ADD CONSTRAINT api_sessions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
