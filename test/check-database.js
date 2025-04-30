/**
 * OBview.io Database Check Utility
 * 
 * This script checks the database connection and schema
 * to ensure everything is set up correctly.
 */

import { Client } from 'pg';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

// Configuration
const config = {
  user: process.env.DB_USER || 'obviewuser',
  password: process.env.DB_PASSWORD || 'tbn123456789',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'obview',
  port: process.env.DB_PORT || 5432
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
  console.log(`${colors.blue}===== OBview.io Database Check =====${colors.reset}`);
  console.log(`${colors.yellow}Date: ${new Date().toISOString()}${colors.reset}`);
  
  console.log(`\n${colors.blue}Checking database connection...${colors.reset}`);
  console.log(`${colors.yellow}Connection info: ${config.user}@${config.host}:${config.port}/${config.database}${colors.reset}`);
  
  const client = new Client(config);
  
  try {
    await client.connect();
    console.log(`${colors.green}✓ Connected to database${colors.reset}`);
    
    // Check PostgreSQL version
    const versionResult = await client.query('SELECT version();');
    console.log(`${colors.green}✓ PostgreSQL version: ${versionResult.rows[0].version.split(',')[0]}${colors.reset}`);
    
    // Check tables
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    
    if (tablesResult.rows.length === 0) {
      console.log(`${colors.red}✕ No tables found in database${colors.reset}`);
      
      // Ask if user wants to initialize the database
      const answer = await getInput('Do you want to initialize the database with schema? (y/n): ');
      
      if (answer.toLowerCase() === 'y') {
        await initializeDatabase(client);
      } else {
        console.log(`${colors.yellow}Database initialization skipped${colors.reset}`);
      }
    } else {
      console.log(`${colors.green}✓ Found ${tablesResult.rows.length} tables${colors.reset}`);
      
      for (const row of tablesResult.rows) {
        // Get row count for each table
        const countResult = await client.query(`SELECT COUNT(*) FROM ${row.table_name};`);
        console.log(`  - ${row.table_name} (${countResult.rows[0].count} rows)`);
      }
      
      await checkSchemaIntegrity(client, tablesResult.rows.map(r => r.table_name));
    }
    
    console.log(`\n${colors.green}Database check completed${colors.reset}`);
    
  } catch (err) {
    console.log(`${colors.red}✕ Database connection failed: ${err.message}${colors.reset}`);
    
    if (err.code === 'ECONNREFUSED') {
      console.log(`${colors.yellow}ℹ Hint: Check that PostgreSQL is running and accessible${colors.reset}`);
    } else if (err.code === '28P01') {
      console.log(`${colors.yellow}ℹ Hint: Check your username and password${colors.reset}`);
    } else if (err.code === '3D000') {
      console.log(`${colors.yellow}ℹ Hint: Database "${config.database}" doesn't exist. Create it with:${colors.reset}`);
      console.log(`${colors.cyan}  sudo -u postgres createdb ${config.database}${colors.reset}`);
      
      // Ask if user wants to create the database
      const answer = await getInput('Do you want to create the database now? (y/n): ');
      
      if (answer.toLowerCase() === 'y') {
        await createDatabase();
      }
    }
  } finally {
    await client.end();
  }
}

/**
 * Check schema integrity by comparing column names
 */
