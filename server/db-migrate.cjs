// Helper script to run database migrations
// This simplified approach doesn't use drizzle-orm's migrator
// because it has compatibility issues in different environments

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  console.log('Connecting to database...');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Get all migration files
    const migrationsDir = path.join(process.cwd(), 'migrations');
    console.log(`Looking for migrations in: ${migrationsDir}`);
    
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort to ensure migrations run in order
    
    console.log(`Found ${files.length} migration files: ${files.join(', ')}`);

    // Run each migration file
    for (const file of files) {
      console.log(`Running migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      
      // Split by semicolons to handle multiple statements
      const statements = sql.split(';').filter(stmt => stmt.trim());
      
      for (const statement of statements) {
        if (statement.trim()) {
          await pool.query(statement);
        }
      }
      
      console.log(`Migration ${file} completed`);
    }

    console.log('All migrations completed successfully');
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