// Script to set up initial admin user
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Use appropriate database driver based on environment
let Pool;

if (process.env.IS_DOCKER === 'true') {
  // Use PostgreSQL driver for Docker environment
  const { Pool: PgPool } = require('pg');
  Pool = PgPool;
} else {
  // Use Neon serverless driver for cloud environment
  const { Pool: NeonPool } = require('@neondatabase/serverless');
  Pool = NeonPool;
}

// Environment variables
const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Administrator';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';

async function hashPassword(password) {
  // Generate a salt
  const salt = crypto.randomBytes(16).toString('hex');
  
  // Hash the password with the salt
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  
  // Return the hashed password with salt
  return `${hash}.${salt}`;
}

async function main() {
  if (!DATABASE_URL) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('Connecting to database...');
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    // Check if admin user already exists
    const existingUserResult = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR email = $2',
      [ADMIN_USERNAME, ADMIN_EMAIL]
    );
    
    if (existingUserResult.rows.length > 0) {
      console.log('Admin user already exists, skipping creation');
      return;
    }
    
    // Hash the password
    const hashedPassword = await hashPassword(ADMIN_PASSWORD);
    
    // Create admin user
    console.log(`Creating admin user: ${ADMIN_USERNAME}`);
    await pool.query(
      'INSERT INTO users (username, password, email, name, role, "createdAt") VALUES ($1, $2, $3, $4, $5, NOW())',
      [ADMIN_USERNAME, hashedPassword, ADMIN_EMAIL, ADMIN_NAME, 'admin']
    );
    
    console.log('Admin user created successfully');
  } catch (error) {
    console.error('Error creating admin user:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the script
main()
  .then(() => {
    console.log('Setup completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Setup failed:', error);
    process.exit(1);
  });