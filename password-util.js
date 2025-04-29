#!/usr/bin/env node

/**
 * OBview.io Password Utility
 * 
 * This script provides utilities for managing user passwords:
 * - Create a new hashed password for use in the database
 * - Verify a password against a hash
 * - Reset a user's password in the database
 */

import crypto from 'crypto';
import readline from 'readline';
import pg from 'pg';
import { promisify } from 'util';

const { Pool } = pg;

// Password hashing function
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await promisify(crypto.scrypt)(password, salt, 64);
  return `${hash.toString('hex')}.${salt}`;
}

// Password verification function
async function verifyPassword(password, hashedPassword) {
  const [hash, salt] = hashedPassword.split('.');
  const hashBuffer = Buffer.from(hash, 'hex');
  const suppliedHashBuffer = await promisify(crypto.scrypt)(password, salt, 64);
  return crypto.timingSafeEqual(hashBuffer, suppliedHashBuffer);
}

// Create read line interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Prompt for input
const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Generate a hashed password
async function generateHash() {
  const password = await question('Enter password to hash: ');
  const hashedPassword = await hashPassword(password);
  console.log('\nHashed password:');
  console.log(hashedPassword);
}

// Reset a user's password in the database
async function resetPassword() {
  try {
    const username = await question('Enter username: ');
    const newPassword = await question('Enter new password: ');
    
    // Connect to database
    const connectionString = await question('Enter database connection string (or press Enter for default postgresql://obviewuser:tbn123456789@localhost:5432/obview): ');
    const dbUrl = connectionString || 'postgresql://obviewuser:tbn123456789@localhost:5432/obview';
    
    const pool = new Pool({ connectionString: dbUrl });
    
    // Check if user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    
    if (userCheck.rows.length === 0) {
      console.error(`\nError: User '${username}' not found`);
      return;
    }
    
    // Update password
    const hashedPassword = await hashPassword(newPassword);
    await pool.query('UPDATE users SET password = $1 WHERE username = $2', [hashedPassword, username]);
    
    console.log(`\nPassword for user '${username}' has been updated successfully`);
    
    // Close the database connection
    await pool.end();
  } catch (error) {
    console.error('\nError:', error.message);
  }
}

// Verify a password
async function checkPassword() {
  const password = await question('Enter password to verify: ');
  const hash = await question('Enter hash to verify against: ');
  
  try {
    const isValid = await verifyPassword(password, hash);
    console.log(`\nPassword verification: ${isValid ? 'VALID' : 'INVALID'}`);
  } catch (error) {
    console.error('\nError verifying password:', error.message);
  }
}

// Main function
async function main() {
  console.log('OBview.io Password Utility');
  console.log('=========================\n');
  
  console.log('1. Generate hashed password');
  console.log('2. Reset user password in database');
  console.log('3. Verify password against hash');
  console.log('4. Exit\n');
  
  const choice = await question('Select an option (1-4): ');
  
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
    case '4':
      console.log('\nExiting...');
      break;
    default:
      console.log('\nInvalid option');
      break;
  }
  
  rl.close();
}

main().catch(console.error);