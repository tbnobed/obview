# Obviu.io

Obviu.io is a full-stack web application for video collaboration and review, allowing teams to upload media, provide timestamped comments, and manage approval workflows.

## Run & Operate

To run the application, use Docker Compose. Ensure `DATABASE_URL` and `SHORT_LINK_BASE_URL` are set in your `.env` file. For AI features, `SPARK_AI_URL` is required if using an external Spark AI worker. Set `SESSION_COOKIE_DOMAIN=.obviu.io` so the session cookie is shared with the short-link host (`t.obviu.io`) and any other `*.obviu.io` subdomain — without it, signed-in users land on the public review page when they click a share link.

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
- **Spark LLM (separate from Whisper)**: Key moments and synopsis are generated by an LLM, **not** Whisper — Whisper is speech-to-text only. The LLM is `Qwen2.5-14B-Instruct` (Q4_K_M GGUF, `~/models/qwen2.5-14b-instruct.Q4_K_M.gguf` from `bartowski/Qwen2.5-14B-Instruct-GGUF`, ~9 GB on disk, fits on the L4's 24 GB with all layers offloaded) served by `llama.cpp`'s `llama-server` (`/home/obtv-admin/llama.cpp/build/bin/llama-server --host 0.0.0.0 --port 8080 -ngl 99 -c 32768`), wrapped in a systemd unit so it auto-starts. The app reaches it via `LLAMA_API_URL=http://<spark-ip>:8080` (OpenAI-compatible `/v1/chat/completions`). The 7B model was tried first and produced clustered-at-start key moments on long videos (7B-class models drift on long context); 14B fixed that. This server is **not** in `spark/` — that directory is the Whisper FastAPI worker only. If you ever swap the model, update the systemd unit's `--model` path, run `systemctl restart llama-server`, and update this line. No app restart needed; `server/llm-client.ts` reads `LLAMA_API_URL` per-request.
- **Global folder = shared editor workspace**: Projects sitting in a folder where `folders.is_global=true` are intentionally accessible to *every* site editor without per-project membership. Edit-access checks must go through `userHasProjectEditAccess(user, projectId)` in `server/routes.ts` (admin → membership editor/admin → site role 'editor' inside a global folder). The middleware `hasProjectEditAccess` and the inline checks in `/api/files/:fileId/move`, file-delete, comment PATCH, and comment-resolve all use it. Adding a new edit/mutation route? Use that helper, not raw `getProjectUser`, or editors will get spurious 403s ("Couldn't move file", "Failed to update comment") on global-folder projects. **Tus uploader has its own copy of this rule** in `server/tus.ts` `userCanEditProject` (admin → membership editor/admin → site editor in a global folder). It's a parallel implementation because tus runs outside the Express middleware stack and has no `req.user`. If you change the global-folder grant rules in `userHasProjectEditAccess`, mirror the change in `userCanEditProject` or chunked uploads will silently 403 with "Insufficient permissions" while the rest of the app works fine for the same user.
- **Cron Jobs in Docker**: `dcron` does not inherit environment variables. `scripts/docker-entrypoint.sh` persists `DATABASE_URL`/`BACKUP_*` to `/etc/cron-env.sh` for cron scripts to source.
- **NVENC Compatibility**: The GPU pipeline uses CPU decode + CPU scale + NVENC encode to maximize compatibility with various input codecs and avoid issues with `scale_cuda`'s dimension requirements.
- **L4 GPU**: Datacenter card with no NVENC session limit (unlike consumer GeForce 3–8 cap). 24 GB VRAM. Driver 575 / CUDA 12.9 in use; container CUDA runtime must be ≤ 12.9.
- **Directed review loop / approval emails**: As of migration 0026, `files.review_status` (`needs_review` | `changes_requested` | `approved`) and `files.requested_changes_by_id` track the editor↔reviewer ping-pong on a per-file basis. **No email is sent on initial file upload.** "Request Changes" sets the file state and emails ONLY the file's `uploadedById` (not the whole project). "Approve" clears `requested_changes_by_id`, sets state to `approved`, and emails ONLY the uploader. When a new version is uploaded, the upload route reads the *previous* latest version's `requested_changes_by_id`; if set, it sends `sendNewVersionForReviewEmail` to that user (and ONLY that user) — the new version row itself starts at `needs_review` with a NULL requester. The old fan-out-to-every-project-member behavior in `sendApprovalEmail` is gone for these flows. The public share-link "request changes" path (`POST /api/share/:token/request-changes`) now also goes through the directed flow: it sets `files.review_status='changes_requested'` (with `requested_changes_by_id=NULL` since the reviewer has no user account), persists requester name/email/IP/feedback into `activity_logs.metadata` (action `request_changes`, source `share-link`, `userId=null`), and emails ONLY the file's `uploadedById` via `sendChangesRequestedEmail` with `actorName="<name> (via share link)"`. The reviewer's email is also stored on the file in `files.requested_changes_by_email` (migration 0028, nullable text). On next-version upload, the multer route + both tus paths read the prior latest version's `requestedChangesById` first; if NULL, they fall back to `requestedChangesByEmail` and send `sendNewVersionForReviewEmail` to that address. Both approve paths and any logged-in "request changes" clear `requested_changes_by_email` (FK user wins; clearing the email prevents a stale outside reviewer from being pinged after an internal reviewer takes over). Templates live in `server/utils/sendgrid.ts` (`sendChangesRequestedEmail`, `sendFileApprovedEmail`, `sendNewVersionForReviewEmail`). All three accept a single `ReviewEmailCtx` so they can be extended without breaking call sites.
- **Share-link reviewer uploads**: `share_links.allow_uploads` is **only honored when `scope_type='project'`** — `loadGatedLink`-backed `POST /api/public/share/:token/upload` rejects folder/file scopes with 403 and `info`/`manifest` flatten the flag to `false` for non-project scopes so the UI never shows the picker. The route is single-shot multer (50GB cap, no resume — tus is auth-coupled and not exposed publicly). Uploaded `files.uploaded_by_id` is set to `link.created_by_id` (FK requires a real user); reviewer email/IP land in the `activity_logs` metadata only. Per-IP rate limit is shared with the public comment route (20/min). Post-upload pipeline (`processVideoInBackground` + `transcribeFile`) is injected into `registerShareLinkRoutes` from `server/routes.ts` to avoid a circular import.
- **WAN upload throughput / parallel tus**: Single-flow TCP throughput on the high-RTT (~44ms) office links is window/RTT-capped at ~9 MB/s even on 4 Gbps ISPs; BBR on `obtv-ai` and `nginx-proxy1` made no measurable difference. The fix is client-side parallelism: files ≥100MB are split into N tus uploads (N=`VITE_UPLOAD_PARALLELISM`, 2–8, default 4) and assembled by `POST /api/uploads/finalize`. Per-group working dir is `uploads/.parts/<groupId>/`. Each part re-validates uploaderId + project edit access on every tus PATCH. Finalize uses an mkdir-based lock (`.finalizing`) with a 1-hour staleness TTL for crash recovery; cancel refuses to race a live finalize lock and returns 409.

- **Site-to-site cap is the UniFi SiteMagic gateway, not the NICs**: Cross-site throughput between `192.168.200.0/22` (office, `obtv-ai`/`pve2`) and `192.168.3.0/24` (datacenter, `tbn-obviu` VM on `pve2`'s sibling at `192.168.3.80`) is hard-capped at ~700 Mb/s–1 Gb/s aggregate with heavy retransmits (5000+/sec under load), regardless of TCP parallelism (`iperf3 -P 8` did not break the ceiling). The path is `client → 192.168.200.1 → 192.168.5.9 (SiteMagic VPN endpoint) → 192.168.3.80`, ~35 ms RTT. All NICs in the path are 10G full-duplex (`pve2`'s `ens3f1` on `vmbr1` MTU 9000, zero TX errors/drops); the bottleneck is **IPsec encryption CPU on the UniFi gateway terminating the SiteMagic tunnel**. Ubiquiti's own published per-flow ceilings: UDR ~100–130 Mb/s, UCG-Ultra ~600 Mb/s, EFG ~1.1 Gb/s. Symptoms before chasing this again: oscillating per-second throughput (e.g. 750 / 370 Mb/s alternating), thousands of retransmits with 0 errors on the physical NIC, aggregate stays flat as flows are added. Do **not** waste time on BBR, MTU, jumbo frames, NIC tuning, or TCP window sizing — none of it touches the crypto queue. Mitigations, in order: (1) upgrade the gateway on at least the slower side to an EFG-class box; (2) replace SiteMagic for bulk media with a WireGuard tunnel between the two sites — WG crypto is cheaper per CPU cycle than IPsec and typically gets 1.5–2× the throughput on the same hardware, route only the two media subnets over it; (3) collocate `tbn-obviu` (or whatever's at `192.168.3.80`) onto the office site so the SD-WAN hop disappears entirely. Until one of those happens, parallel tus uploads (above) are the only client-side mitigation.
- **Cross-subdomain session cookie**: `server/auth.ts` reads `SESSION_COOKIE_DOMAIN` and, if set, applies it to the session cookie's `domain` attribute. Prod **must** set `SESSION_COOKIE_DOMAIN=.obviu.io` so the cookie is sent on `t.obviu.io`, `tbn.obviu.io`, and any future `*.obviu.io` host. Without it, a logged-in user clicking a short share link (`https://t.obviu.io/<token>`) lands on the public review UI. Leave the env var unset in dev / replit preview so the cookie stays host-only. Changing the domain effectively invalidates existing sessions (host-only cookie ≠ domain-scoped cookie); users will need to log in once after the rollout. Do not weaken `sameSite: 'lax'` or `secure: true` (prod) — both are required to keep the now-shared cookie from leaking.

