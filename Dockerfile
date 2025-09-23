FROM node:20-alpine as builder

# Install dependencies for building and database operations
RUN apk add --no-cache python3 make g++ libc6-compat postgresql-client

# Create app directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Generate database client and build migrations
RUN echo "Generating database client..." && \
    npx drizzle-kit generate && \
    echo "Building application..." && \
    mkdir -p dist/server && \
    npm run build && \
    echo "Verifying build output:" && \
    ls -la dist/ && \
    ls -la dist/server/ || echo "Server build output may be in different location"

# Production stage
FROM node:20-alpine as production

# Install PostgreSQL client for database operations and curl for health checks
RUN apk add --no-cache postgresql-client curl bash

WORKDIR /app

# Copy application structure
COPY --from=builder /app/server ./server
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client ./client
COPY --from=builder /app/shared ./shared

# Copy dependencies and configuration
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/tsconfig.json ./

# Copy database migration files and initialization scripts
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/init-scripts ./init-scripts
COPY --from=builder /app/scripts ./scripts

# Create uploads directory and copy any existing uploads
RUN mkdir -p /app/uploads
COPY --from=builder /app/uploads ./uploads

# Copy environment files if they exist
COPY --from=builder /app/.env* ./ || true

# Make scripts executable and create required directories
RUN chmod +x ./scripts/*.sh && \
    mkdir -p /app/logs /app/uploads /app/dist/server && \
    chmod 755 /app/uploads /app/logs

# Expose port
EXPOSE 5000

# Set environment variables for production
ENV NODE_ENV=production
ENV PORT=5000
ENV IS_DOCKER=true
ENV DATABASE_CONNECTION_TIMEOUT=30000
ENV DATABASE_MIGRATION_TIMEOUT=60000

# Create volumes for persistent data
VOLUME ["/app/uploads", "/app/logs"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
  CMD curl -f http://localhost:5000/api/health || exit 1

# Set entrypoint to initialization script
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]

# Enhanced startup command with better error handling
CMD ["sh", "-c", "if [ -n \"$SERVER_ENTRY\" ]; then node $SERVER_ENTRY; elif [ -f \"dist/server/index.js\" ]; then node dist/server/index.js; elif [ -f \"dist/index.js\" ]; then node dist/index.js; else echo \"Starting with TypeScript runtime...\" && npx tsx server/index.ts; fi"]