FROM node:20-alpine as builder

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

# Build the application using the working npm script
RUN echo "=== BUILDING APPLICATION ===" && \
    npm run build && \
    echo "=== BUILD VERIFICATION ===" && \
    ls -la dist/ && \
    test -f dist/index.js && echo "✅ Server build SUCCESS: dist/index.js" || (echo "❌ Server build FAILED: dist/index.js missing" && exit 1) && \
    test -d dist/public && echo "✅ Frontend build SUCCESS: dist/public/" || echo "⚠️ Frontend build different structure"

# Production stage
FROM node:20-alpine as production

# Install PostgreSQL client for health checks and utilities
RUN apk add --no-cache postgresql-client curl

WORKDIR /app

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
COPY --from=builder /app/uploads ./uploads
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/vite.config.ts ./

# Fix the vite.config import issue - tsx needs the file to be resolvable without extension
RUN cp vite.config.ts vite.config.js

# Copy frontend build files to where the server expects them and verify server build
RUN mkdir -p /app/server/public && \
    cp -r /app/dist/* /app/server/public/ && \
    echo "✅ Frontend files copied to /app/server/public/" && \
    test -f dist/index.js && echo "✅ Server build verified: dist/index.js exists" || (echo "❌ Server build missing: dist/index.js" && exit 1)

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

# Start the application with the compiled server
CMD ["node", "dist/index.js"]