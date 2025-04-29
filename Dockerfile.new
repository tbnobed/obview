# Build stage
FROM node:20-alpine as builder

# Install necessary build dependencies
RUN apk add --no-cache python3 make g++ libc6-compat

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Create necessary directories for build
RUN mkdir -p drizzle migrations

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine as production

# Install PostgreSQL client for health checks
RUN apk add --no-cache postgresql-client

WORKDIR /app

# Copy only necessary files from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/init-scripts ./init-scripts
COPY --from=builder /app/.env* ./ 2>/dev/null || true

# Create required directories 
RUN mkdir -p uploads
RUN mkdir -p drizzle migrations

# Make scripts executable
RUN chmod +x ./scripts/*.sh
RUN find ./init-scripts -name "*.sh" -exec chmod +x {} \;

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Create a volume for uploads
VOLUME /app/uploads

# Set entrypoint to initialization script
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]

# Start the application using the correct path
CMD ["node", "dist/index.js"]