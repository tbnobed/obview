import * as schema from "@shared/schema";

// Check if we're running in Docker/production environment
const isDocker = process.env.IS_DOCKER === 'true' || process.env.NODE_ENV === 'production';

// Database connection setup based on environment
let pool: any;
let db: any;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

if (isDocker) {
  // Use regular postgres for Docker/production environment
  console.log('Using node-postgres for database connection');
  const { Pool } = require('pg');
  const { drizzle } = require('drizzle-orm/pg-pool');
  
  pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    // Additional connection parameters for stability
    max: 20, // maximum number of clients
    idleTimeoutMillis: 30000, // how long a client is allowed to remain idle before being closed
    connectionTimeoutMillis: 10000, // how long to wait for a connection to become available
  });
  
  db = drizzle(pool, { schema });
} else {
  // Use Neon for development environment
  console.log('Using Neon Serverless for database connection');
  const { Pool, neonConfig } = require('@neondatabase/serverless');
  const { drizzle } = require('drizzle-orm/neon-serverless');
  const ws = require('ws');
  
  neonConfig.webSocketConstructor = ws;
  // Enhanced connection settings for better stability
  neonConfig.wsMaxElapsedTimeout = 30000; // 30 seconds
  neonConfig.retryOptions = {
    maxRetries: 3,
    minDelayMs: 250,
    maxDelayMs: 1000,
  };
  
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool, { schema });
}

// Add error handler to connection pool
pool.on('error', (err: any) => {
  console.error('Unexpected database error on idle client:', err);
});

export { pool, db };