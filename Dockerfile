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

# Verify the structure before building
RUN ls -la && echo "Content of server directory:" && ls -la server/ && echo "Checking attached_assets:" && ls -la attached_assets/ && echo "Looking for logo file:" && ls -la attached_assets/obtv_logo_1758612025082.png

# Build the application and production server
RUN echo "=== BUILDING APPLICATION ===" && \
    npm run build && \
    echo "=== BUILD VERIFICATION ===" && \
    ls -la dist/ && \
    echo "Building production server..." && \
    npx esbuild server/production.ts --platform=node --packages=external --bundle --format=esm --outfile=dist/production.js && \
    test -f dist/production.js && echo "✅ Production server built: dist/production.js" || (echo "❌ Production server build failed" && exit 1)

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

# Create a volume for uploads
VOLUME /app/uploads

# Set entrypoint to our initialization script
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]

# Start the application with the production server
CMD ["node", "dist/production.js"]