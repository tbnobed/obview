BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS project_users_project_user_unique
  ON project_users (project_id, user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_users_role_check'
      AND conrelid = 'project_users'::regclass
  ) THEN
    ALTER TABLE project_users
      ADD CONSTRAINT project_users_role_check
      CHECK (role IN ('editor', 'viewer'));
  END IF;
END
$$;

COMMIT;