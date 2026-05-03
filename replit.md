# Overview

Obviu.io is a full-stack web application similar to Frame.io, designed for video collaboration and review. The platform allows teams to upload video/audio/image files, provide timestamped comments on media timelines, and manage approval workflows. The application is built with React and TypeScript on the frontend, Express.js and Node.js on the backend, and uses PostgreSQL for data persistence. It's optimized for self-hosted deployment on Ubuntu servers with Docker support.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Components**: Radix UI components with Tailwind CSS for styling
- **State Management**: TanStack Query for server state management and caching
- **Authentication**: Session-based authentication with JWT tokens
- **Theme System**: Context-based theme provider supporting light, dark, and system themes with localStorage persistence for guest users and database storage for authenticated users

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Session Management**: Express sessions with PostgreSQL session store using connect-pg-simple
- **Authentication**: Passport.js with local strategy for username/password authentication
- **File Upload**: Multer middleware for handling large file uploads (up to 20GB+)
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Migration System**: SQL-based migrations with automated execution during container startup
- **AI Worker (Spark)**: External FastAPI service on the DGX Spark node (`spark/service.py`) reachable over the 200Gb DAC link. App uses an **async job API**: `POST /transcribe/jobs` returns 202 + jobId immediately, app polls `GET /transcribe/jobs/{id}` every 5s until completion. This avoids holding a long HTTP connection across Docker NAT (conntrack ~10min idle timeout) and undici's default 5min header/body timeout. The spark serializes jobs internally via a single dedicated worker thread + queue; the legacy sync `POST /transcribe` is retained for admin tools but no longer used by the app. Job registry retains the last 200 finished jobs in memory for restart-resilient polling. Transcripts table carries a `spark_job_id` column so polling can resume across app restarts.
- **Video Processing**: FFmpeg-based video encoding with configurable timeouts for large file support (up to 2+ hour processing times)

### Data Storage Solutions
- **Primary Database**: PostgreSQL with the following core tables:
  - users: User accounts with role-based access (admin/user) and theme preferences
  - projects: Project containers for organizing media files
  - files: Media file metadata with bigint file sizes to support large uploads
  - comments: Timestamped comments linked to specific media files
  - approvals: Approval workflow states for review processes
  - project_users: Many-to-many relationship for project access control
- **File Storage**: Local filesystem storage with configurable upload directory
- **Session Storage**: PostgreSQL-based session persistence

### Authentication and Authorization
- **Session-based Authentication**: Secure session cookies with configurable expiration
- **Role-based Access Control**: Admin and user roles with different permission levels
- **Password Security**: Salted and hashed passwords using crypto module
- **Password Reset**: Email-based password reset workflow with temporary tokens
- **Registration Control**: Configurable registration disable via VITE_DISABLE_REGISTRATION environment variable for Docker deployments

### AI Synopsis (Local Summarization)
- **Engine**: `node-llama-cpp` running a small instruct model entirely on the host (no cloud / external APIs)
- **Default model**: `llama-3.2-1b-instruct.Q4_K_M.gguf` (~770MB, downloaded on first use to `models/llama/`)
- **Pipeline**: After whisper transcription completes, `summarizeForFile` is auto-triggered to produce a headline + 2-4 sentence overview + key-moments bullet list from the transcript text
- **API**: `POST /api/files/:id/summary/regenerate` triggers (re)generation; the synopsis is stored in the same `transcripts` row (`summary`, `summary_status`, `summary_error`, `summary_model`, `summary_processed_at`)
- **UI**: Synopsis card at the top of the Transcript tab with regenerate button and live status (pending/processing/completed/failed)
- **Configuration**: `SUMMARIZATION_ENABLED`, `LLAMA_MODEL`, `LLAMA_THREADS`, `LLAMA_MODELS_DIR` env vars; Docker volume `llama_models` persists the downloaded GGUF model