- **Short-link → main-app redirect (cross-host)**: Just sharing the cookie isn't enough — the share-page redirect originally used wouter's `setLocation`, which is pushState-only and leaves the user on `t.obviu.io`. Two pieces:
  1. `server/share-links.ts` `/api/public/share/:token/info` returns `viewerAuthenticated` (server-side cookie check) plus `fileProjectId` / `folderProjectId` so the client can resolve the right authed URL without `/api/user`. Folder shares additionally branch on `folderProjectId`: project subfolders (`folders.projectId != null`) → `/projects/:fpid?folder=:scopeId`; sidebar/global folders → `/folders/:scopeId`.
  2. `client/src/pages/share-resolver-page.tsx` reads `info` first; if `viewerAuthenticated && !expired`, it does `window.location.replace(VITE_APP_BASE_URL + path)` *before* mounting `MultiSharePage`/`PublicSharePage`. `multi-share-page.tsx` and `public-share-page.tsx` carry the same cross-host fallback (using `useAuth().user`) for direct visits to `/s/:token` and `/share/:token`. **Prod must build with `APP_BASE_URL=https://tbn.obviu.io`** (passed through to `VITE_APP_BASE_URL` in `docker-compose.yml`) so the bundle is baked with the canonical app host. Leave it unset in dev / replit (single-host) — code falls back to in-app `setLocation`. `client/src/pages/project-page.tsx` reads `?folder=N` on mount and seeds `currentSubfolderId` so a folder share lands inside the subfolder, not the project root.
