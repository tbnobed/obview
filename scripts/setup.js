// Database setup and initial admin user creation script
const { Client } = require('pg');
const { scrypt, randomBytes } = require('crypto');
const { promisify } = require('util');
const { config } = require('dotenv');

// Load environment variables from .env file
config();

const scryptAsync = promisify(scrypt);

// Hash password function (same as in auth.ts)
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const buf = await scryptAsync(password, salt, 64);
  return `${buf.toString('hex')}.${salt}`;
}

async function main() {
  // Connection parameters from environment variables
  const dbConnectionString = process.env.DATABASE_URL || 
    'postgresql://postgres:postgres@localhost:5432/mediareview';
  
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
  const adminName = process.env.ADMIN_NAME || 'Administrator';
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
  
  // Connect to the database
  const client = new Client({ connectionString: dbConnectionString });
  
  try {
    await client.connect();
    console.log('Connected to the database');
    
    // Check if admin user already exists
    const checkUser = await client.query('SELECT COUNT(*) FROM "user" WHERE username = $1', [adminUsername]);
    
    if (parseInt(checkUser.rows[0].count, 10) === 0) {
      // Hash the admin password
      const hashedPassword = await hashPassword(adminPassword);
      
      // Insert admin user
      await client.query(
        'INSERT INTO "user" (username, password, email, name, role, "createdAt") VALUES ($1, $2, $3, $4, $5, $6)',
        [adminUsername, hashedPassword, adminEmail, adminName, 'admin', new Date()]
      );
      
      console.log(`Admin user '${adminUsername}' created successfully`);
    } else {
      console.log('Admin user already exists, skipping creation');
    }
    
  } catch (error) {
    console.error('Error setting up database:', error);
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error('Setup script failed:', error);
  process.exit(1);
});