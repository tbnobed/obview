# ----- Stable application dependencies -----
# Debian-based so the BtbN static-ffmpeg binary (glibc) and node-llama-cpp's
# prebuilt linux-x64 native binding both work natively. No more musl/glibc
# compat dance.
FROM node:20-bookworm-slim AS dependencies

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 make g++ git cmake build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# npm 10.x can crash inside Docker with "Exit handler never called" during
# clean installs, including on otherwise identical hosts. Use a pinned pnpm
# release through Corepack so the production build does not depend on npm's
# unreliable installer path.
ARG PNPM_VERSION=9.15.9
RUN corepack enable && \
    corepack prepare "pnpm@${PNPM_VERSION}" --activate && \
    test "$(pnpm --version)" = "${PNPM_VERSION}"

COPY package.json pnpm-lock.yaml ./
# The production image is built from source, and its startup verification also
# uses tsx. These tools are regular dependencies so production-mode settings
# cannot omit them. Fail immediately if the build binaries are unavailable.
RUN pnpm install --frozen-lockfile --prod=false && \
    test -x node_modules/.bin/vite && \
    test -x node_modules/.bin/esbuild

# ----- Application builder -----
# Source edits must not change the dependency stage used by the runtime image.
FROM dependencies AS builder
COPY client ./client
COPY server ./server
COPY shared ./shared
COPY tsconfig.json vite.config.ts tailwind.config.ts postcss.config.js ./

ARG VITE_DISABLE_REGISTRATION=true
ENV VITE_DISABLE_REGISTRATION=$VITE_DISABLE_REGISTRATION

# Public-facing short-link domain baked into the client bundle so the
# share dialog generates URLs like https://t.obviu.io/<token>. Empty by
# default → client falls back to window.location.origin.
ARG VITE_SHORT_LINK_BASE_URL=
ENV VITE_SHORT_LINK_BASE_URL=$VITE_SHORT_LINK_BASE_URL

# Canonical app host (e.g. https://tbn.obviu.io). Baked into the client
# bundle so the share-resolver can full-page redirect signed-in viewers
# off t.obviu.io onto the authenticated app host.
ARG VITE_APP_BASE_URL=
ENV VITE_APP_BASE_URL=$VITE_APP_BASE_URL

RUN echo "=== BUILDING APPLICATION ===" && \
    echo "VITE_DISABLE_REGISTRATION=$VITE_DISABLE_REGISTRATION" && \
    echo "VITE_SHORT_LINK_BASE_URL=$VITE_SHORT_LINK_BASE_URL" && \
    echo "VITE_APP_BASE_URL=$VITE_APP_BASE_URL" && \
    pnpm run build && \
    echo "=== BUILD VERIFICATION ===" && \
    ls -la dist/ && \
    echo "Building production server..." && \
    pnpm exec esbuild server/production.ts --platform=node --packages=external --bundle --format=esm --outfile=dist/production.js && \
    test -f dist/production.js && \
    test -f dist/public/index.html && \
    cp vite.config.ts vite.config.js && \
    echo "✅ Production server and frontend built" || (echo "❌ Production build failed" && exit 1)

# ----- whisper.cpp builder -----
# Debian-based so the resulting whisper-cpp binary is glibc-linked and runs
# in the production stage below.
FROM debian:bookworm-slim AS whisper-builder
ARG WHISPER_VERSION=v1.5.4
RUN apt-get update && apt-get install -y --no-install-recommends \
        git make g++ cmake ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone --depth 1 --branch ${WHISPER_VERSION} https://github.com/ggerganov/whisper.cpp.git
WORKDIR /src/whisper.cpp
RUN make -j$(nproc) && \
    test -f ./main && cp ./main /usr/local/bin/whisper-cpp && \
    chmod +x /usr/local/bin/whisper-cpp

# ----- Production stage -----
FROM node:20-bookworm-slim AS production

