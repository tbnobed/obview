// Helper script to run database migrations
// Determine if we're running in Docker by checking the environment
const isDocker = process.env.IS_DOCKER === 'true' || process.env.NODE_ENV === 'production';

let pool, db, migrate, drizzle;

if (isDocker) {
  // Use regular postgres for Docker environment
  console.log('Running in Docker environment, using node-postgres');
  const { Pool } = require('pg');
  const { drizzle: drizzlePg } = require('drizzle-orm/pg-core');
  const { migrate: migratePg } = require('drizzle-orm/pg-core/migrator');
  
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  drizzle = drizzlePg;
  migrate = migratePg;
} else {
  // Use Neon for development environment
  console.log('Running in development environment, using Neon Serverless');
  const { drizzle: drizzleNeon } = require('drizzle-orm/neon-serverless');
  const { migrate: migrateNeon } = require('drizzle-orm/neon-serverless/migrator');
  const { Pool: NeonPool, neonConfig } = require('@neondatabase/serverless');
  const ws = require('ws');
  
  neonConfig.webSocketConstructor = ws;
  pool = new NeonPool({ connectionString: process.env.DATABASE_URL });
  drizzle = drizzleNeon;
  migrate = migrateNeon;
}

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  console.log('Connecting to database...');
  const db = drizzle(pool);

  console.log('Running migrations...');
  try {
    await migrate(db, { migrationsFolder: 'migrations' });
    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  } finally {
    await pool.end();
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