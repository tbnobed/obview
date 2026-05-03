FROM node:20-alpine as builder

# Install dependencies
# git + cmake are required for node-llama-cpp's postinstall, which builds
# llama.cpp from source on Alpine (musl is incompatible with the prebuilt linux-x64 binary).
RUN apk add --no-cache python3 make g++ libc6-compat git cmake linux-headers

# Create app directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code including assets
COPY . .

# Accept build arguments for Vite environment variables
ARG VITE_DISABLE_REGISTRATION=false
ENV VITE_DISABLE_REGISTRATION=$VITE_DISABLE_REGISTRATION

# Verify the structure before building  
RUN ls -la && echo "Content of server directory:" && ls -la server/

# Build the application and production server
RUN echo "=== BUILDING APPLICATION ===" && \
    echo "VITE_DISABLE_REGISTRATION=$VITE_DISABLE_REGISTRATION" && \
    npm run build && \
    echo "=== BUILD VERIFICATION ===" && \
    ls -la dist/ && \
    echo "Building production server..." && \
    npx esbuild server/production.ts --platform=node --packages=external --bundle --format=esm --outfile=dist/production.js && \
    test -f dist/production.js && echo "✅ Production server built: dist/production.js" || (echo "❌ Production server build failed" && exit 1)

# ----- whisper.cpp build stage -----
FROM alpine:3.19 as whisper-builder
ARG WHISPER_VERSION=v1.5.4
RUN apk add --no-cache git make g++ cmake
WORKDIR /src
RUN git clone --depth 1 --branch ${WHISPER_VERSION} https://github.com/ggerganov/whisper.cpp.git
WORKDIR /src/whisper.cpp
RUN make -j$(nproc) && \
    test -f ./main && cp ./main /usr/local/bin/whisper-cpp && \
    chmod +x /usr/local/bin/whisper-cpp

# Production stage
FROM node:20-alpine as production

# Install PostgreSQL client for health checks and utilities.
# libstdc++ is required by the whisper-cpp binary.
# dcron provides the in-container scheduler used by scripts/backup-cron.sh.
# gcompat supplies glibc shims so we can run BtbN's static ffmpeg (glibc-built)
# on Alpine (musl) below. xz is needed to extract the BtbN tarball.
# NOTE: We deliberately do NOT install Alpine's `ffmpeg` package — it's built
# without NVENC/CUDA. We pull a static ffmpeg with NVENC support below.
RUN apk add --no-cache postgresql-client curl libstdc++ libgcc dcron gcompat xz

# Static ffmpeg + ffprobe with NVENC, NVDEC, CUDA filters, libplacebo, vaapi,
# vulkan etc. baked in. BtbN's GPL builds are the de facto standard for a
# fully-loaded ffmpeg binary. The host's NVIDIA driver + Container Toolkit
# injects libnvidia-encode.so.1 / libcuda.so.1 at runtime, so the binary
# resolves NVENC dynamically — Alpine itself ships no NVIDIA libs.
ARG FFMPEG_RELEASE=n7.1-latest-linux64-gpl-7.1
RUN curl -fsSL -o /tmp/ff.tar.xz \
      "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-${FFMPEG_RELEASE}.tar.xz" && \
    mkdir -p /tmp/ff && \
    tar -xJf /tmp/ff.tar.xz -C /tmp/ff --strip-components=1 && \
    install -m 0755 /tmp/ff/bin/ffmpeg  /usr/local/bin/ffmpeg && \
    install -m 0755 /tmp/ff/bin/ffprobe /usr/local/bin/ffprobe && \
    rm -rf /tmp/ff /tmp/ff.tar.xz && \
    /usr/local/bin/ffmpeg -version | head -1

WORKDIR /app

# Copy the prebuilt whisper.cpp binary
COPY --from=whisper-builder /usr/local/bin/whisper-cpp /usr/local/bin/whisper-cpp

# Copy all server source files first (needed for proper operation)
COPY --from=builder /app/server ./server

# Copy built assets from builder - maintain the entire structure
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client ./client
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Copy dependencies and configuration files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/vite.config.ts ./

# Fix the vite.config import issue - tsx needs the file to be resolvable without extension
RUN cp vite.config.ts vite.config.js

# Copy frontend build files to where the production server expects them
RUN mkdir -p /app/server/public && \
    cp -r /app/dist/public/* /app/server/public/ && \
    echo "✅ Frontend files copied to /app/server/public/" && \
    ls -la /app/server/public/ && \
    test -f dist/production.js && echo "✅ Production server ready" || (echo "❌ Production server missing" && exit 1)

# Add database migration files and scripts
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/.env* ./

# Make scripts executable
RUN chmod +x ./scripts/*.sh

# Install daily backup crontab. Runs at 03:00 server time.
# DATABASE_URL must be exported by the entrypoint before crond starts so the
# job inherits it (alpine crond uses /var/spool/cron/crontabs/root).
RUN mkdir -p /var/spool/cron/crontabs && \
    printf '0 3 * * * /app/scripts/backup-cron.sh >> /var/log/backup-cron.log 2>&1\n' \
      > /var/spool/cron/crontabs/root && \
    chmod 600 /var/spool/cron/crontabs/root && \
    touch /var/log/backup-cron.log && chmod 644 /var/log/backup-cron.log

# Persist daily backups across container recreation by mounting db-backups
VOLUME /app/db-backups

# Expose port
EXPOSE 5000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000
ENV IS_DOCKER=true
ENV UPLOAD_DIR=/app/uploads
# Local transcription (whisper.cpp) defaults — can be overridden via compose / env
ENV TRANSCRIPTION_ENABLED=true
ENV WHISPER_MODEL=base.en
ENV WHISPER_BIN=whisper-cpp
ENV WHISPER_MODELS_DIR=/app/models

# Create upload + model directories with proper permissions
RUN mkdir -p /app/uploads/processed /app/models && \
    chmod -R 755 /app/uploads /app/models && \
    chown -R node:node /app/uploads /app/models

# Create volumes for uploads and downloaded whisper models
VOLUME /app/uploads
VOLUME /app/models

# Set entrypoint to our initialization script
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]

# Start the application with the production server
CMD ["node", "dist/production.js"]
