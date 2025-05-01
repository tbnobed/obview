import * as schema from "@shared/schema";

// Check if we're running in Docker/production environment
const isDocker = process.env.IS_DOCKER === 'true' || process.env.NODE_ENV === 'production';

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Initialize database connection based on environment
console.log(`Database connection mode: ${isDocker ? 'PostgreSQL (Docker/Production)' : 'Neon Serverless (Development)'}`);

// Initialize Pool and db with placeholders (will be properly set by async init)
let pool: any = null;
let db: any = null;

// Function to initialize the database connection
const initializeDatabase = async () => {
  try {
    if (isDocker) {
      // For Docker/production, use regular PostgreSQL client
      const { Pool: PgPool } = await import('pg');
      const { drizzle: pgDrizzle } = await import('drizzle-orm/pg-pool');
      
      pool = new PgPool({ 
        connectionString: process.env.DATABASE_URL,
        // Additional connection parameters for stability
        max: 20, // maximum number of clients
        idleTimeoutMillis: 30000, // how long a client is allowed to remain idle before being closed
        connectionTimeoutMillis: 10000, // how long to wait for a connection to become available
      });
      
      db = pgDrizzle(pool, { schema });
    } else {
      // For development, use Neon serverless
      const { Pool: NeonPool, neonConfig } = await import('@neondatabase/serverless');
      const { drizzle: neonDrizzle } = await import('drizzle-orm/neon-serverless');
      const webSocket = await import('ws');
      
      neonConfig.webSocketConstructor = webSocket.default;
      
      pool = new NeonPool({ connectionString: process.env.DATABASE_URL });
      db = neonDrizzle(pool, { schema });
    }
    
    // Add error handler to connection pool
    pool.on('error', (err: Error) => {
      console.error('Unexpected database error on idle client:', err);
    });
    
    console.log('Database connection initialized successfully');
    return { pool, db };
  } catch (error) {
    console.error('Failed to initialize database connection:', error);
    throw error;
  }
};

// Initialize the database connection immediately
initializeDatabase().catch(error => {
  console.error('Database initialization failed:', error);
  process.exit(1); // Exit if we can't connect to the database
});

// Export the pool and db objects
// These will be initialized asynchronously by the IIFEs above
export { pool, db };