async function checkSchemaIntegrity(client, tables) {
  console.log(`\n${colors.blue}Checking schema integrity...${colors.reset}`);
  
  // Known potential issues with column names
  const knownIssues = {
    'user_id': 'userId',
    'created_by_id': 'createdById',
    'uploaded_by_id': 'uploadedById',
    'created_at': 'createdAt',
    'updated_at': 'updatedAt',
    'file_id': 'fileId',
    'file_path': 'filePath',
    'file_size': 'fileSize',
    'file_type': 'fileType',
    'project_id': 'projectId',
    'parent_id': 'parentId',
    'is_resolved': 'isResolved',
    'is_latest_version': 'isLatestVersion',
  };
  
  let issues = [];
  
  for (const table of tables) {
    // Get column information
    const columnResult = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1;
    `, [table]);
    
    for (const col of columnResult.rows) {
      // Check for snake_case columns that should be camelCase
      for (const [snakeCase, camelCase] of Object.entries(knownIssues)) {
        if (col.column_name === snakeCase) {
          issues.push({
            table,
            currentName: snakeCase,
            recommendedName: camelCase
          });
        }
      }
    }
  }
  
  if (issues.length > 0) {
    console.log(`${colors.yellow}⚠ Found ${issues.length} potential schema naming issues:${colors.reset}`);
    
    for (const issue of issues) {
      console.log(`  - Table: ${issue.table}, Column: ${issue.currentName} (should be ${issue.recommendedName})`);
    }
    
    console.log(`\n${colors.yellow}ℹ The application code expects camelCase column names.${colors.reset}`);
    console.log(`${colors.yellow}ℹ Consider renaming these columns or adjusting the code to handle snake_case.${colors.reset}`);
    
    // Generate SQL to fix issues
    console.log(`\n${colors.blue}SQL to fix column naming issues:${colors.reset}`);
    console.log(colors.cyan);
    
    for (const issue of issues) {
      console.log(`ALTER TABLE ${issue.table} RENAME COLUMN ${issue.currentName} TO ${issue.recommendedName};`);
    }
    
    console.log(colors.reset);
    
    // Ask if user wants to apply the fixes
    const answer = await getInput('Do you want to apply these column renames now? (y/n): ');
    
    if (answer.toLowerCase() === 'y') {
      console.log(`\n${colors.blue}Applying column renames...${colors.reset}`);
      
      try {
        // Start a transaction
        await client.query('BEGIN');
        
        for (const issue of issues) {
          console.log(`Renaming ${issue.table}.${issue.currentName} to ${issue.recommendedName}...`);
          await client.query(`ALTER TABLE ${issue.table} RENAME COLUMN ${issue.currentName} TO ${issue.recommendedName};`);
        }
        
        // Commit the transaction
        await client.query('COMMIT');
        console.log(`${colors.green}✓ Column renames applied successfully${colors.reset}`);
      } catch (err) {
        // Rollback the transaction on error
        await client.query('ROLLBACK');
        console.log(`${colors.red}✕ Failed to apply column renames: ${err.message}${colors.reset}`);
      }
    } else {
      console.log(`${colors.yellow}Column renames skipped${colors.reset}`);
    }
  } else {
    console.log(`${colors.green}✓ No schema naming issues found${colors.reset}`);
  }
}

/**
 * Initialize database with schema
 */
async function initializeDatabase(client) {
  console.log(`\n${colors.blue}Initializing database with schema...${colors.reset}`);
  
  // Look for schema file
  const schemaPath = path.resolve(process.cwd(), 'database-schema.sql');
  
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    const statements = schema.split(';').filter(line => line.trim() !== '');
    
    try {
      // Begin transaction
      await client.query('BEGIN');
      
      console.log(`${colors.yellow}Executing schema script with ${statements.length} statements${colors.reset}`);
      
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i].trim();
        if (stmt) {
          await client.query(stmt + ';');
        }
      }
      
      // Commit transaction
      await client.query('COMMIT');
      
      console.log(`${colors.green}✓ Schema created successfully${colors.reset}`);
      
      // Ask about creating admin user
      const answer = await getInput('Do you want to create an admin user? (y/n): ');
      
      if (answer.toLowerCase() === 'y') {
        await createAdminUser(client);
      }
      
      return true;
    } catch (err) {
      // Rollback on error
      await client.query('ROLLBACK');
      
      console.log(`${colors.red}✕ Failed to create schema: ${err.message}${colors.reset}`);
      return false;
    }
  } else {
    console.log(`${colors.red}✕ Schema file not found: ${schemaPath}${colors.reset}`);
    console.log(`${colors.yellow}ℹ Please ensure database-schema.sql is present in the current directory${colors.reset}`);
    return false;
  }
}

/**
 * Create database
 */
async function createDatabase() {
  console.log(`\n${colors.blue}Creating database...${colors.reset}`);
  
  try {
    // Connect to default 'postgres' database to create our target database
    const pgClient = new Client({
      ...config,
      database: 'postgres'
    });
    
    await pgClient.connect();
    
    // Create the database
    await pgClient.query(`CREATE DATABASE ${config.database};`);
    await pgClient.end();
    
    console.log(`${colors.green}✓ Database "${config.database}" created successfully${colors.reset}`);
    
    // Now connect to the new database and initialize it
    const newClient = new Client(config);
    await newClient.connect();
    
    await initializeDatabase(newClient);
    
    await newClient.end();
    
    return true;
  } catch (err) {
    console.log(`${colors.red}✕ Failed to create database: ${err.message}${colors.reset}`);
    return false;
  }
}

/**
 * Create admin user
 */
async function createAdminUser(client) {
  console.log(`\n${colors.blue}Creating admin user...${colors.reset}`);
  
  // Default admin credentials
  const username = await getInput('Enter admin username (default: admin): ') || 'admin';
  const email = await getInput('Enter admin email: ');
  const name = await getInput('Enter admin name: ');
  const password = await getInput('Enter admin password (default: admin): ') || 'admin';
  
  // Hash the password (simple hash for example purposes)
  const crypto = await import('crypto');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  const hashedPassword = hash + '.' + salt;
  
  try {
    const result = await client.query(`
      INSERT INTO users (username, email, name, password, role, "createdAt")
      VALUES ($1, $2, $3, $4, 'admin', NOW())
      RETURNING id;
    `, [username, email, name, hashedPassword]);
    
    console.log(`${colors.green}✓ Admin user created successfully with ID: ${result.rows[0].id}${colors.reset}`);
    return true;
  } catch (err) {
    console.log(`${colors.red}✕ Failed to create admin user: ${err.message}${colors.reset}`);
    return false;
  }
}

/**
 * Get user input from console
 */
function getInput(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Run the check
checkDatabase().catch(err => {
  console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
  process.exit(1);
});