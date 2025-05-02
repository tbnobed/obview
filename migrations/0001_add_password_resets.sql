-- Create password_resets table
CREATE TABLE IF NOT EXISTS "password_resets" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "token" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "is_used" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "password_resets_token_unique" UNIQUE("token")
);

-- Add foreign key to link password_resets to users
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" 
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;