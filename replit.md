# Obviu.io

Obviu.io is a full-stack web application for video collaboration and review, allowing teams to upload media, provide timestamped comments, and manage approval workflows.

## Run & Operate

To run the application, use Docker Compose. Ensure `DATABASE_URL` and `SHORT_LINK_BASE_URL` are set in your `.env` file. For AI features, `SPARK_AI_URL` is required if using an external Spark AI worker.

```bash
# Build Docker images
docker compose build

# Start all services
docker compose up -d

# Run migrations (handled by entrypoint on startup)
# Manual migration command if needed:
docker compose run --rm app npx drizzle-kit migrate

# Typecheck frontend
npm run typecheck-client

# Typecheck backend
npm run typecheck-server

# Generate Drizzle ORM migrations
npx drizzle-kit generate
```

## Stack

- **Frontend**: React 18, TypeScript, Vite, Radix UI, Tailwind CSS, TanStack Query
- **Backend**: Node.js 20, Express.js, TypeScript
- **Database**: PostgreSQL 16
- **ORM**: Drizzle ORM
- **Validation**: React Hook Form
- **Build Tool**: Vite (frontend), esbuild (backend)
- **AI Worker**: FastAPI (Python)
- **Containerization**: Docker, Docker Compose

## Where things live

- **Frontend Source**: `client/src/`
- **Backend Source**: `server/src/`
- **Database Schema**: `server/src/db/schema.ts` (Drizzle ORM)
- **Database Migrations**: `server/src/db/migrations/`
- **API Routes**: `server/src/routes/`
- **Shared Utilities**: `shared/src/`
- **AI Worker (Spark)**: `spark/`
- **Docker Compose**: `docker-compose.yml`
- **Entrypoint Script**: `scripts/docker-entrypoint.sh`
- **Dallas Edge Proxy Config**: `edge/` (NPM custom configs + deploy runbook for the SiteMagic-fronted office accelerator)
- **Client Theme Config**: `client/src/lib/theme.ts`
- **Client API Contracts**: `client/src/lib/api-client.ts`

## Architecture decisions

- **Resumable Chunked Uploads (Tus protocol)**: Ensures robustness against network interruptions and supports large files by allowing uploads to resume from the last successfully transferred chunk.
- **Async Job API for AI Tasks**: Prevents long-lived HTTP connections from timing out, especially for lengthy tasks like transcription, by using a poll-based mechanism.
- **GPU-accelerated Video Encoding (NVENC)**: Prioritizes hardware acceleration for video processing where available, with a robust fallback to CPU encoding, optimizing performance without sacrificing compatibility.
- **NFS-RDMA for AI Media Access**: Utilizes high-throughput, low-latency RDMA for shared media access between the application host and AI compute node, crucial for efficient processing of large media files.
- **Dual-mode LLM Backend**: Provides flexibility to run LLM tasks either locally on CPU (node-llama-cpp) or remotely on GPU (llama-server via OpenAI-compatible API), accommodating diverse deployment environments.

## Product

- Video/audio/image file uploads
- Timestamped commenting on media timelines
- Approval workflows with threaded comments
- Large file support (20GB+)
- Side-by-side and wipe version comparison
- NLE marker export (FCP XML, EDL, CSV)
- Visual frame annotations
- AI-generated synopsis and auto-chapters
- Email notifications for invitations and workflows
- Role-based access control (admin/user)
- Configurable registration
- Short share links
- Soft-delete trash with 7-day auto-purge for files (admin restore/permanent-delete)
- Reviewer uploads via project share links (toggle `allowUploads`; project-scope only)

## User preferences

- Preferred communication style: Simple, everyday language.

## Gotchas

- **Schema changes need a hand-written SQL migration**: `shared/schema.ts` is the Drizzle source of truth, but prod does **not** run `drizzle-kit migrate` against it — `scripts/docker-entrypoint.sh` loops `migrations/*.sql` and tracks applied files in `schema_migrations` (filename + sha256). The numbered SQL files are authored by hand, not generated. Editing schema.ts without adding a corresponding `migrations/NNNN_*.sql` ships a column to dev (via `npm run db:push`) but leaves prod broken on next deploy. Always pair a schema edit with a new migration file using `IF NOT EXISTS` guards so it stays idempotent. **Guarded by `scripts/verify-schema.ts`** — runs at both dev startup (`server/index.ts`) and prod startup (entrypoint, after migrations). It introspects every `pgTable` column against `information_schema.columns` and exits non-zero if anything is missing, refusing to start the server. Bypass with `SKIP_SCHEMA_VERIFY=1` only in emergencies. The 0024 (`files.deleted_at`) and 0025 (`share_links.allow_uploads`) misses are what prompted the guard. **psql `:'var'` substitution gotcha**: the entrypoint's `schema_migrations` SELECT/INSERT must feed SQL via stdin heredoc (`<<'SQL'`), NOT `psql -c` — `-c` does not run psql's preprocessor, so `:'migname'` ships literally to Postgres and you get `syntax error at or near ":"` plus silent re-application of every migration on every restart.

- **File soft-delete & auto-purge**: `DELETE /api/files/:id` only sets `files.deleted_at`; disk artifacts and DB row stay. The hourly sweep loop in `server/index.ts` (`[TRASH SWEEP]`) hard-deletes rows older than `FILE_TRASH_RETENTION_DAYS` (default 7) by calling `storage.purgeFile` then `fileSystem.removeFileCompletely` — DB-first ordering is required so a concurrent admin restore cannot leave a live row pointing at unlinked media. Admins manage trash at `/admin/trash` via `/api/admin/trash/files/:id/{restore, ""}`. Projects/folders still use manual purge — no auto-deletion. All "live" file queries (`getFile`, `getFilesByProject`, `getAllFiles`, `getFileByShareToken`, `getFileWithProjectByShareToken`, latest-video lookups) filter `isNull(files.deleted_at)`; admin trash listing bypasses storage to see trashed rows.

