// Script to set up / sync the initial admin user from env vars.
// Idempotent: creates the admin on first run, and on every subsequent run
// re-syncs the password to whatever ADMIN_PASSWORD is currently set to.
// This is the expected behavior for a Docker / infra-as-code deployment.
const crypto = require('crypto');

let Pool;
if (process.env.IS_DOCKER === 'true') {
  Pool = require('pg').Pool;
} else {
  Pool = require('@neondatabase/serverless').Pool;
}

const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Administrator';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${hash}.${salt}`;
}

async function main() {
  if (!DATABASE_URL) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('Connecting to database...');
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    const existing = await pool.query(
      'SELECT id, username FROM users WHERE username = $1 OR email = $2 LIMIT 1',
      [ADMIN_USERNAME, ADMIN_EMAIL]
    );

    const hashedPassword = hashPassword(ADMIN_PASSWORD);

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      console.log(`Admin user exists (id=${row.id}, username=${row.username}); syncing password from ADMIN_PASSWORD env.`);
      await pool.query(
        'UPDATE users SET password = $1, role = $2, name = $3, email = $4 WHERE id = $5',
        [hashedPassword, 'admin', ADMIN_NAME, ADMIN_EMAIL, row.id]
      );
      console.log('Admin user synced successfully.');
    } else {
      console.log(`Creating admin user: ${ADMIN_USERNAME}`);
      await pool.query(
        'INSERT INTO users (username, password, email, name, role) VALUES ($1, $2, $3, $4, $5)',
        [ADMIN_USERNAME, hashedPassword, ADMIN_EMAIL, ADMIN_NAME, 'admin']
      );
      console.log('Admin user created successfully.');
    }
  } catch (error) {
    console.error('Error setting up admin user:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

main()
  .then(() => {
    console.log('Setup completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Setup failed:', error);
    process.exit(1);
  });
