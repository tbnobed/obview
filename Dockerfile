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

# Run the setup script to create required directories and files
RUN node scripts/setup-drizzle.cjs

# Build the application
RUN npm run build

# Debug build output
RUN ls -la dist || echo "dist directory not found"
RUN ls -la dist/server || echo "dist/server directory not found"

# Production stage
FROM node:20-alpine as production

# Install PostgreSQL client for health checks
RUN apk add --no-cache postgresql-client

WORKDIR /app

# Copy built assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/drizzle.config.ts ./

# Create uploads directory
RUN mkdir -p uploads

# Generate directory for migrations
RUN mkdir -p migrations
RUN mkdir -p drizzle

# Create placeholder migration files
RUN touch migrations/placeholder.sql
RUN touch drizzle/placeholder.sql

# We won't attempt to copy files from the builder stage as this is causing issues
# Instead, we'll ensure the directories are properly created with placeholder content
RUN echo "-- Placeholder migration file" > migrations/placeholder.sql
RUN echo "-- Placeholder drizzle file" > drizzle/placeholder.sql

# Copy scripts and config files
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

# Start the application (based on package.json start script)
CMD ["node", "dist/index.js"]