-- Initialize database schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create initial schema if it doesn't exist
CREATE TABLE IF NOT EXISTS "pg_session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "pg_session_pkey" PRIMARY KEY ("sid")
);

-- Create indexes if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'IDX_pg_session_expire'
    ) THEN
        CREATE INDEX "IDX_pg_session_expire" ON "pg_session" ("expire");
    END IF;
END
$$;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE mediareview TO postgres;