-- Create the extension for UUID generation if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create the session table for persistent sessions
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- Set permissions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_catalog.pg_roles WHERE rolname = 'postgres'
  ) THEN
    CREATE ROLE postgres WITH LOGIN SUPERUSER;
  END IF;
END
$$;

-- Grant privileges to the postgres user
GRANT ALL PRIVILEGES ON DATABASE obview TO postgres;