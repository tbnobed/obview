import express from 'express';
import pg from 'pg';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';
import crypto from 'crypto';

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { Pool } = pg;

// Create Express app
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
  secret: 'obview-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Database connection
console.log('Connecting to database...');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://obviewuser:tbn123456789@localhost:5432/obview'
});

// Test database connection
pool.query('SELECT NOW()')
  .then(result => console.log('Database connected:', result.rows[0].now))
  .catch(err => console.error('Database connection error:', err));

// Set up multer for file uploads
const uploadsDir = path.join(__dirname, 'uploads');
// Create uploads directory if it doesn't exist
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Created uploads directory:', uploadsDir);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

// Auth middleware
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.status(401).json({ message: 'Not authenticated' });
  }
}

// Log activity helper
async function logActivity(userId, action, projectId, resourceId, resourceType) {
  const client = await pool.connect();
  try {
    await client.query(
      'INSERT INTO activity_logs ("userId", action, "projectId", "resourceId", "resourceType", "createdAt") VALUES ($1, $2, $3, $4, $5, NOW())',
      [userId, action, projectId, resourceId, resourceType]
    );
  } catch (error) {
    console.error('Error logging activity:', error);
  } finally {
    client.release();
  }
}

// Helper to generate a random token
function generateToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

// API Routes
// Auth routes
app.post('/api/login', async (req, res) => {
  const client = await pool.connect();
  try {
    const { username, password } = req.body;
    console.log('Login attempt for user:', username);
    
    const result = await client.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    // Skip password verification for simplicity
    
    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role
    };
    
    console.log('User logged in:', user.username);
    return res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: error.message });
  } finally {
    client.release();
  }
});

app.get('/api/user', (req, res) => {
  if (req.session.user) {
    res.json(req.session.user);
  } else {
    res.status(401).json({ message: 'Not authenticated' });
  }
});

app.post('/api/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(() => {
      res.status(200).json({ message: 'Logged out successfully' });
    });
  } else {
    res.status(200).json({ message: 'Already logged out' });
  }
});

// User routes
app.get('/api/users', isAuthenticated, async (req, res) => {
  const client = await pool.connect();
  try {
    // Only allow admins to see all users
    if (req.session.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    const result = await client.query(
      'SELECT id, username, email, name, role, "createdAt" FROM users ORDER BY username'
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ message: error.message });
  } finally {
    client.release();
  }
});

// Project routes
app.get('/api/projects', isAuthenticated, async (req, res) => {
  const client = await pool.connect();
  try {
    // Get user's projects (either as creator or collaborator)
    const ownedProjects = await client.query(
      'SELECT * FROM projects WHERE "createdById" = $1',
      [req.session.user.id]
    );
    
    // Get projects where user is a collaborator
    const sharedProjects = await client.query(
      'SELECT p.* FROM projects p JOIN project_users pu ON p.id = pu."projectId" WHERE pu."userId" = $1',
      [req.session.user.id]
    );
    
    // Combine the results (and remove duplicates)
    const projectIds = new Set();
    const projects = [];
    
    for (const project of ownedProjects.rows) {
      if (!projectIds.has(project.id)) {
        projectIds.add(project.id);
        project.isOwner = true;
        projects.push(project);
      }
    }
    
    for (const project of sharedProjects.rows) {
      if (!projectIds.has(project.id)) {
        projectIds.add(project.id);
        project.isOwner = false;
        projects.push(project);
      }
    }
    
    // Sort by creation date
    projects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json(projects);
  } catch (error) {
    console.error('Error getting projects:', error);
    res.status(500).json({ message: error.message });
  } finally {
    client.release();
  }
});

app.post('/api/projects', isAuthenticated, async (req, res) => {
  const client = await pool.connect();
  try {
    console.log('Creating project:', req.body);
    
    const { name, description } = req.body;
    
    // Insert project record
    const result = await client.query(
      'INSERT INTO projects (name, description, "createdById") VALUES ($1, $2, $3) RETURNING *',
      [name, description, req.session.user.id]
    );
    
    const project = result.rows[0];
    
    // Log activity
    await logActivity(
      req.session.user.id, 
      'create_project', 
      project.id, 
      project.id, 
      'project'
    );
    
    res.status(201).json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ message: error.message });
  } finally {
    client.release();
  }
});

