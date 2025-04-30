/**
 * OBview.io Health Check Utility
 * 
 * This script checks the application health including:
 * - Database connection
 * - API server access
 * - File system permissions
 */

import { exec } from 'child_process';
import fs from 'fs';
import http from 'http';
import { promisify } from 'util';
import { Client } from 'pg';

const execAsync = promisify(exec);

// Configuration
const config = {
  database: {
    user: process.env.DB_USER || 'obviewuser',
    password: process.env.DB_PASSWORD || 'tbn123456789',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'obview',
    port: process.env.DB_PORT || 5432
  },
  api: {
    host: process.env.API_HOST || 'localhost',
    port: process.env.API_PORT || 5000
  },
  appDir: process.env.APP_DIR || '/opt/obview'
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

/**
 * Check database connection
 */
async function checkDatabase() {
  console.log(`\n${colors.blue}Checking database connection...${colors.reset}`);
  
  const client = new Client(config.database);
  
  try {
    await client.connect();
    
    // Check if we can query the database
    const result = await client.query('SELECT NOW() as now');
    
    console.log(`${colors.green}✓ Database connection successful${colors.reset}`);
    console.log(`${colors.green}✓ Server time: ${result.rows[0].now}${colors.reset}`);
    
    // Check database tables
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    
    if (tablesResult.rows.length === 0) {
      console.log(`${colors.red}✕ No tables found in database${colors.reset}`);
    } else {
      console.log(`${colors.green}✓ Database tables: ${tablesResult.rows.length} found${colors.reset}`);
      tablesResult.rows.forEach(row => {
        console.log(`  - ${row.table_name}`);
      });
    }
    
    // Check users
    const usersResult = await client.query(`
      SELECT COUNT(*) as count FROM users;
    `).catch(err => {
      console.log(`${colors.red}✕ Cannot query users table: ${err.message}${colors.reset}`);
      return { rows: [{ count: 0 }] };
    });
    
    console.log(`${colors.green}✓ User accounts: ${usersResult.rows[0].count}${colors.reset}`);
    
    // Check projects
    const projectsResult = await client.query(`
      SELECT COUNT(*) as count FROM projects;
    `).catch(err => {
      console.log(`${colors.red}✕ Cannot query projects table: ${err.message}${colors.reset}`);
      return { rows: [{ count: 0 }] };
    });
    
    console.log(`${colors.green}✓ Projects: ${projectsResult.rows[0].count}${colors.reset}`);
    
    // Check files
    const filesResult = await client.query(`
      SELECT COUNT(*) as count FROM files;
    `).catch(err => {
      console.log(`${colors.red}✕ Cannot query files table: ${err.message}${colors.reset}`);
      return { rows: [{ count: 0 }] };
    });
    
    console.log(`${colors.green}✓ Files: ${filesResult.rows[0].count}${colors.reset}`);
    
    return true;
  } catch (err) {
    console.log(`${colors.red}✕ Database connection failed: ${err.message}${colors.reset}`);
    console.log(`${colors.yellow}ℹ Hint: Check that PostgreSQL is running and credentials are correct${colors.reset}`);
    console.log(`${colors.yellow}ℹ Connection details: ${config.database.user}@${config.database.host}:${config.database.port}/${config.database.database}${colors.reset}`);
    return false;
  } finally {
    await client.end();
  }
}

/**
 * Check API server
 */
function checkApi() {
  console.log(`\n${colors.blue}Checking API server...${colors.reset}`);
  
  return new Promise((resolve) => {
    const url = `http://${config.api.host}:${config.api.port}/`;
    
    const req = http.get(url, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log(`${colors.green}✓ API server is running (Status: ${res.statusCode})${colors.reset}`);
        resolve(true);
      } else {
        console.log(`${colors.red}✕ API server returned unexpected status code: ${res.statusCode}${colors.reset}`);
        resolve(false);
      }
    });
    
    req.on('error', (err) => {
      console.log(`${colors.red}✕ Failed to connect to API server: ${err.message}${colors.reset}`);
      console.log(`${colors.yellow}ℹ Hint: Check that the server is running on ${config.api.host}:${config.api.port}${colors.reset}`);
      console.log(`${colors.yellow}ℹ Verify with: systemctl status obview${colors.reset}`);
      resolve(false);
    });
    
    req.setTimeout(5000, () => {
      req.destroy();
      console.log(`${colors.red}✕ API server connection timed out${colors.reset}`);
      resolve(false);
    });
  });
}

/**
 * Check file system
 */