# Runtime deps:
#   postgresql-client-16 → pg_dump/psql matching the production PG 16 server
#   curl                 → health checks + downloading the ffmpeg tarball
#   xz-utils             → extracting the BtbN ffmpeg tarball
#   cron                 → crond for the daily backup scheduler
#   ca-certificates      → HTTPS to GitHub releases / SendGrid / etc.
RUN apt-get update && \
    apt-get install -y --no-install-recommends gnupg curl ca-certificates && \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        | gpg --dearmor -o /usr/share/keyrings/postgresql-archive-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/postgresql-archive-keyring.gpg] \
        https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list && \
    apt-get update && apt-get install -y --no-install-recommends \
        postgresql-client-16 \
        xz-utils \
        cron \
    && rm -rf /var/lib/apt/lists/*

# Static ffmpeg + ffprobe with NVENC, NVDEC, CUDA filters, libplacebo, vaapi,
# vulkan etc. baked in. BtbN's GPL builds are the de facto standard for a
# fully-loaded ffmpeg binary. The host's NVIDIA driver + Container Toolkit
# injects libnvidia-encode.so.1 / libcuda.so.1 at runtime, so the binary
# resolves NVENC dynamically.
ARG FFMPEG_RELEASE=n8.1-latest-linux64-gpl-8.1
RUN curl --retry 3 --retry-delay 2 -fsSL -o /tmp/ff.tar.xz \
      "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-${FFMPEG_RELEASE}.tar.xz" || \
      curl --retry 3 --retry-delay 2 -fsSL -o /tmp/ff.tar.xz \
      "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz"; \
    mkdir -p /tmp/ff && \
    tar -xJf /tmp/ff.tar.xz -C /tmp/ff --strip-components=1 && \
    install -m 0755 /tmp/ff/bin/ffmpeg  /usr/local/bin/ffmpeg && \
    install -m 0755 /tmp/ff/bin/ffprobe /usr/local/bin/ffprobe && \
    rm -rf /tmp/ff /tmp/ff.tar.xz && \
    /usr/local/bin/ffmpeg -version | head -1

WORKDIR /app

# Copy the prebuilt whisper.cpp binary
COPY --from=whisper-builder /usr/local/bin/whisper-cpp /usr/local/bin/whisper-cpp

# Keep the large dependency layer BEFORE any source/build copies. Otherwise a
# tiny source change invalidates this layer and makes Docker repack/unpack it.
# Copy from the source-independent stage, not the application builder.
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/package.json /app/pnpm-lock.yaml ./

# Install daily backup crontab. Runs at 03:00 server time.
# DATABASE_URL is exported by the entrypoint before crond starts so the
# job inherits it. Debian cron reads /var/spool/cron/crontabs/root.
# A thin wrapper lets the entrypoint call "crond -b -L <log>" without
# caring which cron implementation is installed.
RUN printf '#!/bin/sh\n# Debian cron daemonizes automatically; discard busybox-style flags.\nexec /usr/sbin/cron\n' > /usr/local/bin/crond && \
    chmod +x /usr/local/bin/crond && \
    mkdir -p /var/spool/cron/crontabs && \
    printf '0 3 * * * /app/scripts/backup-cron.sh >> /var/log/backup-cron.log 2>&1\n' \
      > /var/spool/cron/crontabs/root && \
    chmod 600 /var/spool/cron/crontabs/root && \
    touch /var/log/backup-cron.log && chmod 644 /var/log/backup-cron.log

# Persist daily backups across container recreation
VOLUME /app/db-backups

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000
ENV IS_DOCKER=true
ENV UPLOAD_DIR=/app/uploads
# Local transcription (whisper.cpp) defaults — can be overridden via compose / env
ENV TRANSCRIPTION_ENABLED=true
ENV WHISPER_MODEL=base.en
ENV WHISPER_BIN=whisper-cpp
ENV WHISPER_MODELS_DIR=/app/models
# Hardware-accelerated video encoding via NVENC. Falls back to libx264
# automatically if the GPU isn't reachable (see server/video-processor.ts).
ENV VIDEO_USE_NVENC=true

# Create upload + model directories with proper permissions
RUN mkdir -p /app/uploads/processed /app/models && \
    chmod -R 755 /app/uploads /app/models && \
    chown -R node:node /app/uploads /app/models

# Both production static serving and the share crawler look for the frontend.
# Keep one set of compiled assets, with a compatibility symlink for server/public.
RUN mkdir -p /app/server && ln -s ../dist/public /app/server/public

# Small, independently cached runtime inputs. Environment variables are supplied
# at container startup; do not copy .env files into the image.
COPY --chmod=755 scripts/ ./scripts/
COPY migrations/ ./migrations/
COPY drizzle.config.ts ./

# Changing application content belongs LAST, after dependencies/system setup.
# Keep source/config paths needed by schema verification and Vite imports.
COPY --from=builder /app/server ./server
COPY --from=builder /app/client ./client
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/tsconfig.json /app/vite.config.ts /app/vite.config.js ./
COPY --from=builder /app/dist ./dist

# Create volumes for uploads and downloaded whisper models
VOLUME /app/uploads
VOLUME /app/models

# Set entrypoint to our initialization script
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]

# Start the application with the production server
CMD ["node", "dist/production.js"]