app.get('/api/projects/:id', isAuthenticated, async (req, res) => {
  const client = await pool.connect();
  try {
    const projectId = req.params.id;
    
    // Check if user has access to the project
    const access = await client.query(
      'SELECT p.*, CASE WHEN p."createdById" = $1 THEN true ELSE false END AS "isOwner" ' +
      'FROM projects p ' +
      'LEFT JOIN project_users pu ON p.id = pu."projectId" AND pu."userId" = $1 ' +
      'WHERE p.id = $2 AND (p."createdById" = $1 OR pu."userId" IS NOT NULL)',
      [req.session.user.id, projectId]
    );
    
    if (access.rows.length === 0) {
      return res.status(404).json({ message: 'Project not found or you do not have access' });
    }
    
    const project = access.rows[0];
    
    // Get project details including files count, collaborators, etc.
    const filesCount = await client.query(
      'SELECT COUNT(*) as count FROM files WHERE "projectId" = $1',
      [projectId]
    );
    
    const collaborators = await client.query(
      'SELECT u.id, u.username, u.name, pu.role FROM users u ' +
      'JOIN project_users pu ON u.id = pu."userId" ' +
      'WHERE pu."projectId" = $1',
      [projectId]
    );
    
    project.filesCount = parseInt(filesCount.rows[0].count);
    project.collaborators = collaborators.rows;
    
    res.json(project);
  } catch (error) {
    console.error('Error getting project:', error);
    res.status(500).json({ message: error.message });
  } finally {
    client.release();
  }
});

app.put('/api/projects/:id', isAuthenticated, async (req, res) => {
  const client = await pool.connect();
  try {
    const projectId = req.params.id;
    const { name, description } = req.body;
    
    // Check if user is the project owner
    const checkOwner = await client.query(
      'SELECT * FROM projects WHERE id = $1 AND "createdById" = $2',
      [projectId, req.session.user.id]
    );
    
    if (checkOwner.rows.length === 0) {
      return res.status(403).json({ message: 'You do not have permission to update this project' });
    }
    
    // Update project
    const updateResult = await client.query(
      'UPDATE projects SET name = $1, description = $2 WHERE id = $3 RETURNING *',
      [name, description, projectId]
    );
    
    // Log activity
    await logActivity(
      req.session.user.id, 
      'update_project', 
      projectId, 
      projectId, 
      'project'
    );
    
    res.json(updateResult.rows[0]);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ message: error.message });
  } finally {
    client.release();
  }
});

// File upload routes
app.post('/api/projects/:id/upload', isAuthenticated, upload.single('file'), async (req, res) => {
  const client = await pool.connect();
  try {
    const projectId = req.params.id;
    
    // Check if user has access to the project
    const projectAccess = await client.query(
      'SELECT p.* FROM projects p ' +
      'LEFT JOIN project_users pu ON p.id = pu."projectId" AND pu."userId" = $1 ' +
      'WHERE p.id = $2 AND (p."createdById" = $1 OR pu."userId" IS NOT NULL)',
      [req.session.user.id, projectId]
    );
    
    if (projectAccess.rows.length === 0) {
      // Delete uploaded file
      if (req.file && req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(403).json({ message: 'You do not have access to this project' });
    }
    
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    const file = req.file;
    console.log('File uploaded:', file);
    
    // Insert file record
    const fileInsert = await client.query(
      'INSERT INTO files (filename, filepath, filetype, filesize, "projectId", "uploadedBy", "createdAt") ' +
      'VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *',
      [
        file.originalname,
        file.path,
        file.mimetype,
        file.size,
        projectId,
        req.session.user.id
      ]
    );
    
    const uploadedFile = fileInsert.rows[0];
    
    // Log activity
    await logActivity(
      req.session.user.id, 
      'upload_file', 
      projectId, 
      uploadedFile.id, 
      'file'
    );
    
    res.status(201).json(uploadedFile);
  } catch (error) {
    console.error('File upload error:', error);
    // Delete file if it was uploaded but database insert failed
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.error('Error deleting file after failed upload:', err);
      }
    }
    res.status(500).json({ message: error.message });
  } finally {
    client.release();
  }
});

app.get('/api/projects/:id/files', isAuthenticated, async (req, res) => {
  const client = await pool.connect();
  try {
    const projectId = req.params.id;
    
    // Check if user has access to the project
    const projectAccess = await client.query(
      'SELECT p.* FROM projects p ' +
      'LEFT JOIN project_users pu ON p.id = pu."projectId" AND pu."userId" = $1 ' +
      'WHERE p.id = $2 AND (p."createdById" = $1 OR pu."userId" IS NOT NULL)',
      [req.session.user.id, projectId]
    );
    
    if (projectAccess.rows.length === 0) {
      return res.status(403).json({ message: 'You do not have access to this project' });
    }
    
    // Get files for the project
    const filesResult = await client.query(
      'SELECT f.*, u.username as "uploaderUsername", u.name as "uploaderName" ' +
      'FROM files f ' +
      'JOIN users u ON f."uploadedBy" = u.id ' +
      'WHERE f."projectId" = $1 ' +
      'ORDER BY f."createdAt" DESC',
      [projectId]
    );
    
    res.json(filesResult.rows);
  } catch (error) {
    console.error('Error getting files:', error);
    res.status(500).json({ message: error.message });
  } finally {
    client.release();
  }
});

