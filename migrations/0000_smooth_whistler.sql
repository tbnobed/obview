CREATE TABLE IF NOT EXISTS "activity_logs" (
        "id" serial PRIMARY KEY NOT NULL,
        "action" text NOT NULL,
        "entity_type" text NOT NULL,
        "entity_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "metadata" json,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approvals" (
        "id" serial PRIMARY KEY NOT NULL,
        "file_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "status" text NOT NULL,
        "feedback" text,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comments" (
        "id" serial PRIMARY KEY NOT NULL,
        "content" text NOT NULL,
        "file_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "parent_id" integer,
        "timestamp" integer,
        "is_resolved" boolean DEFAULT false NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "files" (
        "id" serial PRIMARY KEY NOT NULL,
        "filename" text NOT NULL,
        "file_type" text NOT NULL,
        "file_size" integer NOT NULL,
        "file_path" text NOT NULL,
        "project_id" integer NOT NULL,
        "uploaded_by_id" integer NOT NULL,
        "version" integer DEFAULT 1 NOT NULL,
        "is_latest_version" boolean DEFAULT true NOT NULL,
        "share_token" text,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
        CREATE TABLE "invitations" (
                "id" serial PRIMARY KEY NOT NULL,
                "email" text NOT NULL,
                "project_id" integer,
                "role" text DEFAULT 'viewer' NOT NULL,
                "token" text NOT NULL,
                "expires_at" timestamp NOT NULL,
                "is_accepted" boolean DEFAULT false NOT NULL,
                "email_sent" boolean DEFAULT false NOT NULL,
                "created_by_id" integer NOT NULL,
                "created_at" timestamp DEFAULT now() NOT NULL,
                CONSTRAINT "invitations_token_unique" UNIQUE("token")
        );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_users" (
        "id" serial PRIMARY KEY NOT NULL,
        "project_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "role" text DEFAULT 'viewer' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "status" text DEFAULT 'in_progress' NOT NULL,
        "created_by_id" integer NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
        CREATE TABLE "users" (
                "id" serial PRIMARY KEY NOT NULL,
                "username" text NOT NULL,
                "password" text NOT NULL,
                "email" text NOT NULL,
                "name" text NOT NULL,
                "role" text DEFAULT 'viewer' NOT NULL,
                "created_at" timestamp DEFAULT now() NOT NULL,
                CONSTRAINT "users_username_unique" UNIQUE("username"),
                CONSTRAINT "users_email_unique" UNIQUE("email")
        );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
