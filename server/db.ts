import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}

// Create PostgreSQL connection pool
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// Create Drizzle ORM instance with the pool and schema
export const db = drizzle(pool, { schema });

// Log database connection information
console.log(`Database connection established: ${process.env.DATABASE_URL.split('@')[1]}`);

// Simple healthcheck function to verify database connectivity
export async function healthcheck() {
  try {
    const result = await pool.query('SELECT NOW() as now');
    return { 
      status: 'healthy', 
      timestamp: result.rows[0].now 
    };
  } catch (error) {
    console.error('Database healthcheck failed:', error);
    return { 
      status: 'unhealthy', 
      error: (error as Error).message 
    };
  }
}

// Function to close all database connections
export async function closeDatabase() {
  try {
    await pool.end();
    console.log('Database connections closed');
  } catch (error) {
    console.error('Error closing database connections:', error);
  }
}

// Setup process handlers to close database connections on exit
process.on('SIGTERM', closeDatabase);
process.on('SIGINT', closeDatabase);