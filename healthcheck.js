#!/usr/bin/env node

/**
 * OBview.io Health Check Utility
 * 
 * This script checks the application health including:
 * - Database connection
 * - API server access
 * - File system permissions
 */

import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { Pool } = pg;

// Configuration
const config = {
  database: process.env.DATABASE_URL || 'postgresql://obviewuser:tbn123456789@localhost:5432/obview',
  apiUrl: process.env.API_URL || 'http://localhost:5000/api/health',
  uploadDir: process.env.UPLOADS_DIR || path.join(__dirname, 'uploads')
};

async function checkDatabase() {
  console.log('\nChecking database connection...');
  
  const pool = new Pool({ connectionString: config.database });
  
  try {
    const result = await pool.query('SELECT NOW() as time');
    console.log(`✓ Database connection successful (time: ${result.rows[0].time})`);
    
    // Check tables count
    const tablesResult = await pool.query(`
      SELECT COUNT(*) as count FROM pg_tables 
      WHERE schemaname = 'public'
    `);
    
    console.log(`✓ Database contains ${tablesResult.rows[0].count} tables`);
    
    // Check users count
    const usersResult = await pool.query('SELECT COUNT(*) as count FROM users');
    console.log(`✓ Database contains ${usersResult.rows[0].count} users`);
    
    // Check projects count
    const projectsResult = await pool.query('SELECT COUNT(*) as count FROM projects');
    console.log(`✓ Database contains ${projectsResult.rows[0].count} projects`);
    
    await pool.end();
    return true;
  } catch (error) {
    console.log(`✗ Database connection failed: ${error.message}`);
    try {
      await pool.end();
    } catch (e) {
      // Ignore error on close
    }
    return false;
  }
}

function checkApi() {
  console.log('\nChecking API server...');
  
  return new Promise((resolve) => {
    const client = config.apiUrl.startsWith('https') ? https : http;
    
    const req = client.get(config.apiUrl, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            console.log(`✓ API server is responding (status: ${json.status})`);
            console.log(`✓ API server time: ${json.time}`);
            resolve(true);
          } catch (e) {
            console.log(`✗ API response is not valid JSON: ${data}`);
            resolve(false);
          }
        } else {
          console.log(`✗ API server returned status code: ${res.statusCode}`);
          resolve(false);
        }
      });
    });
    
    req.on('error', (error) => {
      console.log(`✗ API server request failed: ${error.message}`);
      resolve(false);
    });
    
    req.end();
  });
}

function checkFileSystem() {
  console.log('\nChecking file system...');
  
  // Check if uploads directory exists
  if (!fs.existsSync(config.uploadDir)) {
    console.log(`✗ Uploads directory does not exist: ${config.uploadDir}`);
    
    // Try to create it
    try {
      fs.mkdirSync(config.uploadDir, { recursive: true });
      console.log(`✓ Created uploads directory: ${config.uploadDir}`);
    } catch (error) {
      console.log(`✗ Failed to create uploads directory: ${error.message}`);
      return false;
    }
  } else {
    console.log(`✓ Uploads directory exists: ${config.uploadDir}`);
  }
  
  // Check write permissions
  try {
    const testFile = path.join(config.uploadDir, '.test-file');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log('✓ Uploads directory is writable');
    return true;
  } catch (error) {
    console.log(`✗ Uploads directory is not writable: ${error.message}`);
    return false;
  }
}

async function runHealthCheck() {
  console.log('OBview.io Health Check Utility');
  console.log('============================\n');
  
  console.log('Configuration:');
  console.log(`- Database URL: ${config.database.replace(/:[^:]*@/, ':***@')}`);
  console.log(`- API URL: ${config.apiUrl}`);
  console.log(`- Uploads Directory: ${config.uploadDir}`);
  
  const dbResult = await checkDatabase();
  const apiResult = await checkApi();
  const fsResult = checkFileSystem();
  
  console.log('\nHealth Check Summary:');
  console.log(`- Database: ${dbResult ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`- API Server: ${apiResult ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`- File System: ${fsResult ? '✓ PASS' : '✗ FAIL'}`);
  
  const overallResult = dbResult && apiResult && fsResult;
  console.log(`\nOverall Status: ${overallResult ? '✓ HEALTHY' : '✗ UNHEALTHY'}`);
  
  if (!overallResult) {
    console.log('\nRecommendations:');
    
    if (!dbResult) {
      console.log('- Check database credentials and connectivity');
      console.log('- Make sure PostgreSQL is running');
      console.log('- Verify DATABASE_URL environment variable');
    }
    
    if (!apiResult) {
      console.log('- Check if the API server is running');
      console.log('- Verify port configuration');
      console.log('- Check API_URL environment variable');
    }
    
    if (!fsResult) {
      console.log('- Check file permissions on the uploads directory');
      console.log('- Make sure the application has write access');
      console.log('- Verify UPLOADS_DIR environment variable');
    }
  }
  
  return overallResult;
}

runHealthCheck().then((healthy) => {
  process.exit(healthy ? 0 : 1);
}).catch((error) => {
  console.error('Error during health check:', error);
  process.exit(1);
});