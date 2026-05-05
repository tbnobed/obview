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

## User preferences

- Preferred communication style: Simple, everyday language.

## Gotchas

- **NFS-RDMA on Ubuntu 24.04**: The `/etc/nfs.conf rdma=y` directive is unreliable. A systemd drop-in is required to persistently enable RDMA for NFS.
- **Spark AI Worker on Blackwell**: PyPI's `ctranslate2` aarch64 wheel is CPU-only, so `OBVIU_WHISPER_DEVICE=cpu` and `OBVIU_WHISPER_COMPUTE_TYPE=int8` must be set for Whisper to work on ARM64.
- **Cron Jobs in Docker**: `dcron` does not inherit environment variables. `scripts/docker-entrypoint.sh` persists `DATABASE_URL`/`BACKUP_*` to `/etc/cron-env.sh` for cron scripts to source.
- **NVENC Compatibility**: The GPU pipeline uses CPU decode + CPU scale + NVENC encode to maximize compatibility with various input codecs and avoid issues with `scale_cuda`'s dimension requirements.

## Pointers

- **Radix UI Documentation**: [https://www.radix-ui.com/](https://www.radix-ui.com/)
- **TanStack Query Documentation**: [https://tanstack.com/query/latest](https://tanstack.com/query/latest)
- **Drizzle ORM Documentation**: [https://orm.drizzle.team/](https://orm.drizzle.team/)
- **Tus Protocol Specification**: [https://tus.io/](https://tus.io/)
- **FFmpeg Documentation**: [https://ffmpeg.org/documentation.html](https://ffmpeg.org/documentation.html)
- **Passport.js Documentation**: [http://www.passportjs.org/](http://www.passportjs.org/)
- **Spark AI Worker Readme**: `spark/README.md`