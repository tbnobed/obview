---
name: Uploads bind-mount over unmounted disk = silent data loss
description: Why a brand-new upload can vanish (bytes gone, dangling DB row) while all old files are fine, and the startup sentinel guard that prevents it.
---

# Uploads bind-mount over an unmounted data disk

The app container bind-mounts `/srv/obviu/uploads:/app/uploads`. If the data disk
is NOT mounted at `/srv/obviu/uploads` when the container starts, Docker
bind-mounts the empty fallback directory on the **root disk**. Uploads written in
that window go to non-persistent storage and are **wiped on the next
`docker compose up -d` recreate**. The DB row (separate volume) survives →
dangling row: full `file_size`, `is_available` later flipped false by the content
route, no bytes on disk, and **no deletion in the app logs**.

**Why it's not a code bug:** the upload/processing/cleanup code never deletes an
original — `VideoProcessor` only reads the input (`ffmpeg -i`), and orphan/force
cleanup are admin-only POST endpoints that log loudly.

**Diagnostic signature (how to recognize it fast):**
- A single / handful of brand-new uploads missing while hundreds of older files
  are fine (DB: `count(*) FILTER (WHERE is_available=false)` is tiny).
- The **entire** `processed/<id>/` dir is gone, not just the original — proof the
  whole footprint was on ephemeral storage, not the mount.
- Container `StartedAt` (`docker inspect ... .State.StartedAt`) is **after** the
  upload's `created_at` → a recreate wiped the ephemeral layer.

**Prevention (in repo):** `server/production.ts` `assertUploadsVolumeMounted()`.
When env `UPLOADS_VOLUME_ID` is set, it refuses to boot unless
`/app/uploads/.obviu-uploads-volume` contains that id. The root-disk fallback
never has the sentinel, so a wrong/absent mount crash-loops loudly instead of
silently eating data. **Why opt-in:** unset = legacy no-op, so deploying the
guard can't brick a running prod until the operator deliberately arms it.
**How to apply:** with the real disk mounted,
`echo "<id>" > /srv/obviu/uploads/.obviu-uploads-volume`, then set
`UPLOADS_VOLUME_ID=<id>` in the app env. Also fix the actual root cause: give the
data disk a `/etc/fstab` entry (with `nofail`) so it's never absent at boot.

**Recovery for a lost row:** bytes are unrecoverable. Delete `video_processing`
rows for the file id, then the `files` row, and re-upload.
