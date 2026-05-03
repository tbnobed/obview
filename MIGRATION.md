# Obviu.io — Server Migration Runbook

Migrates a running Obviu.io deployment (docker compose: `obview_app` + `obview_db` + named volumes) from an **OLD** host to a **NEW** host with **zero data loss**.

Assumes:
- Same compose stack on both sides (`~/obview/docker-compose.yml`).
- Compose project name = `obview`, so Docker volumes are `obview_postgres_data` and `obview_uploads`.
- Direct SSH/rsync between the two hosts.
- Uploads dir is < 10 GB (transfer is minutes, not hours).

> ⚠️ Plan a maintenance window. The OLD app is stopped for the duration of the dump+rsync (write-quiesce). Total downtime should be ≲ 30 min for < 10 GB.

---

## 0. Sanity check on both hosts

```bash
# OLD host
cd ~/obview
docker compose ps
docker volume ls | grep obview_
docker exec obview_db psql -U postgres -d obview -c "SELECT count(*) FROM users;"

# NEW host
cd ~/obview
docker compose ps        # should be running the new code already
docker volume ls | grep obview_
```

Confirm volume names match `obview_postgres_data` and `obview_uploads` on both. If not, substitute the actual names everywhere below.

---

## 1. Quiesce the OLD app (stop writes)

On **OLD**:

```bash
cd ~/obview
# Stop the app but keep db running so we can pg_dump cleanly
docker compose stop app
```

Browser users will get connection errors from this point — that's intentional.

---

## 2. Dump the database on OLD

On **OLD**:

```bash
cd ~/obview
mkdir -p ~/migration-out

# Use the SAME pg version as the server (16) — run pg_dump from inside the db container
docker exec obview_db pg_dump -U postgres -d obview --format=custom --no-owner --no-privileges \
  > ~/migration-out/obview.dump

ls -lh ~/migration-out/obview.dump
```

`--format=custom` gives a compressed binary dump that `pg_restore` can replay cleanly.

---

## 3. Snapshot the uploads volume on OLD

On **OLD**:

```bash
# Tar the uploads volume (read-only mount, no live container needed)
docker run --rm \
  -v obview_uploads:/source:ro \
  -v ~/migration-out:/out \
  alpine tar -C /source -czf /out/uploads.tar.gz .

ls -lh ~/migration-out/uploads.tar.gz
```

---

## 4. Ship to NEW host

From **NEW** (or OLD — whichever can reach the other):

```bash
# Pull from OLD into NEW (run on NEW)
mkdir -p ~/migration-in
rsync -avhP --partial OLD_USER@OLD_HOST:~/migration-out/  ~/migration-in/

# verify checksums match
sha256sum ~/migration-in/*
ssh OLD_USER@OLD_HOST 'sha256sum ~/migration-out/*'
```

Replace `OLD_USER@OLD_HOST` with the real values.

---

## 5. Restore onto NEW

On **NEW**:

```bash
cd ~/obview

# 5a. Stop the app, keep db up so we can restore into it
docker compose stop app
```

### 5b. Wipe and restore the database

```bash
# Drop and recreate the obview database (terminates open connections first)
docker exec -i obview_db psql -U postgres -d postgres <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'obview' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS obview;
CREATE DATABASE obview;
SQL

# Restore the custom-format dump
docker cp ~/migration-in/obview.dump obview_db:/tmp/obview.dump
docker exec obview_db pg_restore \
  -U postgres -d obview \
  --no-owner --no-privileges \
  --clean --if-exists \
  /tmp/obview.dump
docker exec obview_db rm /tmp/obview.dump

# Spot-check
docker exec obview_db psql -U postgres -d obview -c "SELECT count(*) FROM users;"
docker exec obview_db psql -U postgres -d obview -c "SELECT count(*) FROM files;"
docker exec obview_db psql -U postgres -d obview -c "SELECT count(*) FROM transcripts;"
```

The user/file/transcript counts should match what you saw on OLD in step 0.

### 5c. Restore the uploads volume

```bash
# Wipe the existing uploads volume contents, then untar in-place
docker run --rm \
  -v obview_uploads:/dest \
  -v ~/migration-in:/in \
  alpine sh -c 'rm -rf /dest/* /dest/.[!.]* 2>/dev/null; tar -xzf /in/uploads.tar.gz -C /dest && echo OK'

# Spot-check: count files
docker run --rm -v obview_uploads:/d alpine sh -c 'find /d -type f | wc -l ; du -sh /d'
```

The file count + size should match OLD (`du -sh` inside `obview_uploads` there).

---

## 6. Bring NEW back up

On **NEW**:

```bash
cd ~/obview
docker compose up -d app
docker compose logs -f --tail=200 app
```

Watch for:
- `session already exists, skipping` (entrypoint self-heal — good)
- All migrations marked `✅ Applied` or `Already applied`
- App listening on `:5000`

---

## 7. Smoke test

1. Log in as a known user — auth works against the restored `users` table.
2. Open a known project — files list populates from `files` table.
3. Click a video — it streams (uploads volume restored).
4. Open an existing transcript — text renders.
5. Trigger a NEW transcription on a small clip — confirms spark connectivity from the new host.

---

## 8. DNS / reverse proxy cutover

Point the public hostname (or your reverse proxy upstream) at the NEW host. If you used the same hostname, no app config change is needed.

---

## 9. Decommission OLD (after 24–48h soak)

On **OLD**:

```bash
cd ~/obview
docker compose down            # leaves volumes intact
# After confidence period:
docker compose down -v         # destroys volumes
```

Keep `~/migration-out/` archived somewhere cold (S3, external drive) for a few weeks as a rollback option.

---

## Rollback (if NEW is broken)

1. Stop NEW: `docker compose stop app` on NEW.
2. Repoint DNS / proxy back at OLD.
3. Start OLD: `docker compose start app` on OLD.

OLD is untouched by this procedure — its DB and uploads are exactly as they were when you stopped the app in step 1.
