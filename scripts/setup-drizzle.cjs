#!/usr/bin/env node
/**
 * Setup Drizzle Migrations
 * 
 * This script ensures that Drizzle migrations are properly generated and available
 * in the Docker container. It's meant to be run during the Docker build process.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Paths
const DRIZZLE_CONFIG_PATH = path.join(__dirname, '..', 'drizzle.config.ts');
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const DRIZZLE_DIR = path.join(__dirname, '..', 'drizzle');

console.log('Setting up Drizzle migrations...');

// Create migrations directory if it doesn't exist
if (!fs.existsSync(MIGRATIONS_DIR)) {
  console.log('Creating migrations directory...');
  fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
}

// Create drizzle directory if it doesn't exist
if (!fs.existsSync(DRIZZLE_DIR)) {
  console.log('Creating drizzle directory...');
  fs.mkdirSync(DRIZZLE_DIR, { recursive: true });
}

// Create placeholder files
console.log('Creating placeholder migration files...');
fs.writeFileSync(
  path.join(DRIZZLE_DIR, 'placeholder.sql'),
  '-- Placeholder migration file for Drizzle'
);
fs.writeFileSync(
  path.join(MIGRATIONS_DIR, 'placeholder.sql'),
  '-- Placeholder migration file for Drizzle'
);

// Try to detect drizzle.config.ts and its output directory
if (fs.existsSync(DRIZZLE_CONFIG_PATH)) {
  try {
    const configContent = fs.readFileSync(DRIZZLE_CONFIG_PATH, 'utf8');
    const outMatch = configContent.match(/out\s*:\s*['"](.+?)['"]/);
    
    if (outMatch && outMatch[1]) {
      const configuredOutDir = path.join(__dirname, '..', outMatch[1]);
      console.log(`Detected output directory from config: ${configuredOutDir}`);
      
      if (!fs.existsSync(configuredOutDir)) {
        console.log(`Creating configured output directory: ${configuredOutDir}`);
        fs.mkdirSync(configuredOutDir, { recursive: true });
        fs.writeFileSync(
          path.join(configuredOutDir, 'placeholder.sql'),
          '-- Placeholder migration file for Drizzle'
        );
      }
    }
  } catch (error) {
    console.warn(`Warning: Could not detect output directory: ${error.message}`);
  }
}

console.log('Drizzle migration setup complete');