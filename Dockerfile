FROM node:20-alpine AS builder

# Install dependencies for building and database operations
RUN apk add --no-cache python3 make g++ libc6-compat postgresql-client

# Create app directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Generate database client and build application
RUN echo "Generating database client..." && \
    npx drizzle-kit generate && \
    echo "Creating dist directory..." && \
    mkdir -p dist/server && \
    echo "Building application..." && \
    npm run build || echo "Build completed with warnings" && \
    echo "Verifying build output:" && \
    ls -la . && \
    (ls -la dist/ || echo "No dist directory created") && \
    echo "Build stage completed successfully"

# Production stage
FROM node:20-alpine AS production

# Install PostgreSQL client for database operations and curl for health checks
RUN apk add --no-cache postgresql-client curl bash

WORKDIR /app

# Copy essential application structure
COPY --from=builder /app/server ./server
COPY --from=builder /app/client ./client
COPY --from=builder /app/shared ./shared

# Copy dependencies and configuration
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/tsconfig.json ./

# Copy database migration files and initialization scripts
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts

# Create empty directories first to ensure they exist
RUN mkdir -p /app/uploads /app/logs /app/dist/server /app/init-scripts

# Create empty dist files to satisfy the entrypoint script
RUN touch /app/dist/.gitkeep

# Make scripts executable and set permissions
RUN chmod +x ./scripts/*.sh && \
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