- **NFS-RDMA on Ubuntu 24.04**: The `/etc/nfs.conf rdma=y` directive is unreliable. Use a systemd drop-in for `nfs-server` that writes to `/proc/fs/nfsd/portlist` idempotently:
  ```
  ExecStartPost=/bin/sh -c 'grep -q "^rdma 20049$" /proc/fs/nfsd/portlist || echo "rdma 20049" > /proc/fs/nfsd/portlist'
  ```
  Writing a duplicate `rdma 20049` returns `I/O error` and fails the unit, so the guard is mandatory. Verify with `cat /proc/fs/nfsd/portlist` showing both `tcp 2049` and `rdma 20049`.
- **NFS export for uploads**: On the app host (`obtv-ai`), `/etc/exports` must contain exactly one line:
  `/var/lib/docker/volumes/obview_uploads/_data 192.168.100.0/24(rw,async,no_subtree_check,no_root_squash,fsid=1)`. Duplicate entries (even with different options) cause `exportfs -r` to fail and the unit to exit failed.
- **Spark NFS client**: On the Spark host, `/etc/fstab` mounts the export with `rdma,port=20049,vers=4.2,_netdev,noatime,x-systemd.automount,x-systemd.mount-timeout=30` at `/mnt/obview-uploads`. The `spark.service` unit must declare `RequiresMountsFor=/mnt/obview-uploads` so it doesn't start before the share is ready (Spark binds to `192.168.100.1`, which on cold boot may not be assigned yet — `Restart=always` covers the race).
- **Spark AI Worker on Blackwell**: PyPI's `ctranslate2` aarch64 wheel is CPU-only, so `OBVIU_WHISPER_DEVICE=cpu` and `OBVIU_WHISPER_COMPUTE_TYPE=int8` must be set for Whisper to work on ARM64.
- **Cron Jobs in Docker**: `dcron` does not inherit environment variables. `scripts/docker-entrypoint.sh` persists `DATABASE_URL`/`BACKUP_*` to `/etc/cron-env.sh` for cron scripts to source.
- **NVENC Compatibility**: The GPU pipeline uses CPU decode + CPU scale + NVENC encode to maximize compatibility with various input codecs and avoid issues with `scale_cuda`'s dimension requirements.
- **L4 GPU**: Datacenter card with no NVENC session limit (unlike consumer GeForce 3–8 cap). 24 GB VRAM. Driver 575 / CUDA 12.9 in use; container CUDA runtime must be ≤ 12.9.
- **Share-link reviewer uploads**: `share_links.allow_uploads` is **only honored when `scope_type='project'`** — `loadGatedLink`-backed `POST /api/public/share/:token/upload` rejects folder/file scopes with 403 and `info`/`manifest` flatten the flag to `false` for non-project scopes so the UI never shows the picker. The route is single-shot multer (50GB cap, no resume — tus is auth-coupled and not exposed publicly). Uploaded `files.uploaded_by_id` is set to `link.created_by_id` (FK requires a real user); reviewer email/IP land in the `activity_logs` metadata only. Per-IP rate limit is shared with the public comment route (20/min). Post-upload pipeline (`processVideoInBackground` + `transcribeFile`) is injected into `registerShareLinkRoutes` from `server/routes.ts` to avoid a circular import.
- **WAN upload throughput / parallel tus**: Single-flow TCP throughput on the high-RTT (~44ms) office links is window/RTT-capped at ~9 MB/s even on 4 Gbps ISPs; BBR on `obtv-ai` and `nginx-proxy1` made no measurable difference. The fix is client-side parallelism: files ≥100MB are split into N tus uploads (N=`VITE_UPLOAD_PARALLELISM`, 2–8, default 4) and assembled by `POST /api/uploads/finalize`. Per-group working dir is `uploads/.parts/<groupId>/`. Each part re-validates uploaderId + project edit access on every tus PATCH. Finalize uses an mkdir-based lock (`.finalizing`) with a 1-hour staleness TTL for crash recovery; cancel refuses to race a live finalize lock and returns 409.
- **Nginx Proxy Manager (NPM) custom config**: NPM auto-includes anything in `/data/nginx/custom/`. We use `/data/nginx/custom/server_proxy.conf` to set `proxy_request_buffering off;` (essential for tus / large uploads) on hosts 4 (tbn.obviu.io) and 33 (t.obviu.io) without touching per-host advanced fields. Editing the per-host **Advanced** field is dangerous: NPM's validator runs `nginx -t -g "error_log off;"` which masks the real error, and on a failed validation NPM **deletes the entire host config**, taking the site down until the host is re-saved. The container is `nginx-proxy-manager-app-1`.

## Pointers

- **Radix UI Documentation**: [https://www.radix-ui.com/](https://www.radix-ui.com/)
- **TanStack Query Documentation**: [https://tanstack.com/query/latest](https://tanstack.com/query/latest)
- **Drizzle ORM Documentation**: [https://orm.drizzle.team/](https://orm.drizzle.team/)
- **Tus Protocol Specification**: [https://tus.io/](https://tus.io/)
- **FFmpeg Documentation**: [https://ffmpeg.org/documentation.html](https://ffmpeg.org/documentation.html)
- **Passport.js Documentation**: [http://www.passportjs.org/](http://www.passportjs.org/)
- **Spark AI Worker Readme**: `spark/README.md`