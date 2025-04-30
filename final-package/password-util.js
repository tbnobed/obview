/**
 * OBview.io Password Utility
 * 
 * This script provides utilities for managing user passwords:
 * - Create a new hashed password for use in the database
 * - Verify a password against a hash
 * - Reset a user's password in the database
 */

import crypto from 'crypto';
import { Client } from 'pg';
import readline from 'readline';

// Configuration
const config = {
  user: process.env.DB_USER || 'obviewuser',
  password: process.env.DB_PASSWORD || 'tbn123456789',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'obview',
  port: process.env.DB_PORT || 5432
};

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Hash a password using PBKDF2 with a random salt
 */
async function hashPassword(password) {
  // Generate a random salt
  const salt = crypto.randomBytes(16).toString('hex');
  
  // Hash the password with the salt
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  
  // Return the combined hash and salt
  return `${hash}.${salt}`;
}

/**
 * Verify a password against a stored hash
 */
async function verifyPassword(password, hashedPassword) {
  // Split the stored hash into hash and salt
  const [storedHash, salt] = hashedPassword.split('.');
  
  // Hash the provided password with the same salt
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  
  // Compare the hashes
  return hash === storedHash;
}

/**
 * Generate a hash for a password
 */
async function generateHash() {
  console.log('==== Generate Password Hash ====');
  
  // Get password from user
  const password = await prompt('Enter password to hash: ');
  
  // Hash the password
  const hashedPassword = await hashPassword(password);
  
  console.log(`\nGenerated hash: ${hashedPassword}`);
  console.log('\nYou can use this hash in the database for a user\'s password field');
}

/**
 * Reset a user's password in the database
 */
async function resetPassword() {
  console.log('==== Reset User Password ====');
  
  try {
    // Connect to database
    const client = new Client(config);
    await client.connect();
    
    // Get username from user
    const username = await prompt('Enter username: ');
    
    // Check if user exists
    const userResult = await client.query('SELECT id, username FROM users WHERE username = $1', [username]);
    
    if (userResult.rows.length === 0) {
      console.log(`User "${username}" not found in the database`);
      await client.end();
      return;
    }
    
    const user = userResult.rows[0];
    console.log(`Found user: ${user.username} (ID: ${user.id})`);
    
    // Get new password
    const password = await prompt('Enter new password: ');
    
    // Confirm password
    const confirmPassword = await prompt('Confirm new password: ');
    
    if (password !== confirmPassword) {
      console.log('Passwords do not match');
      await client.end();
      return;
    }
    
    // Hash the password
    const hashedPassword = await hashPassword(password);
    
    // Update the user's password
    await client.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, user.id]);
    
    console.log(`\nPassword updated successfully for user "${username}"`);
    
    await client.end();
  } catch (err) {
    console.error(`Error: ${err.message}`);
  }
}

/**
 * Check a password against a hash
 */
async function checkPassword() {
  console.log('==== Check Password ====');
  
  const passwordToCheck = await prompt('Enter password to check: ');
  const hash = await prompt('Enter password hash: ');
  
  const isValid = await verifyPassword(passwordToCheck, hash);
  
  console.log(`\nPassword is ${isValid ? 'VALID' : 'INVALID'}`);
}

/**
 * Prompt for user input
 */
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Main function
 */
async function main() {
  console.log('OBview.io Password Utility');
  console.log('=========================\n');
  
  console.log('Choose an option:');
  console.log('1) Generate a password hash');
  console.log('2) Reset a user\'s password');
  console.log('3) Check a password against a hash');
  
  const choice = await prompt('\nEnter choice (1-3): ');
  
  switch (choice) {
    case '1':
      await generateHash();
      break;
    case '2':
      await resetPassword();
      break;
    case '3':
      await checkPassword();
      break;
    default:
      console.log('Invalid choice');
  }
  
  // Close readline interface
  rl.close();
}

// Run the script
main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});