import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';
import { Pool } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import ws from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read .env file
try {
  const envPath = join(__dirname, '..', '.env');
  const env = readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .reduce((acc, line) => {
      const [key, value] = line.split('=');
      acc[key.trim()] = value.trim();
      return acc;
    }, {});

  // Set environment variables
  for (const [key, value] of Object.entries(env)) {
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
} catch (error) {
  console.error('Warning: .env file not found or could not be read. Using environment variables only.');
}

// Configure NeonDB to use the ws package
import { neonConfig } from '@neondatabase/serverless';
neonConfig.webSocketConstructor = ws;

// Database connection
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

console.log('Connecting to database...');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const scryptAsync = promisify(scrypt);

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const buf = (await scryptAsync(password, salt, 64));
  return `${buf.toString('hex')}.${salt}`;
}

async function createTables() {
  try {
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(100),
        role VARCHAR(20) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create projects table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        created_by_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP
      )
    `);

    // Create files table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS files (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        original_filename VARCHAR(255) NOT NULL,
        file_path TEXT,
        file_size BIGINT,
        file_type VARCHAR(100),
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        uploaded_by_id INTEGER REFERENCES users(id),
        version VARCHAR(20),
        is_latest_version BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create comments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        content TEXT NOT NULL,
        timestamp FLOAT,
        position JSONB,
        parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create project_users table (for team members)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_users (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        role VARCHAR(20) DEFAULT 'viewer',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP,
        UNIQUE(project_id, user_id)
      )
    `);

    // Create activity_logs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INTEGER NOT NULL,
        action VARCHAR(50) NOT NULL,
        details JSONB,
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create invitations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invitations (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        email VARCHAR(100) NOT NULL,
        user_id INTEGER REFERENCES users(id),
        role VARCHAR(20) DEFAULT 'viewer',
        token VARCHAR(255) UNIQUE NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        created_by_id INTEGER REFERENCES users(id),
        expires_at TIMESTAMP,
        accepted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create approvals table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS approvals (
        id SERIAL PRIMARY KEY,
        file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        status VARCHAR(20) NOT NULL,
        feedback TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP,
        UNIQUE(file_id, user_id)
      )
    `);

    // Create session table for connect-pg-simple
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      )
    `);

    console.log('All tables created successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
    throw error;
  }
}

async function createAdminUser() {
  try {
    const adminUsername = process.argv[2] || 'admin';
    const adminPassword = process.argv[3] || 'admin123';
    const adminEmail = process.argv[4] || 'admin@obview.io';
    const adminName = process.argv[5] || 'Admin User';

    // Check if admin user already exists
    const checkResult = await pool.query('SELECT * FROM users WHERE username = $1', [adminUsername]);
    
    if (checkResult.rows.length > 0) {
      console.log(`Admin user '${adminUsername}' already exists`);
      return;
    }

    // Create admin user
    const hashedPassword = await hashPassword(adminPassword);
    
    await pool.query(
      'INSERT INTO users (username, password, email, name, role) VALUES ($1, $2, $3, $4, $5)',
      [adminUsername, hashedPassword, adminEmail, adminName, 'admin']
    );

    console.log(`Admin user '${adminUsername}' created successfully`);
  } catch (error) {
    console.error('Error creating admin user:', error);
    throw error;
  }
}

async function main() {
  try {
    await createTables();
    await createAdminUser();
    console.log('Setup completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
  } finally {
    try {
      await pool.end();
    } catch (e) {
      console.error('Error closing pool:', e);
    }
  }
}

main();