import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import http from 'http';
import { Pool, neonConfig } from '@neondatabase/serverless';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import multer from 'multer';
import { WebSocketServer } from 'ws';
import ws from 'ws';

// CRITICAL FIX: Configure NeonDB to use the ws package for WebSocket connections
neonConfig.webSocketConstructor = ws;

// Create __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set up scrypt async
const scryptAsync = promisify(scrypt);

// Initialize Express app
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

// Database connection
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

console.log("Connecting to database...");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Test database connection
async function testDatabaseConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('Database connection successful:', result.rows[0]);
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
}

// Session store
const PostgresStore = connectPg(session);
const sessionStore = new PostgresStore({
  pool,
  tableName: 'session',
  createTableIfMissing: true
});

// Session configuration
app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'dev-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && process.env.SECURE_COOKIE === 'true'
  }
}));

// Password hashing functions
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const buf = (await scryptAsync(password, salt, 64));
  return `${buf.toString('hex')}.${salt}`;
}

async function comparePasswords(supplied, stored) {
  const [hashed, salt] = stored.split('.');
  const hashedBuf = Buffer.from(hashed, 'hex');
  const suppliedBuf = (await scryptAsync(supplied, salt, 64));
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Configure Passport Local Strategy
passport.use(new LocalStrategy(async (username, password, done) => {
  try {
    console.log(`Authenticating user: ${username}`);
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    
    const user = result.rows[0];
    if (!user) {
      console.log(`User not found: ${username}`);
      return done(null, false);
    }
    
    const isValid = await comparePasswords(password, user.password);
    if (!isValid) {
      console.log(`Invalid password for user: ${username}`);
      return done(null, false);
    }
    
    console.log(`User authenticated successfully: ${username}`);
    return done(null, user);
  } catch (err) {
    console.error('Authentication error:', err);
    return done(err);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    console.log(`Deserializing user ID: ${id}`);
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    const user = result.rows[0];
    console.log(`User deserialized: ${user ? user.username : 'not found'}`);
    done(null, user);
  } catch (err) {
    console.error('Deserializing user error:', err);
    done(err, null);
  }
});

// Authentication middleware
function isAuthenticated(req, res, next) {
  console.log('Auth check - isAuthenticated:', req.isAuthenticated());
  console.log('Auth check - session:', req.session);
  console.log('Auth check - user:', req.user);
  
  if (req.isAuthenticated()) {
    console.log('User is authenticated, proceeding');
    return next();
  }
  console.log('Authentication failed, returning 401');
  res.status(401).json({ message: 'Unauthorized' });
}

function isAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.role === 'admin') {
    return next();
  }
  res.status(403).json({ message: 'Forbidden: Admin access required' });
}

// Authentication API routes
app.post('/api/register', async (req, res) => {
  try {
    console.log('Registration request:', req.body);
    const { username, password, email, name } = req.body;
    
    // Check if user exists
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'Username or email already exists' });
    }
    
    // Hash password
    const hashedPassword = await hashPassword(password);
    
    // Create user
    const result = await pool.query(
      'INSERT INTO users (username, password, email, name, role, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [username, hashedPassword, email, name, 'user', new Date()]
    );
    
    const user = { ...result.rows[0] };
    delete user.password; // Don't return password
    
    // Log in the new user
    req.login(user, (err) => {
      if (err) return res.status(500).json({ message: 'Login error after registration' });
      res.status(201).json(user);
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Registration failed', error: error.message });
  }
});

app.post('/api/login', passport.authenticate('local'), (req, res) => {
  // Remove password before sending to client
  const user = { ...req.user };
  delete user.password;
  res.json(user);
});

app.post('/api/logout', (req, res) => {
  req.logout(function(err) {
    if (err) { return res.status(500).json({ message: 'Logout failed' }); }
    res.status(200).send('OK');
  });
});

app.get('/api/user', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  // Remove password before sending to client
  const user = { ...req.user };
  delete user.password;
  res.json(user);
});

