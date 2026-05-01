-- 0020: Soft delete for projects/folders + per-project subfolders + file folder_id
--
-- Background: on 2026-04-30 an admin hard-deleted three projects via the UI,
-- which cascade-removed their files and unlinked the raw mp4s on disk. This
-- migration switches deletes to soft deletes (set deleted_at) so a future
-- accidental delete is recoverable. It also adds the columns needed for
-- subfolders within a project (folders.project_id, folders.parent_folder_id,
-- files.folder_id) so users can organize files inside a project.
--
-- All ALTERs use IF NOT EXISTS so this is safe to re-run on partially-migrated
-- databases.

-- 1. Soft-delete columns
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE folders  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- 2. Subfolder columns
ALTER TABLE folders ADD COLUMN IF NOT EXISTS project_id        INTEGER;
ALTER TABLE folders ADD COLUMN IF NOT EXISTS parent_folder_id  INTEGER;
ALTER TABLE files   ADD COLUMN IF NOT EXISTS folder_id         INTEGER;

-- 3. Foreign keys (skip silently if they already exist)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'folders_project_id_fkey')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='projects') THEN
        ALTER TABLE folders ADD CONSTRAINT folders_project_id_fkey
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipping folders_project_id_fkey: %', SQLERRM;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'folders_parent_folder_id_fkey') THEN
        ALTER TABLE folders ADD CONSTRAINT folders_parent_folder_id_fkey
            FOREIGN KEY (parent_folder_id) REFERENCES folders(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipping folders_parent_folder_id_fkey: %', SQLERRM;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'files_folder_id_fkey') THEN
        ALTER TABLE files ADD CONSTRAINT files_folder_id_fkey
            FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipping files_folder_id_fkey: %', SQLERRM;
END $$;

-- 4. Indexes for the common filters
CREATE INDEX IF NOT EXISTS idx_projects_deleted_at  ON projects(deleted_at);
CREATE INDEX IF NOT EXISTS idx_folders_deleted_at   ON folders(deleted_at);
CREATE INDEX IF NOT EXISTS idx_folders_project_id   ON folders(project_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id    ON folders(parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_files_folder_id      ON files(folder_id);
