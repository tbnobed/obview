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

See **`docs/gotchas.md`** for the full list of operational gotchas (schema migrations, NFS-RDMA, Spark/LLM, file soft-delete, directed review emails, share-link rules, WAN/SiteMagic throughput, cross-subdomain cookies, NPM config, etc.). Always read it before touching infra, schema, or upload/share/email code paths.

Quick index of what lives there:
- Schema migrations & `verify-schema.ts` guard (and the psql heredoc gotcha)
- File soft-delete + hourly trash sweep
- NFS-RDMA setup (server, exports, Spark client) on Ubuntu 24.04
- Spark Whisper (CPU/int8 on aarch64) and the separate Qwen2.5-14B llama-server
- Global folder edit-access rule (must be mirrored in `server/tus.ts`)
- Cron env vars in Docker
- NVENC pipeline + L4 GPU notes
- Directed review loop / approval emails (incl. share-link reviewer email fallback)
- Share-link reviewer uploads (project-scope only)
- WAN parallel tus uploads
- Site-to-site cap = UniFi SiteMagic IPsec CPU
- Cross-subdomain session cookie (`SESSION_COOKIE_DOMAIN`)
- Short-link → main-app cross-host redirect
- Nginx Proxy Manager custom config (don't touch per-host Advanced)

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