### Key Features Implementation
- **Media Timeline Comments**: Timestamped comments system allowing precise feedback on video content
- **Approval Workflow**: Request changes or approve functionality with threaded comment support
- **File Preview**: Browser-native HTML5 video/audio players with custom controls
- **Large File Support**: Optimized for uploads up to 20GB+ with configurable FFmpeg processing timeouts
- **NLE Marker Export**: Export timestamped comments as FCP XML (Premiere Pro / DaVinci Resolve), EDL (CMX 3600), or CSV via `/api/files/:fileId/export/:format` endpoint and in-player export button
- **Visual Frame Annotations**: Draw-on-frame annotation system with freehand, circle, rectangle, and arrow tools, 5-color picker, undo/clear/done controls. Annotations stored as normalized 0-1 JSON coordinates in the `annotations` column of `comments_unified`. Annotations display as overlays on hover over annotated comments. Available in both authenticated player and public share pages.
- **Version Comparison**: Side-by-side and wipe (split-screen slider) comparison of file versions. The Versions tab in the media player lists all versions by filename, and a "Compare" button opens a full-screen dialog with synced video playback, draggable wipe divider with keyboard support, and version A/B pickers that prevent duplicate selection. Located in `client/src/components/media/version-compare.tsx`.
- **Email Notifications**: SendGrid integration for user invitations and workflow notifications
- **Video Processing Pipeline**: 
  - 720p H.264 quality encoding for optimal playback
  - 180p I-frame only scrub versions for smooth timeline seeking
  - Thumbnail sprite generation for hover previews
  - Configurable timeouts: Quality (60 min), Scrub (30 min), Sprite (10 min), Metadata (5 min)
  - All timeouts adjustable via environment variables for large file handling
  - **NVIDIA NVENC hardware acceleration** when `VIDEO_USE_NVENC=true` (default on in Docker). Full CUDA decode → `scale_cuda` → `h264_nvenc` pipeline keeps frames in GPU memory. Automatic fallback to libx264 on any failure (no GPU access, unsupported input codec, NVENC session exhaustion). Tunables: `VIDEO_NVENC_MAIN_PRESET` (p1-p7, default p4), `VIDEO_NVENC_MAIN_CQ` (default 23), `VIDEO_NVENC_SCRUB_PRESET` (default p1), `VIDEO_NVENC_SCRUB_CQ` (default 28).
  - Production Docker image based on `node:20-bookworm-slim` (Debian glibc), with BtbN static FFmpeg n7.1 (NVENC/NVDEC/CUDA filters/vaapi/vulkan) installed at `/usr/local/bin/ffmpeg`. Container Toolkit injects `libnvidia-encode.so.1`, `libcuda.so.1` etc. at runtime; compose uses `runtime: nvidia` + `NVIDIA_VISIBLE_DEVICES=all` + `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video` to trigger the prestart hook.

