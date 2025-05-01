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

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine as production

# Install PostgreSQL client for health checks
RUN apk add --no-cache postgresql-client

WORKDIR /app

# Copy built assets from builder
COPY --from=builder /app/dist ./dist
# Create server directory and copy migration script
RUN mkdir -p ./server
COPY --from=builder /app/server/db-migrate.js ./server/db-migrate.js
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/uploads ./uploads
COPY --from=builder /app/drizzle.config.ts ./

# Add database migration files and scripts
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/.env* ./

# Make scripts executable
RUN chmod +x ./scripts/*.sh

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Create a volume for uploads
VOLUME /app/uploads

# Set entrypoint to our initialization script
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]

# Start the application
CMD ["node", "dist/server/index.js"]