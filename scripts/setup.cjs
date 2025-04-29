/**
 * Admin user setup script for OBview.io
 * 
 * This is a CommonJS script that will create an admin user
 * if one doesn't already exist in the database.
 */

const crypto = require('crypto');
const { Pool } = require('pg');

// Get database connection settings from environment variables
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 5000
});

// Function to hash passwords
async function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${derivedKey.toString('hex')}.${salt}`);
    });
  });
}

// Main function
async function main() {
  let client;
  
  try {
    client = await pool.connect();
    
    // Check if admin user already exists
    const checkResult = await client.query(
      'SELECT COUNT(*) FROM users WHERE username = $1',
      ['admin']
    );
    
    const userExists = parseInt(checkResult.rows[0].count) > 0;
    
    if (!userExists) {
      console.log('Admin user does not exist. Creating...');
      
      // Prepare a pre-hashed password (this is 'admin123' hashed)
      // In production, you would use hashPassword() to hash a new password
      const hashedPassword = 'a7b13d2b2b89eacba6e3d2c10b08f7d0cf5ba0a79d0b99d27e8912613f087d6bfe21ef50c43709a97269d9ff7c779e17adf12d2a6722a7e6d30b70a9d87e0bde.7c3cde42af095f81af3fc6c5a95bf273';
      
      // Insert admin user
      await client.query(
        'INSERT INTO users (username, password, email, name, role, "createdAt") VALUES ($1, $2, $3, $4, $5, NOW())',
        ['admin', hashedPassword, 'admin@example.com', 'Administrator', 'admin']
      );
      
      console.log('Admin user created successfully');
    } else {
      console.log('Admin user already exists, skipping creation');
    }
    
    return true;
  } catch (error) {
    console.error('Error setting up admin user:', error);
    return false;
  } finally {
    if (client) {
      client.release();
    }
    
    // Close pool
    await pool.end();
  }
}

// Run main function
main()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });