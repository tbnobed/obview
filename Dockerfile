FROM node:20-alpine AS builder

# Install dependencies
RUN apk add --no-cache python3 make g++ libc6-compat

# Create app directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Verify the structure before building
RUN ls -la && echo "Content of server directory:" && ls -la server/

# Build the application - carefully tracking the build process
RUN mkdir -p dist/server && \
    echo "Running full build process..." && \
    npm run build && \
    echo "Verifying build output:" && \
    ls -la dist/ && \
    echo "Checking for server file:" && \
    ls -la dist/server/ || { \
      echo "Server directory not found, checking root dist:"; \
      ls -la dist/; \
      echo "Build may have used different output directory structure"; \
    }

# Production stage
FROM node:20-alpine AS production

# Install PostgreSQL client for health checks and utilities
RUN apk add --no-cache postgresql-client curl

WORKDIR /app

# Copy all server source files first (needed for proper operation)
COPY --from=builder /app/server ./server

# Copy built assets from builder - maintain the entire structure
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client ./client
COPY --from=builder /app/shared ./shared

# Create the expected public directory structure for the server
RUN mkdir -p /app/server/public && \
    echo "=== DEBUGGING BUILD OUTPUT ===" && \
    echo "Checking /app/dist structure:" && \
    ls -la /app/dist/ 2>/dev/null || echo "No /app/dist directory" && \
    echo "Checking /app/dist/public structure:" && \
    ls -la /app/dist/public/ 2>/dev/null || echo "No /app/dist/public directory" && \
    echo "Checking /app/client structure:" && \
    ls -la /app/client/ 2>/dev/null || echo "No /app/client directory" && \
    echo "Copying files to /app/server/public/" && \
    if [ -d "/app/dist/public" ]; then cp -r /app/dist/public/* /app/server/public/ 2>/dev/null || true; fi && \
    if [ -d "/app/client/dist" ]; then cp -r /app/client/dist/* /app/server/public/ 2>/dev/null || true; fi && \
    echo "Final /app/server/public structure:" && \
    ls -la /app/server/public/ 2>/dev/null || echo "No files in /app/server/public"

# Copy dependencies and configuration files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/uploads ./uploads
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/vite.config.ts ./

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

# Create a volume for uploads
VOLUME /app/uploads

# Set entrypoint to our initialization script
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]

# Start the application with multiple fallback paths
CMD ["sh", "-c", "if [ -n \"$SERVER_ENTRY\" ] && [ \"$USE_TSX\" = \"true\" ]; then npx tsx $SERVER_ENTRY; elif [ -n \"$SERVER_ENTRY\" ]; then node $SERVER_ENTRY; elif [ -f \"dist/server/index.js\" ]; then node dist/server/index.js; elif [ -f \"dist/index.js\" ]; then node dist/index.js; else echo \"Error: Could not find server entry point. Fallback to source file.\" && npx tsx server/index.ts; fi"]