// Projects API
app.get('/api/projects', isAuthenticated, async (req, res) => {
  try {
    let query;
    let params = [];

    if (req.user.role === 'admin') {
      // Admins can see all projects
      query = `
        SELECT p.*, u.username as created_by_username 
        FROM projects p
        LEFT JOIN users u ON p.created_by_id = u.id
        ORDER BY p.created_at DESC
      `;
    } else {
      // Regular users see only their projects or projects they're a member of
      query = `
        SELECT DISTINCT p.*, u.username as created_by_username 
        FROM projects p
        LEFT JOIN users u ON p.created_by_id = u.id
        LEFT JOIN project_users pu ON p.id = pu.project_id
        WHERE p.created_by_id = $1 OR pu.user_id = $1
        ORDER BY p.created_at DESC
      `;
      params.push(req.user.id);
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ message: 'Failed to fetch projects', error: error.message });
  }
});

app.post('/api/projects', isAuthenticated, async (req, res) => {
  try {
    const { name, description } = req.body;
    
    const result = await pool.query(
      'INSERT INTO projects (name, description, created_by_id, created_at) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, description, req.user.id, new Date()]
    );
    
    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (entity_type, entity_id, action, user_id, created_at) VALUES ($1, $2, $3, $4, $5)',
      ['project', result.rows[0].id, 'created', req.user.id, new Date()]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ message: 'Failed to create project', error: error.message });
  }
});

// File uploads
app.post('/api/projects/:projectId/files', isAuthenticated, upload.single('file'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const { version, fileName } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    // Check if the user has access to this project
    const projectAccess = await pool.query(
      `SELECT * FROM projects WHERE id = $1 AND (created_by_id = $2 OR EXISTS (
        SELECT 1 FROM project_users WHERE project_id = $1 AND user_id = $2
      ))`,
      [projectId, req.user.id]
    );
    
    if (projectAccess.rows.length === 0) {
      return res.status(403).json({ message: 'No access to this project' });
    }
    
    // Create file record
    const fileResult = await pool.query(
      `INSERT INTO files (
        filename, original_filename, file_path, file_size, file_type,
        project_id, uploaded_by_id, version, is_latest_version, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        fileName || req.file.originalname,
        req.file.originalname,
        req.file.path,
        req.file.size,
        req.file.mimetype,
        projectId,
        req.user.id,
        version || '1.0',
        true,
        new Date()
      ]
    );
    
    // If this is a new version, update previous versions to not be latest
    if (version) {
      await pool.query(
        `UPDATE files SET is_latest_version = false 
         WHERE project_id = $1 AND id != $2 AND original_filename = $3`,
        [projectId, fileResult.rows[0].id, req.file.originalname]
      );
    }
    
    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (entity_type, entity_id, action, user_id, created_at) VALUES ($1, $2, $3, $4, $5)',
      ['file', fileResult.rows[0].id, 'uploaded', req.user.id, new Date()]
    );
    
    res.status(201).json(fileResult.rows[0]);
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ message: 'Failed to upload file', error: error.message });
  }
});

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'client', 'public')));

// Serve uploaded files with proper content type
app.use('/uploads', express.static(uploadsDir, {
  setHeaders: (res, path) => {
    // Set proper content type based on file extension
    const ext = path.split('.').pop().toLowerCase();
    if (ext === 'mp4') {
      res.setHeader('Content-Type', 'video/mp4');
    } else if (ext === 'jpg' || ext === 'jpeg') {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (ext === 'png') {
      res.setHeader('Content-Type', 'image/png');
    }
  }
}));

// The "catchall" handler: for any request that doesn't match above, send back the index.html file
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'public', 'index.html'));
});

// Create HTTP server
const server = http.createServer(app);

// Set up WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received message:', data);
      
      // Broadcast to all clients
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify(data));
        }
      });
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// Start the server after testing database connection
async function startServer() {
  try {
    await testDatabaseConnection();
    
    const PORT = process.env.PORT || 5000;
    const HOST = process.env.HOST || '0.0.0.0';
    
    server.listen(PORT, HOST, () => {
      console.log(`Server running on http://${HOST}:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();