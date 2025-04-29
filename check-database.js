#!/usr/bin/env node

/**
 * OBview.io Database Check Utility
 * 
 * This script checks the database connection and schema
 * to ensure everything is set up correctly.
 */

import pg from 'pg';
const { Pool } = pg;

// Configuration
const dbUrl = process.env.DATABASE_URL || 'postgresql://obviewuser:tbn123456789@localhost:5432/obview';

// Tables that should exist in the database
const requiredTables = [
  'users',
  'projects',
  'project_users',
  'files',
  'comments',
  'activity_logs',
  'invitations',
  'approvals'
];

// Required columns for each table
const requiredColumns = {
  users: ['id', 'username', 'password', 'email', 'role', 'createdAt'],
  projects: ['id', 'name', 'description', 'createdAt', 'createdById'],
  project_users: ['id', 'projectId', 'userId', 'role'],
  files: ['id', 'filename', 'filepath', 'projectId', 'uploadedBy'],
  comments: ['id', 'content', 'fileId', 'userId', 'timestamp'],
  activity_logs: ['id', 'userId', 'action', 'projectId', 'resourceId', 'resourceType'],
  invitations: ['id', 'email', 'token', 'projectId', 'role', 'status'],
  approvals: ['id', 'fileId', 'userId', 'status', 'feedback']
};

async function checkDatabase() {
  console.log('OBview.io Database Check Utility');
  console.log('================================\n');
  
  console.log(`Using database URL: ${dbUrl.replace(/:[^:]*@/, ':***@')}`);
  
  const pool = new Pool({ connectionString: dbUrl });
  
  try {
    // Test connection
    console.log('\nTesting database connection...');
    const connectionTest = await pool.query('SELECT NOW() as time');
    console.log(`✓ Connected to database at ${connectionTest.rows[0].time}`);
    
    // Check for required tables
    console.log('\nChecking for required tables...');
    const tablesQuery = await pool.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public'
    `);
    
    const existingTables = tablesQuery.rows.map(row => row.tablename);
    
    let missingTables = 0;
    for (const table of requiredTables) {
      if (existingTables.includes(table)) {
        console.log(`✓ Table '${table}' exists`);
      } else {
        console.log(`✗ Table '${table}' is missing`);
        missingTables++;
      }
    }
    
    if (missingTables > 0) {
      console.log(`\n✗ Missing ${missingTables} tables. Please run the database schema script.`);
      pool.end();
      return;
    }
    
    // Check for required columns in each table
    console.log('\nChecking table columns...');
    
    for (const table of requiredTables) {
      console.log(`\nColumns for table '${table}':`);
      
      const columnsQuery = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1
      `, [table]);
      
      const existingColumns = columnsQuery.rows.map(row => row.column_name);
      
      let missingColumns = 0;
      for (const column of requiredColumns[table]) {
        if (existingColumns.includes(column)) {
          console.log(`✓ Column '${column}' exists`);
        } else {
          // Check for camelCase/snake_case variations
          const camelCase = column;
          const snakeCase = column.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
          
          if (existingColumns.includes(snakeCase)) {
            console.log(`✓ Column '${column}' exists as '${snakeCase}'`);
          } else {
            console.log(`✗ Column '${column}' is missing`);
            missingColumns++;
          }
        }
      }
      
      if (missingColumns > 0) {
        console.log(`✗ Table '${table}' is missing ${missingColumns} required columns.`);
      }
    }
    
    // Check for admin user
    console.log('\nChecking for admin user...');
    const userCheck = await pool.query(`
      SELECT id, username, role FROM users WHERE role = 'admin' LIMIT 1
    `);
    
    if (userCheck.rows.length > 0) {
      console.log(`✓ Admin user exists: ${userCheck.rows[0].username} (ID: ${userCheck.rows[0].id})`);
    } else {
      console.log('✗ No admin user found. You should create one.');
    }
    
    // Count records in tables
    console.log('\nCounting records in tables:');
    for (const table of requiredTables) {
      const countQuery = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`- ${table}: ${countQuery.rows[0].count} records`);
    }
    
    console.log('\nDatabase check completed.');
    
  } catch (error) {
    console.error('\n✗ Error checking database:', error.message);
    if (error.message.includes('does not exist')) {
      console.log('\nSuggestion: The database schema may not be properly installed.');
      console.log('Run the database schema script to create the required tables:');
      console.log('psql -U obviewuser -h localhost -d obview -f database-schema.sql');
    } else if (error.message.includes('password authentication failed')) {
      console.log('\nSuggestion: Check your database credentials.');
    } else if (error.message.includes('connect ECONNREFUSED')) {
      console.log('\nSuggestion: Make sure PostgreSQL is running.');
    }
  } finally {
    await pool.end();
  }
}

checkDatabase().catch(console.error);