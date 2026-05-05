-- Per-user recent-projects history (powers the sidebar's Recent list).
-- Composite PK on (user_id, project_id) lets us upsert opened_at on each visit.
CREATE TABLE IF NOT EXISTS recent_projects (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS recent_projects_user_opened_idx
    ON recent_projects (user_id, opened_at DESC);
