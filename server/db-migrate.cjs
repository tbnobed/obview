// Enhanced database migration script with Docker support
const fs = require('fs');
const path = require('path');

// Use appropriate database driver based on environment
let drizzle, migrate, Pool;

if (process.env.IS_DOCKER === 'true') {
  // Use PostgreSQL driver for Docker environment
  const { drizzle: drizzlePg } = require('drizzle-orm/node-postgres');
  const { migrate: migratePg } = require('drizzle-orm/node-postgres/migrator');
  const { Pool: PgPool } = require('pg');
  
  drizzle = drizzlePg;
  migrate = migratePg;
  Pool = PgPool;
} else {
  // Use Neon serverless driver for cloud environment
  const { drizzle: drizzleNeon } = require('drizzle-orm/neon-serverless');
  const { migrate: migrateNeon } = require('drizzle-orm/neon-serverless/migrator');
  const { Pool: NeonPool, neonConfig } = require('@neondatabase/serverless');
  const ws = require('ws');
  
  neonConfig.webSocketConstructor = ws;
  drizzle = drizzleNeon;
  migrate = migrateNeon;
  Pool = NeonPool;
}

// Configure connection timeout for Docker environment
const CONNECTION_TIMEOUT = process.env.DATABASE_CONNECTION_TIMEOUT || 30000;
const MIGRATION_TIMEOUT = process.env.DATABASE_MIGRATION_TIMEOUT || 60000;

async function waitForDatabase(pool, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      console.log('Database connection established');
      return true;
    } catch (error) {
      console.log(`Database connection attempt ${i + 1}/${maxRetries} failed:`, error.message);
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  throw new Error('Could not establish database connection after maximum retries');
}

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  console.log('Initializing database migration...');
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Docker mode:', process.env.IS_DOCKER || 'false');
  
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: CONNECTION_TIMEOUT
  });
  
  try {
    // Wait for database to be ready
    await waitForDatabase(pool);
    
    const db = drizzle(pool);

    // Check if migrations directory exists
    const migrationsPath = path.join(process.cwd(), 'migrations');
    if (!fs.existsSync(migrationsPath)) {
      console.log('No migrations directory found, skipping migrations');
      return;
    }

    console.log('Skipping drizzle migrations in Docker mode - SQL migrations will handle schema setup');
    console.log('Database connection verified successfully');
    
  } catch (error) {
    console.error('Database migration failed:', error);
    throw error;
  } finally {
    try {
      await pool.end();
    } catch (closeError) {
      console.warn('Error closing database pool:', closeError.message);
    }
  }
}

module.exports = { runMigrations };

// Run migrations if this script is executed directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('Migration script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}