-- Add deactivated_at column to users for reversible account deactivation.
-- NULL = active account; NOT NULL = deactivated (login blocked in the passport
-- local strategy, existing sessions invalidated in deserializeUser). Admins
-- toggle this via DELETE /api/users/:id (deactivate) and
-- POST /api/users/:id/reactivate. No content is removed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP;
