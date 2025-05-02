-- Initialize database schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create initial schema if it doesn't exist
CREATE TABLE IF NOT EXISTS "pg_session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "pg_session_pkey" PRIMARY KEY ("sid")
);

-- Create password_resets table if it doesn't exist
CREATE TABLE IF NOT EXISTS "password_resets" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "expires_at" TIMESTAMP NOT NULL,
  "is_used" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
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
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'IDX_password_resets_token'
    ) THEN
        CREATE INDEX "IDX_password_resets_token" ON "password_resets" ("token");
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'IDX_password_resets_user_id'
    ) THEN
        CREATE INDEX "IDX_password_resets_user_id" ON "password_resets" ("user_id");
    END IF;
END
$$;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE obview TO postgres;