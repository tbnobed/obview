#!/usr/bin/env node

// Ubuntu 24.04 compatible launcher for OBview
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Create global __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
globalThis.__dirname = __dirname;
globalThis.__filename = __filename;

// Paths to check for server entry point
const possiblePaths = [
  join(__dirname, 'dist', 'index.js'),
  join(__dirname, 'server', 'index.js'),
  join(__dirname, 'index.js')
];

// Find the server entry point
let serverPath = null;
for (const path of possiblePaths) {
  if (fs.existsSync(path)) {
    serverPath = path;
    break;
  }
}

if (!serverPath) {
  console.error('Error: Could not find server entry point. Build the application first.');
  process.exit(1);
}

// Set production environment
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

console.log(`Starting OBview server from ${serverPath}...`);

// Import and run the server
import(serverPath).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});