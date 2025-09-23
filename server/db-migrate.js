// Enhanced database migration script with Docker support
const { drizzle } = require('drizzle-orm/neon-serverless');
const { migrate } = require('drizzle-orm/neon-serverless/migrator');
const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
const fs = require('fs');
const path = require('path');

neonConfig.webSocketConstructor = ws;

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

    console.log('Running database migrations from:', migrationsPath);
    const migrationTimeout = setTimeout(() => {
      throw new Error('Migration timeout exceeded');
    }, MIGRATION_TIMEOUT);

    try {
      await migrate(db, { migrationsFolder: 'migrations' });
      clearTimeout(migrationTimeout);
      console.log('Database migrations completed successfully');
    } catch (migrationError) {
      clearTimeout(migrationTimeout);
      console.error('Migration error:', migrationError);
      throw migrationError;
    }
    
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