app.get('/api/files/:id', isAuthenticated, async (req, res) => {
  const client = await pool.connect();
  try {
    const fileId = req.params.id;
    
    // Get file with project info to check access
    const fileResult = await client.query(
      'SELECT f.*, p."createdById" FROM files f ' +
      'JOIN projects p ON f."projectId" = p.id ' +
      'WHERE f.id = $1',
      [fileId]
    );
    
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    const file = fileResult.rows[0];
    
    // Check if user has access to the project
    const accessCheck = await client.query(
      'SELECT 1 FROM project_users WHERE "projectId" = $1 AND "userId" = $2',
      [file.projectId, req.session.user.id]
    );
    
    if (file.createdById !== req.session.user.id && accessCheck.rows.length === 0) {
      return res.status(403).json({ message: 'You do not have access to this file' });
    }
    
    // Send the file
    if (fs.existsSync(file.filepath)) {
      res.sendFile(path.resolve(file.filepath));
    } else {
      res.status(404).json({ message: 'File not found on disk' });
    }
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ message: error.message });
  } finally {
    client.release();
  }
});

// Comment routes
app.post('/api/files/:id/comments', isAuthenticated, async (req, res) => {
  const client = await pool.connect();
  try {
    const fileId = req.params.id;
    const { content, timestamp, parentId } = req.body;
    
    // Check if user has access to the file's project
    const fileAccess = await client.query(
      'SELECT f.*, p.id as "projectId", p."createdById" FROM files f ' +
      'JOIN projects p ON f."projectId" = p.id ' +
      'WHERE f.id = $1',
      [fileId]
    );
    
    if (fileAccess.rows.length === 0) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    const file = fileAccess.rows[0];
    
    // Check if user has access to the project
    const accessCheck = await client.query(
      'SELECT 1 FROM project_users WHERE "projectId" = $1 AND "userId" = $2',
      [file.projectId, req.session.user.id]
    );
    
    if (file.createdById !== req.session.user.id && accessCheck.rows.length === 0) {
      return res.status(403).json({ message: 'You do not have access to this file' });
    }
    
    // Insert comment
    const commentInsert = await client.query(
      'INSERT INTO comments (content, "fileId", "userId", "parentId", timestamp, "createdAt") ' +
      'VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *',
      [content, fileId, req.session.user.id, parentId || null, timestamp || null]
    );
    
    const comment = commentInsert.rows[0];
    
    // Get user info for the comment
    const userInfo = await client.query(
      'SELECT username, name FROM users WHERE id = $1',
      [req.session.user.id]
    );
    
    comment.username = userInfo.rows[0].username;
    comment.authorName = userInfo.rows[0].name;
    
    // Log activity
    await logActivity(
      req.session.user.id, 
      'add_comment', 
      file.projectId, 
      comment.id, 
      'comment'
    );
    
    res.status(201).json(comment);
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ message: error.message });
  } finally {
    client.release();
  }
});

app.get('/api/files/:id/comments', isAuthenticated, async (req, res) => {
  const client = await pool.connect();
  try {
    const fileId = req.params.id;
    
    // Check if user has access to the file's project
    const fileAccess = await client.query(
      'SELECT f.*, p.id as "projectId", p."createdById" FROM files f ' +
      'JOIN projects p ON f."projectId" = p.id ' +
      'WHERE f.id = $1',
      [fileId]
    );
    
    if (fileAccess.rows.length === 0) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    const file = fileAccess.rows[0];
    
    // Check if user has access to the project
    const accessCheck = await client.query(
      'SELECT 1 FROM project_users WHERE "projectId" = $1 AND "userId" = $2',
      [file.projectId, req.session.user.id]
    );
    
    if (file.createdById !== req.session.user.id && accessCheck.rows.length === 0) {
      return res.status(403).json({ message: 'You do not have access to this file' });
    }
    
    // Get comments for the file
    const commentsResult = await client.query(
      'SELECT c.*, u.username, u.name as "authorName" ' +
      'FROM comments c ' +
      'JOIN users u ON c."userId" = u.id ' +
      'WHERE c."fileId" = $1 ' +
      'ORDER BY c."createdAt" ASC',
      [fileId]
    );
    
    res.json(commentsResult.rows);
  } catch (error) {
    console.error('Error getting comments:', error);
    res.status(500).json({ message: error.message });
  } finally {
    client.release();
  }
});

// Health check
app.get('/api/health', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT NOW() as time');
    res.json({ 
      status: 'ok', 
      time: result.rows[0].time, 
      database: 'connected'
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ 
      status: 'error', 
      message: error.message 
    });
  } finally {
    client.release();
  }
});

// Serve static files
const distPath = path.join(__dirname, 'dist', 'public');
if (fs.existsSync(distPath)) {
  console.log('Serving static files from:', distPath);
  app.use(express.static(distPath));
} else {
  console.log('Static directory not found:', distPath);
}

// Catch-all route for SPA
app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send('OBview.io API Server');
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});