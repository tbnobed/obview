FROM node:20-alpine as builder

# Install dependencies
RUN apk add --no-cache python3 make g++ libc6-compat

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

# Install PostgreSQL client for health checks and utilities, plus FFmpeg for video processing
# libstdc++ is required by the whisper-cpp binary
RUN apk add --no-cache postgresql-client curl ffmpeg libstdc++ libgcc

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