- **Nginx Proxy Manager (NPM) custom config**: NPM auto-includes anything in `/data/nginx/custom/`. We use `/data/nginx/custom/server_proxy.conf` to set `proxy_request_buffering off;` (essential for tus / large uploads) on hosts 4 (tbn.obviu.io) and 33 (t.obviu.io) without touching per-host advanced fields. Editing the per-host **Advanced** field is dangerous: NPM's validator runs `nginx -t -g "error_log off;"` which masks the real error, and on a failed validation NPM **deletes the entire host config**, taking the site down until the host is re-saved. The container is `nginx-proxy-manager-app-1`.

## Deferred / parked work

### Adobe Premiere Pro panel (UXP) — circle back

**Why now:** Editors want comments + markers inside Premiere instead of round-tripping FCPXML. CEP is dead Sept 2026 — UXP only. UXP went GA in Premiere 25.6 (Dec 2025).

**Branch + env strategy (do not touch prod):**
- Long-lived branches off `main`: `panel/server` (API tokens, CORS, `/api/v1/*`) and `panel/plugin` (UXP plugin, separate repo `obviu-premiere-panel/` so it doesn't pull into the app image).
- All schema changes additive (new tables / nullable cols only) until merged, so prod hotfixes on `main` keep merging cleanly into the panel branches.
- Stand up `~/obview-staging` on `obtv-ai` as a second Compose stack with `COMPOSE_PROJECT_NAME=obview_stg`, separate DB volume (`obview_stg` DB), separate uploads volume, port 5001, NPM host `stg.obviu.io`, `SESSION_COOKIE_DOMAIN` left unset. Nightly `pg_dump | psql` from prod → staging.
- Hotfix loop: fix on `main` → deploy `~/obview` → `git merge main` into panel branches → staging redeploys.

**Server-side prerequisites (in this repo, on `panel/server`):**
1. `users.api_token` (random 40-char, stored hashed) + Settings UI to generate/revoke.
2. Bearer-token middleware that sets `req.user` (in addition to existing session cookie).
3. CORS allowlist for the Adobe UXP webview origin (TBD on first run — log `Origin` header from the panel during dev).
4. Stable read API under `/api/v1/`:
   - `GET /api/v1/projects`
   - `GET /api/v1/projects/:id/files`
   - `GET /api/v1/files/:id` (includes `versions[]`)
   - `GET /api/v1/files/:id/comments` (timestamp, in/out, status, author, resolved)
   - `GET /api/v1/files/:id/transcript`
5. Tus auth via bearer token (already cookie-gated; mirror to bearer).
6. Phase-2 only: outbound webhooks (`comment.created`, `file.versioned`, `review.changed`).

**Panel scope (separate repo `obviu-premiere-panel/`, UXP via `require('premierepro')`):**
- **Phase 1 (read-only):** sign in via API token, browse projects → files → versions, "Pull comments to markers" (color by status: open=red, resolved=green, changes-requested=orange; range comments → marker spans), "Jump to comment" (set sequence CTI), polling refresh every 30s.
- **Phase 2 (write-back):** reply / resolve / approve from inside Premiere; "Send for review" → AME export → tus upload as a new version of an existing file.
- **Phase 3:** AME watch-folder auto-upload, optional burn-in watermark/timecode, multi-workspace switcher.

**Distribution:**
- Direct `.ccx` from `tbn.obviu.io/downloads/obviu-premiere.ccx` first (no review).
- Adobe Creative Cloud Marketplace listing later (1–4 wk review per submission, 10% fee on paid). Required for mass distribution + auto-update.

**Effort estimate:** server prereqs ~3–5 days, Phase 1 panel ~1.5–2 wk, Phase 2 ~2–3 wk, marketplace submission ~2 days work + 1 month calendar.

**Open decisions before kickoff:**
- Phase 1 read-only first vs. straight to write-back?
- Ship `.ccx` direct first, marketplace later — confirmed approach.
- Markers from latest version only, or any historical version?
- Confirm `~/obview-staging` provisioning + `stg.obviu.io` NPM host + port 5001 + Spark NFS share access.

## Pointers

- **Radix UI Documentation**: [https://www.radix-ui.com/](https://www.radix-ui.com/)
- **TanStack Query Documentation**: [https://tanstack.com/query/latest](https://tanstack.com/query/latest)
- **Drizzle ORM Documentation**: [https://orm.drizzle.team/](https://orm.drizzle.team/)
- **Tus Protocol Specification**: [https://tus.io/](https://tus.io/)
- **FFmpeg Documentation**: [https://ffmpeg.org/documentation.html](https://ffmpeg.org/documentation.html)
- **Passport.js Documentation**: [http://www.passportjs.org/](http://www.passportjs.org/)
- **Spark AI Worker Readme**: `spark/README.md`