async function checkFileSystem() {
  console.log(`\n${colors.blue}Checking file system...${colors.reset}`);
  
  // Check application directory
  try {
    const appDirStats = fs.statSync(config.appDir);
    if (appDirStats.isDirectory()) {
      console.log(`${colors.green}✓ Application directory exists: ${config.appDir}${colors.reset}`);
    } else {
      console.log(`${colors.red}✕ Application path is not a directory: ${config.appDir}${colors.reset}`);
      return false;
    }
  } catch (err) {
    console.log(`${colors.red}✕ Cannot access application directory: ${config.appDir} - ${err.message}${colors.reset}`);
    return false;
  }
  
  // Check uploads directory
  const uploadsDir = `${config.appDir}/uploads`;
  try {
    const uploadsDirStats = fs.statSync(uploadsDir);
    if (uploadsDirStats.isDirectory()) {
      console.log(`${colors.green}✓ Uploads directory exists: ${uploadsDir}${colors.reset}`);
      
      // Check if directory is writable
      try {
        const testFile = `${uploadsDir}/.healthcheck_test`;
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        console.log(`${colors.green}✓ Uploads directory is writable${colors.reset}`);
      } catch (err) {
        console.log(`${colors.red}✕ Uploads directory is not writable: ${err.message}${colors.reset}`);
        return false;
      }
      
      // Count files in uploads directory
      const files = fs.readdirSync(uploadsDir);
      console.log(`${colors.green}✓ Uploads directory contains ${files.length} files/directories${colors.reset}`);
    } else {
      console.log(`${colors.red}✕ Uploads path is not a directory: ${uploadsDir}${colors.reset}`);
      return false;
    }
  } catch (err) {
    console.log(`${colors.red}✕ Cannot access uploads directory: ${uploadsDir} - ${err.message}${colors.reset}`);
    console.log(`${colors.yellow}ℹ Hint: Create the directory with: mkdir -p ${uploadsDir}${colors.reset}`);
    return false;
  }
  
  // Check disk space
  try {
    const { stdout } = await execAsync(`df -h ${config.appDir} | awk 'NR==2{print $5,$4}'`);
    const [usedPercent, available] = stdout.trim().split(' ');
    
    console.log(`${colors.green}✓ Disk usage: ${usedPercent} used, ${available} available${colors.reset}`);
    
    if (usedPercent.replace('%', '') > 90) {
      console.log(`${colors.yellow}⚠ Warning: Disk usage is high (${usedPercent})${colors.reset}`);
    }
  } catch (err) {
    console.log(`${colors.red}✕ Failed to check disk space: ${err.message}${colors.reset}`);
  }
  
  return true;
}

/**
 * Run the health check
 */
async function runHealthCheck() {
  console.log(`${colors.magenta}===== OBview.io Health Check =====${colors.reset}`);
  console.log(`${colors.yellow}Date: ${new Date().toISOString()}${colors.reset}`);
  
  // Get Node.js version
  console.log(`${colors.blue}Node.js version: ${process.version}${colors.reset}`);
  
  // Check system components
  const dbOk = await checkDatabase();
  const apiOk = await checkApi();
  const fsOk = await checkFileSystem();
  
  console.log(`\n${colors.magenta}===== Health Check Summary =====${colors.reset}`);
  console.log(`Database: ${dbOk ? colors.green + '✓ OK' : colors.red + '✕ FAIL'}${colors.reset}`);
  console.log(`API Server: ${apiOk ? colors.green + '✓ OK' : colors.red + '✕ FAIL'}${colors.reset}`);
  console.log(`File System: ${fsOk ? colors.green + '✓ OK' : colors.red + '✕ FAIL'}${colors.reset}`);
  
  const overallStatus = dbOk && apiOk && fsOk;
  
  console.log(`\nOverall Status: ${overallStatus ? colors.green + '✓ HEALTHY' : colors.red + '✕ UNHEALTHY'}${colors.reset}`);
  
  if (!overallStatus) {
    console.log(`\n${colors.yellow}Recommendations:${colors.reset}`);
    
    if (!dbOk) {
      console.log(`${colors.yellow}- Check PostgreSQL is running: systemctl status postgresql${colors.reset}`);
      console.log(`${colors.yellow}- Verify database credentials in environment variables${colors.reset}`);
    }
    
    if (!apiOk) {
      console.log(`${colors.yellow}- Check OBview service is running: systemctl status obview${colors.reset}`);
      console.log(`${colors.yellow}- Check server logs: journalctl -u obview${colors.reset}`);
    }
    
    if (!fsOk) {
      console.log(`${colors.yellow}- Check directory permissions: ls -la ${config.appDir}${colors.reset}`);
      console.log(`${colors.yellow}- Ensure the application has write access to the uploads directory${colors.reset}`);
    }
  }
  
  return overallStatus;
}

// Run the health check
runHealthCheck()
  .then(healthy => {
    process.exit(healthy ? 0 : 1);
  })
  .catch(err => {
    console.error(`${colors.red}Health check failed with error: ${err.message}${colors.reset}`);
    process.exit(1);
  });