### AI Hardware Topology (Self-Hosted)
- **`obtv-ai`** (x86_64, Ubuntu 24.04): primary application host. Tesla T4 GPU (driver 575.64.03, CUDA 12.9) used for NVENC video encoding inside the app container. Mellanox ConnectX-5 (`mlx5_0`/`mlx5_1`) on the 200Gb DAC link.
- **`spark-174a`** (ARM64, DGX Spark, Blackwell): dedicated AI compute node for heavy models (Whisper-large, CLIP, 70B-class LLMs). Mellanox ConnectX-7 with four RoCE ports. Reaches obtv-ai's media via NFS-RDMA.
- **DAC link**: 200Gb Mellanox direct-attach copper, point-to-point on `192.168.100.0/24`, MTU 9000, sub-ms latency. obtv-ai = .2, spark = .1. Lossless RoCE v2 (no PFC needed since there's no switch).
- **Shared media via NFS-RDMA**:
  - Server: obtv-ai exports the Docker `obview_uploads` volume at `/var/lib/docker/volumes/obview_uploads/_data` over NFSv4.2 with the RDMA transport bound on port 20049 (the standard `tcp 2049` listener stays up for compatibility).
  - Server-side bring-up notes: Ubuntu 24.04's `/etc/nfs.conf` `rdma=y` directive is unreliable; the persistent fix is a systemd drop-in (`/etc/systemd/system/nfs-server.service.d/rdma.conf`) that runs `echo "rdma 20049" > /proc/fs/nfsd/portlist` post-start. Also `/etc/exports` must exist (touch it) for `/etc/exports.d/*` to be parsed.
  - Client: spark mounts at `/mnt/obview-uploads` via fstab with `vers=4.2,proto=rdma,port=20049,rsize=1048576,wsize=1048576,hard,timeo=600,_netdev,nofail`.
  - Measured throughput: write 837 MB/s (disk-bound on server), read 17.7 GB/s (RDMA + page cache, zero-copy). Proves the RDMA path is live; standard NFS-over-TCP would cap ~1-2 GB/s on the same hardware.
- **Spark AI worker** (`spark/` in this repo): FastAPI service that runs on the Spark via `setup.sh` (creates venv, installs deps incl. `faster-whisper`, writes a systemd unit `obviu-spark-ai.service` bound to `192.168.100.1:7681` — DAC interface only, with `RequiresMountsFor=/mnt/obview-uploads` so it won't start without the shared media). GPU probe is tolerant of `[Not Supported]` cells (the GB10 returns those for memory/util because of unified memory) and reports `unifiedMemory: true` so the app side knows VRAM-bounding heuristics don't apply. Endpoints:
  - `GET /health` — liveness, GPU snapshot, NFS mount sanity (`isRdma`/`isNfs` flags).
  - `GET /info`, `GET /probe?path=<rel>` (path-traversal-safe ffprobe).
  - `POST /transcribe` — Whisper transcription via faster-whisper (`large-v3-turbo` default), reads media via NFS-RDMA, optionally writes the result to `<mount>/transcripts/<basename>.json` so the app sees it through the same mount with no DB schema change. Concurrency uses a `threading.Lock` held by the worker thread itself so an HTTP cancel/timeout cannot release exclusivity while the GPU is still busy. No server-side wall-clock timeout — clients should bound long jobs themselves.
  - `GET /transcribe/status` — current job + loaded model cache.
- **App-side spark client** (`server/spark-client.ts`): typed wrapper with `SparkUnavailableError` for network failures vs `SparkHttpError` for non-2xx (preserves upstream status — 429 busy / 404 missing / 503 model-load-failed bubble through correctly). Wired into two admin routes: `GET /api/admin/spark/status` and `POST /api/admin/spark/transcribe/:fileId`. The route derives the spark-relative path via `path.relative(UPLOAD_DIR, file.filePath)` (with traversal guard) instead of `basename`, so files in subdirectories or with duplicate basenames still resolve correctly.
- **Required env on the app host**: `SPARK_AI_URL=http://192.168.100.1:7681` (or fall back on existing `SPARK_DIAG_URL`).
- **Whisper-on-Blackwell, current state (verified 2026-05-03)**: PyPI's `ctranslate2` aarch64 wheel is **CPU-only** (NVIDIA only ships CUDA wheels for x86_64), so `ctranslate2.get_cuda_device_count()` returns 0 and CUDA model loads fail with `"This CTranslate2 package was not compiled with CUDA support"`. The cu12-vs-cu13 driver mismatch is a separate, future problem we won't hit until we actually have a CUDA-enabled CT2 build. Working config today: a systemd drop-in at `/etc/systemd/system/obviu-spark-ai.service.d/override.conf` setting `Environment=OBVIU_WHISPER_DEVICE=cpu` and `Environment=OBVIU_WHISPER_COMPUTE_TYPE=int8`. Measured throughput: 836 MB / 52-min audio in ~13 min wall clock (≈0.25× realtime, model load 2 s after first warm-up). To unlock GPU later, build CT2 from source against CUDA 13 (recipe in `spark/README.md` "Whisper on Blackwell") or wait for an aarch64+CUDA wheel from upstream/NGC.

### Deployment Architecture
- **Containerization**: Multi-stage Docker builds with separate builder and production stages
- **Container Orchestration**: Docker Compose with separate services for app, database, and reverse proxy
- **Database Initialization**: Automated schema setup and admin user creation on first run
- **Migration Handling**: Robust migration system that handles both fresh installs and updates
- **Health Checks**: Database connectivity verification before application startup
- **Volume Management**: Persistent volumes for database data, uploads, and `db_backups` (mounted at `/app/db-backups`)
- **Backups**:
  - Pre-migration: `scripts/docker-entrypoint.sh` runs `pg_dump` on every container start (last 10 retained, prefix `pre-migration-`).
  - Daily: `dcron` schedules `scripts/backup-cron.sh` at 03:00. Writes `/app/db-backups/daily-YYYYMMDD-HHMMSS.sql` and prunes files older than `BACKUP_RETENTION_DAYS` (default 30). Crond does not inherit env, so the entrypoint persists `DATABASE_URL`/`BACKUP_*` to `/etc/cron-env.sh` (mode 600), which the cron script sources.

### Soft-delete + Trash (admin)
- `projects.deleted_at` and `folders.deleted_at` mark soft-deleted rows. All read paths (`getProject*`, `getAllProjects*`, `getFile`, `getFolder*`) filter `deleted_at IS NULL`.
- `DELETE /api/projects/:id` is now a soft delete (no disk unlink, no FK cascade). Files stay on disk and can be recovered from the admin trash.
- Admin endpoints (`GET /api/admin/trash`, `POST /api/admin/trash/projects/:id/restore`, `DELETE /api/admin/trash/projects/:id`, plus folder equivalents) power `/admin/trash`. Permanent delete (`DELETE`) hard-removes the DB row and unlinks the underlying files via `removeMultipleFiles`.
- The project delete dialog (`client/src/components/projects/project-card.tsx`) requires the user to type the exact project name; for admins deleting projects owned by someone else it shows an extra warning.

### Subfolders inside projects
- `folders.project_id` (NULL for top-level/legacy folders) and `folders.parent_folder_id` model nested folders. `files.folder_id` (NULL = project root) places a file in a subfolder. Both FKs are `ON DELETE CASCADE`/`SET NULL` respectively. `getAllFolders` excludes project subfolders so the global sidebar still works.
- Endpoints: `GET/POST /api/projects/:projectId/folders`, `PATCH /api/files/:fileId/move`.
- UI: `client/src/components/projects/project-folders.tsx` adds a breadcrumb + subfolder strip and a “Move to folder…” dialog driven from `MediaCard`’s dropdown.

## Future / Tabled Roadmap

### GPU-accelerated transcription & translation (deferred)
Currently transcription runs on CPU via `whisper.cpp` (`base.en` model by default). When ready to upgrade for higher throughput and to add translation:

- **Recommended hardware**: NVIDIA RTX PRO 4500 Blackwell (32 GB GDDR7 ECC, blower cooler, ~350 W, FP4/FP8 Tensor Cores). Sweet spot for 24/7 server use; has headroom for Whisper large-v3 + a translation model resident at the same time. Alternative budget: RTX 4090 (24 GB) for on-prem, NVIDIA L4 (24 GB) for cloud/colo.
- **Software swap**:
  - Replace `whisper.cpp` with `faster-whisper` (CTranslate2) for ~50–80× real-time on Whisper large-v3, or `whisperX` for word-level timestamps + speaker diarization.
  - Add a translation worker: NLLB-200, Madlad-400, or SeamlessM4T v2 (speech↔speech).
- **Containerization**: Switch the Docker image to a CUDA base (e.g., `nvidia/cuda:12.6-runtime-ubuntu22.04`) and add `nvidia-container-toolkit` requirement to deployment docs.
- **Backwards compatibility**: Gate the new backend behind a `WHISPER_BACKEND=whisper-cpp|faster-whisper` env var so CPU-only deployments keep working unchanged. `TRANSCRIPTION_ENABLED` and the existing transcript schema/API remain the same.
- **Status**: tabled for a later release per user decision.

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: PostgreSQL database driver optimized for serverless environments
- **drizzle-orm**: Type-safe ORM for database operations and schema management
- **express**: Web application framework for the API server
- **multer**: Multipart form data handling for file uploads
- **passport**: Authentication middleware with local strategy support
- **connect-pg-simple**: PostgreSQL session store for Express sessions

### UI and Frontend Libraries
- **@radix-ui/***: Comprehensive set of accessible UI components
- **@tailwindcss/vite**: Tailwind CSS integration with Vite build system
- **@tanstack/react-query**: Server state management and caching
- **react-hook-form**: Form state management with validation
- **class-variance-authority**: Type-safe CSS class variants
- **clsx**: Conditional CSS class utility

### Email and Communication
- **@sendgrid/mail**: Email service integration for notifications and user invitations

### Development and Build Tools
- **vite**: Fast frontend build tool with hot module replacement
- **typescript**: Type safety across the entire application
- **esbuild**: Fast JavaScript bundler for server-side code
- **drizzle-kit**: Database migration and schema management tools

### Infrastructure Dependencies
- **PostgreSQL 16**: Primary database with full-text search capabilities
- **Docker**: Containerization platform for consistent deployments
- **Nginx**: Reverse proxy and load balancer (optional, for production deployments)
- **SendGrid**: Email delivery service for notifications
- **Node.js 20**: JavaScript runtime environment