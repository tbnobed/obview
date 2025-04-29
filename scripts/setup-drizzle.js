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

// Check if drizzle.config.ts exists
if (!fs.existsSync(DRIZZLE_CONFIG_PATH)) {
  console.error('Error: drizzle.config.ts not found!');
  process.exit(1);
}

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

// Get the configured output directory from drizzle.config.ts
try {
  // Read the config file to determine the output directory
  const configContent = fs.readFileSync(DRIZZLE_CONFIG_PATH, 'utf8');
  
  // Extract the out path using a simple regex (this is a basic approach)
  const outMatch = configContent.match(/out\s*:\s*['"](.+?)['"]/);
  
  if (outMatch && outMatch[1]) {
    const configuredOutDir = path.join(__dirname, '..', outMatch[1]);
    console.log(`Detected output directory from config: ${configuredOutDir}`);
    
    // Create the configured output directory if it doesn't exist
    if (!fs.existsSync(configuredOutDir)) {
      console.log(`Creating configured output directory: ${configuredOutDir}`);
      fs.mkdirSync(configuredOutDir, { recursive: true });
    }
    
    // Create a sample migration file if the directory is empty
    const files = fs.readdirSync(configuredOutDir);
    if (files.length === 0) {
      console.log('Output directory is empty, creating placeholder...');
      const placeholderContent = `
/**
 * This is a placeholder migration file generated during the Docker build process.
 * Actual migrations will be generated when the application runs.
 */
      `.trim();
      
      fs.writeFileSync(
        path.join(configuredOutDir, '0000_placeholder.sql'),
        placeholderContent
      );
    }
  }
} catch (error) {
  console.warn(`Warning: Could not detect output directory: ${error.message}`);
}

// Try to run drizzle-kit generate if available
try {
  console.log('Attempting to generate migrations...');
  execSync('npx drizzle-kit generate:pg', { 
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  console.log('Successfully generated migrations');
} catch (error) {
  console.warn(`Warning: Failed to generate migrations: ${error.message}`);
  console.warn('This is not critical, migrations can be generated at runtime.');
}

console.log('Drizzle migration setup complete');