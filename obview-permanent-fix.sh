#!/bin/bash

# OBview.io Complete System Fix
# This script provides a permanent fix for the OBview.io application
# It addresses frontend deployment issues and sets up proper processes
# for future deployments

# Display header
echo "======================================"
echo "   OBview.io Complete System Fix"
echo "======================================"
echo

# Ensure script is run as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo)"
  exit 1
fi

# Set variables
APP_DIR="/opt/obview"
APP_USER="obtv-admin"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/obview-backup-$TIMESTAMP"

# Step 1: Create backup of current installation
echo "[1/6] Creating backup of current installation..."
if [ -d "$APP_DIR" ]; then
  mkdir -p "$BACKUP_DIR"
  cp -r "$APP_DIR"/* "$BACKUP_DIR"/ 2>/dev/null
  echo "  ✓ Backup created at $BACKUP_DIR"
else
  echo "  ✗ Application directory not found at $APP_DIR"
  exit 1
fi

# Step 2: Create proper directory structure
echo "[2/6] Creating proper directory structure..."
mkdir -p "$APP_DIR/dist/public"
mkdir -p "$APP_DIR/uploads"
echo "  ✓ Directory structure created"

# Step 3: Create frontend implementation
echo "[3/6] Setting up permanent frontend solution..."

# Create main index.html file
cat > "$APP_DIR/dist/public/index.html" << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OBview.io - Media Review Platform</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div id="app"></div>
  <script src="/app.js"></script>
</body>
</html>
EOF

# Create CSS styles
cat > "$APP_DIR/dist/public/styles.css" << 'EOF'
/* OBview.io Styles */
:root {
  --primary: #4e4376;
  --primary-dark: #382f5c;
  --secondary: #2b5876;
  --secondary-dark: #1e3f54;
  --light: #f8f9fa;
  --dark: #333;
  --gray: #6c757d;
  --light-gray: #e9ecef;
  --success: #198754;
  --danger: #dc3545;
  --warning: #ffc107;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.6;
  color: var(--dark);
  background-color: var(--light);
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.header {
  background: linear-gradient(to right, var(--secondary), var(--primary));
  color: white;
  padding: .75rem 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-radius: 5px;
  margin-bottom: 20px;
}

.header h1 {
  margin: 0;
  font-size: 1.75rem;
  background: linear-gradient(to right, #fff, #e9ecef);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.btn {
  display: inline-block;
  font-weight: 500;
  text-align: center;
  white-space: nowrap;
  vertical-align: middle;
  user-select: none;
  border: 1px solid transparent;
  padding: 0.375rem 0.75rem;
  font-size: 1rem;
  line-height: 1.5;
  border-radius: 0.25rem;
  transition: color 0.15s ease-in-out, background-color 0.15s ease-in-out, border-color 0.15s ease-in-out;
  cursor: pointer;
}

.btn-primary {
  color: #fff;
  background-color: var(--primary);
  border-color: var(--primary);
}

.btn-primary:hover {
  background-color: var(--primary-dark);
  border-color: var(--primary-dark);
}

.btn-secondary {
  color: #fff;
  background-color: var(--secondary);
  border-color: var(--secondary);
}

.btn-secondary:hover {
  background-color: var(--secondary-dark);
  border-color: var(--secondary-dark);
}

.btn-danger {
  color: #fff;
  background-color: var(--danger);
  border-color: var(--danger);
}

.btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
  line-height: 1.5;
  border-radius: 0.2rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
}

.form-control {
  display: block;
  width: 100%;
  padding: 0.375rem 0.75rem;
  font-size: 1rem;
  line-height: 1.5;
  color: var(--dark);
  background-color: #fff;
  background-clip: padding-box;
  border: 1px solid #ced4da;
  border-radius: 0.25rem;
  transition: border-color 0.15s ease-in-out;
}

.form-control:focus {
  border-color: var(--primary);
  outline: 0;
}

.card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  word-wrap: break-word;
  background-color: #fff;
  background-clip: border-box;
  border: 1px solid rgba(0, 0, 0, 0.125);
  border-radius: 0.25rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  margin-bottom: 1rem;
  transition: transform 0.2s, box-shadow 0.2s;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}

.card-body {
  flex: 1 1 auto;
  padding: 1.25rem;
}

.card-title {
  margin-bottom: 0.75rem;
}

.card-text {
  margin-bottom: 1rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}

.login-container {
  max-width: 400px;
  margin: 100px auto;
  background-color: white;
  padding: 2rem;
  border-radius: 0.25rem;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}

.alert {
  position: relative;
  padding: 0.75rem 1.25rem;
  margin-bottom: 1rem;
  border: 1px solid transparent;
  border-radius: 0.25rem;
}

.alert-danger {
  color: #721c24;
  background-color: #f8d7da;
  border-color: #f5c6cb;
}

.file-viewer {
  background-color: white;
  border-radius: 0.25rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  margin-bottom: 1.5rem;
  overflow: hidden;
}

.comment {
  background-color: var(--light-gray);
  border-radius: 0.25rem;
  padding: 1rem;
  margin-bottom: 1rem;
}

.comment-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.comment-author {
  font-weight: bold;
}

.comment-date {
  color: var(--gray);
  font-size: 0.875rem;
}

.content-section {
  margin-bottom: 2rem;
}

.badge {
  display: inline-block;
  padding: 0.25em 0.4em;
  font-size: 75%;
  font-weight: 700;
  line-height: 1;
  text-align: center;
  white-space: nowrap;
  vertical-align: baseline;
  border-radius: 0.25rem;
}

.badge-primary {
  color: #fff;
  background-color: var(--primary);
}

.badge-secondary {
  color: #fff;
  background-color: var(--secondary);
}

.content-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.ml-auto {
  margin-left: auto;
}

.mb-4 {
  margin-bottom: 1.5rem;
}

.text-center {
  text-align: center;
}

@media (max-width: 768px) {
  .grid {
    grid-template-columns: 1fr;
  }
  
  .header {
    flex-direction: column;
    text-align: center;
    padding: 1rem;
  }
  
  .header h1 {
    margin-bottom: 1rem;
  }
}
EOF

# Create JavaScript for application functionality
cat > "$APP_DIR/dist/public/app.js" << 'EOF'
// OBview.io Frontend Application

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
  initializeApp();
});

// Initialize the application
function initializeApp() {
  // Check authentication status
  checkAuthentication()
    .then(handleRouting)
    .catch(error => {
      console.error('Application initialization error:', error);
      renderLogin();
    });
}

// Check if user is authenticated
async function checkAuthentication() {
  try {
    const response = await fetch('/api/user');
    if (!response.ok) {
      throw new Error('Not authenticated');
    }
    return await response.json();
  } catch (error) {
    return null;
  }
}

// Handle routing based on URL
function handleRouting(user) {
  if (!user) {
    renderLogin();
    return;
  }

  const path = window.location.pathname;
  
  // Project detail page
  const projectMatch = path.match(/^\/projects\/(\d+)$/);
  if (projectMatch) {
    const projectId = projectMatch[1];
    renderProjectDetail(user, projectId);
    return;
  }
  
  // File detail page
  const fileMatch = path.match(/^\/files\/(\d+)$/);
  if (fileMatch) {
    const fileId = fileMatch[1];
    renderFileDetail(user, fileId);
    return;
  }
  
  // Default to projects list
  renderProjectsList(user);
}

// Render the login page
function renderLogin() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="login-container">
      <h1 class="text-center mb-4">OBview.io</h1>
      <h2>Login</h2>
      <form id="login-form">
        <div class="form-group">
          <label for="username">Username</label>
          <input type="text" id="username" class="form-control" required>
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" class="form-control" required>
        </div>
        <div id="login-error" class="alert alert-danger" style="display: none;"></div>
        <button type="submit" class="btn btn-primary" style="width: 100%;">Login</button>
      </form>
    </div>
  `;
  
  document.getElementById('login-form').addEventListener('submit', handleLogin);
}

// Handle login form submission
async function handleLogin(event) {
  event.preventDefault();
  
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const errorElement = document.getElementById('login-error');
  
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    if (!response.ok) {
      throw new Error('Invalid username or password');
    }
    
    const user = await response.json();
    renderProjectsList(user);
  } catch (error) {
    errorElement.textContent = error.message;
    errorElement.style.display = 'block';
  }
}

// Render the projects list page
async function renderProjectsList(user) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="container">
      <header class="header">
        <h1>OBview.io</h1>
        <div>
          <span>Welcome, ${user.name || user.username}</span>
          <button id="logout-btn" class="btn btn-secondary">Logout</button>
        </div>
      </header>
      
      <div class="content-header">
        <h2>Your Projects</h2>
        <button id="new-project-btn" class="btn btn-primary">New Project</button>
      </div>
      
      <div id="projects-container" class="grid">
        <div class="card">
          <div class="card-body">
            <p>Loading projects...</p>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Set up event listeners
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('new-project-btn').addEventListener('click', () => renderNewProjectForm(user));
  
  // Load projects
  try {
    const response = await fetch('/api/projects');
    if (!response.ok) {
      throw new Error('Failed to load projects');
    }
    
    const projects = await response.json();
    renderProjects(projects);
  } catch (error) {
    console.error('Error loading projects:', error);
    const container = document.getElementById('projects-container');
    container.innerHTML = `
      <div class="card">
        <div class="card-body">
          <p>Error loading projects. Please try again later.</p>
        </div>
      </div>
    `;
  }
}

// Render the projects into the container
function renderProjects(projects) {
  const container = document.getElementById('projects-container');
  
  if (projects.length === 0) {
    container.innerHTML = `
      <div class="card">
        <div class="card-body">
          <h3 class="card-title">No projects yet</h3>
          <p class="card-text">Create your first project to get started</p>
        </div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = projects.map(project => `
    <div class="card">
      <div class="card-body">
        <h3 class="card-title">${project.name}</h3>
        <p class="card-text">${project.description || 'No description'}</p>
        <a href="/projects/${project.id}" class="btn btn-primary">View Project</a>
      </div>
    </div>
  `).join('');
}

// Render the new project form
function renderNewProjectForm(user) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="container">
      <header class="header">
        <h1>OBview.io</h1>
        <button id="back-btn" class="btn btn-secondary">Back to Projects</button>
      </header>
      
      <h2>Create New Project</h2>
      <div class="card">
        <div class="card-body">
          <form id="new-project-form">
            <div class="form-group">
              <label for="project-name">Project Name</label>
              <input type="text" id="project-name" class="form-control" required>
            </div>
            <div class="form-group">
              <label for="project-description">Description</label>
              <textarea id="project-description" class="form-control" rows="3"></textarea>
            </div>
            <button type="submit" class="btn btn-primary">Create Project</button>
          </form>
        </div>
      </div>
    </div>
  `;
  
  // Set up event listeners
  document.getElementById('back-btn').addEventListener('click', () => renderProjectsList(user));
  document.getElementById('new-project-form').addEventListener('submit', event => handleCreateProject(event, user));
}

// Handle project creation
async function handleCreateProject(event, user) {
  event.preventDefault();
  
  const name = document.getElementById('project-name').value;
  const description = document.getElementById('project-description').value;
  
  try {
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    });
    
    if (!response.ok) {
      throw new Error('Failed to create project');
    }
    
    const project = await response.json();
    renderProjectDetail(user, project.id);
  } catch (error) {
    console.error('Error creating project:', error);
    alert('Failed to create project. Please try again.');
  }
}

// Render project detail page
async function renderProjectDetail(user, projectId) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="container">
      <header class="header">
        <h1>OBview.io</h1>
        <div>
          <button id="back-to-projects-btn" class="btn btn-secondary">Back to Projects</button>
          <button id="logout-btn" class="btn btn-secondary">Logout</button>
        </div>
      </header>
      
      <div id="project-details">
        <h2>Loading project...</h2>
      </div>
      
      <div class="content-header">
        <h3>Files</h3>
        <button id="upload-file-btn" class="btn btn-primary">Upload File</button>
      </div>
      
      <div id="files-container" class="grid">
        <div class="card">
          <div class="card-body">
            <p>Loading files...</p>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Set up event listeners
  document.getElementById('back-to-projects-btn').addEventListener('click', () => renderProjectsList(user));
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('upload-file-btn').addEventListener('click', () => renderUploadForm(user, projectId));
  
  // Load project details
  try {
    const [projectResponse, filesResponse] = await Promise.all([
      fetch(`/api/projects/${projectId}`),
      fetch(`/api/projects/${projectId}/files`)
    ]);
    
    if (!projectResponse.ok) {
      throw new Error('Failed to load project details');
    }
    
    const project = await projectResponse.json();
    
    // Update project details
    document.getElementById('project-details').innerHTML = `
      <h2>${project.name}</h2>
      <p>${project.description || 'No description'}</p>
    `;
    
    // Handle files
    if (filesResponse.ok) {
      const files = await filesResponse.json();
      renderProjectFiles(files, projectId);
    } else {
      throw new Error('Failed to load project files');
    }
  } catch (error) {
    console.error('Error loading project:', error);
    document.getElementById('project-details').innerHTML = `
      <h2>Error</h2>
      <p>Failed to load project. Please try again later.</p>
    `;
    document.getElementById('files-container').innerHTML = `
      <div class="card">
        <div class="card-body">
          <p>Error loading files.</p>
        </div>
      </div>
    `;
  }
}

// Render project files
function renderProjectFiles(files, projectId) {
  const container = document.getElementById('files-container');
  
  if (files.length === 0) {
    container.innerHTML = `
      <div class="card">
        <div class="card-body">
          <p>No files in this project yet.</p>
          <p>Click "Upload File" to add your first file.</p>
        </div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = files.map(file => `
    <div class="card">
      <div class="card-body">
        <h4 class="card-title">${file.filename}</h4>
        <p class="card-text">Type: ${file.filetype || 'Unknown'}</p>
        <p class="card-text">Size: ${formatFileSize(file.filesize || 0)}</p>
        <p class="card-text">Uploaded by: ${file.uploaderName || file.uploaderUsername || 'Unknown'}</p>
        <a href="/files/${file.id}" class="btn btn-primary">View File</a>
      </div>
    </div>
  `).join('');
}

// Render file upload form
function renderUploadForm(user, projectId) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="container">
      <header class="header">
        <h1>OBview.io</h1>
        <button id="back-btn" class="btn btn-secondary">Back to Project</button>
      </header>
      
      <h2>Upload File</h2>
      <div class="card">
        <div class="card-body">
          <form id="upload-form" enctype="multipart/form-data">
            <div class="form-group">
              <label for="file-input">Select File</label>
              <input type="file" id="file-input" class="form-control" required>
            </div>
            <button type="submit" class="btn btn-primary">Upload</button>
          </form>
        </div>
      </div>
    </div>
  `;
  
  // Set up event listeners
  document.getElementById('back-btn').addEventListener('click', () => renderProjectDetail(user, projectId));
  document.getElementById('upload-form').addEventListener('submit', event => handleFileUpload(event, user, projectId));
}

// Handle file upload
async function handleFileUpload(event, user, projectId) {
  event.preventDefault();
  
  const fileInput = document.getElementById('file-input');
  const file = fileInput.files[0];
  
  if (!file) {
    alert('Please select a file to upload');
    return;
  }
  
  const formData = new FormData();
  formData.append('file', file);
  
  try {
    const response = await fetch(`/api/projects/${projectId}/upload`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error('Failed to upload file');
    }
    
    const uploadedFile = await response.json();
    renderProjectDetail(user, projectId);
  } catch (error) {
    console.error('Error uploading file:', error);
    alert('Failed to upload file. Please try again.');
  }
}

// Render file detail page
async function renderFileDetail(user, fileId) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="container">
      <header class="header">
        <h1>OBview.io</h1>
        <div>
          <button id="back-btn" class="btn btn-secondary">Back</button>
          <button id="logout-btn" class="btn btn-secondary">Logout</button>
        </div>
      </header>
      
      <div id="file-details">
        <h2>Loading file...</h2>
      </div>
      
      <div class="file-viewer">
        <iframe id="file-iframe" style="width: 100%; height: 500px; border: none;"></iframe>
      </div>
      
      <div class="content-section">
        <h3>Comments</h3>
        <div id="comments-container">
          <p>Loading comments...</p>
        </div>
        
        <div class="card">
          <div class="card-body">
            <h4>Add Comment</h4>
            <form id="comment-form">
              <div class="form-group">
                <label for="comment-content">Comment</label>
                <textarea id="comment-content" class="form-control" rows="3" required></textarea>
              </div>
              <button type="submit" class="btn btn-primary">Add Comment</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Set up event listeners
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('comment-form').addEventListener('submit', event => handleAddComment(event, user, fileId));
  
  // Load file details and comments
  try {
    const filePromise = fetch(`/api/files/${fileId}`).then(res => {
      if (!res.ok) return res.json().then(err => { throw new Error(err.message || 'Failed to load file') });
      return res.json();
    });
    
    const commentsPromise = fetch(`/api/files/${fileId}/comments`).then(res => {
      if (!res.ok) return [];
      return res.json();
    });
    
    const [file, comments] = await Promise.all([filePromise, commentsPromise]);
    
    // Update file details
    document.getElementById('file-details').innerHTML = `
      <h2>${file.filename}</h2>
      <p>Type: ${file.filetype || 'Unknown'}</p>
      <p>Size: ${formatFileSize(file.filesize || 0)}</p>
    `;
    
    // Set up file viewer
    document.getElementById('file-iframe').src = `/api/files/${fileId}/content`;
    
    // Set up back button to return to project
    document.getElementById('back-btn').addEventListener('click', () => {
      if (file.projectId) {
        renderProjectDetail(user, file.projectId);
      } else {
        renderProjectsList(user);
      }
    });
    
    // Render comments
    renderFileComments(comments, fileId);
  } catch (error) {
    console.error('Error loading file details:', error);
    document.getElementById('file-details').innerHTML = `
      <h2>Error</h2>
      <p>Failed to load file. Please try again later.</p>
    `;
    document.getElementById('comments-container').innerHTML = `
      <p>Error loading comments.</p>
    `;
  }
}

// Render file comments
function renderFileComments(comments, fileId) {
  const container = document.getElementById('comments-container');
  
  if (!comments || comments.length === 0) {
    container.innerHTML = '<p>No comments yet.</p>';
    return;
  }
  
  container.innerHTML = comments.map(comment => `
    <div class="comment">
      <div class="comment-header">
        <span class="comment-author">${comment.user ? comment.user.name : comment.username || 'Unknown User'}</span>
        <span class="comment-date">${formatDate(comment.createdAt)}</span>
      </div>
      <div>${comment.content}</div>
    </div>
  `).join('');
}

// Handle adding a comment
async function handleAddComment(event, user, fileId) {
  event.preventDefault();
  
  const content = document.getElementById('comment-content').value;
  
  try {
    const response = await fetch(`/api/files/${fileId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    
    if (!response.ok) {
      throw new Error('Failed to add comment');
    }
    
    // Reload the page to show the new comment
    renderFileDetail(user, fileId);
  } catch (error) {
    console.error('Error adding comment:', error);
    alert('Failed to add comment. Please try again.');
  }
}

// Handle logout
async function handleLogout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
    renderLogin();
  } catch (error) {
    console.error('Logout error:', error);
    window.location.reload();
  }
}

// Format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format date
function formatDate(dateString) {
  if (!dateString) return 'Unknown date';
  
  const date = new Date(dateString);
  return date.toLocaleString();
}

// Initialize the application by setting up route handling
window.addEventListener('popstate', () => {
  initializeApp();
});

// Prevent the browser's default navigation
document.addEventListener('click', function(event) {
  // Check if the clicked element is a link
  let target = event.target;
  while (target && target.tagName !== 'A') {
    target = target.parentNode;
    if (!target || target === document) {
      return;
    }
  }
  
  // Only handle links to our own site
  const href = target.getAttribute('href');
  if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('#')) {
    return;
  }
  
  // Prevent default navigation
  event.preventDefault();
  
  // Update URL without reloading the page
  history.pushState(null, '', href);
  
  // Handle the route change
  initializeApp();
});
EOF

# Create OBview logo SVG
cat > "$APP_DIR/dist/public/logo.svg" << 'EOF'
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50" viewBox="0 0 200 50">
  <defs>
    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#2b5876;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#4e4376;stop-opacity:1" />
    </linearGradient>
  </defs>
  <text x="10" y="35" fill="url(#gradient)" font-family="Arial, sans-serif" font-size="30" font-weight="bold">OBview.io</text>
</svg>
EOF

echo "  ✓ Frontend files created"

# Step 4: Create package creation script
echo "[4/6] Creating package creation script..."
cat > "$APP_DIR/create-package.sh" << 'EOF'
#!/bin/bash

# OBview.io Production Package Creator
echo "Creating OBview.io Production Package..."
echo "====================================="
echo

# Create a temporary directory
TEMP_DIR=$(mktemp -d)
echo "Created temporary directory: $TEMP_DIR"

# Copy required files to the temp directory
echo "Copying files for package..."
copy_if_exists() {
  if [ -f "$1" ]; then
    cp "$1" "$TEMP_DIR/"
    echo "  - Copied $1"
  else
    echo "  - File not found: $1"
  fi
}

# Server files
copy_if_exists "server.js"
copy_if_exists "database-schema.sql"
copy_if_exists "install.sh"
copy_if_exists "backup.sh"
copy_if_exists "restore.sh" 
copy_if_exists "healthcheck.js"
copy_if_exists "check-database.js"
copy_if_exists "password-util.js"
copy_if_exists "package.json"
copy_if_exists "README.md"
copy_if_exists "CONFIGURATION.md"
copy_if_exists "DEPLOYMENT.md"

# Copy dist directory with frontend
mkdir -p "$TEMP_DIR/dist"
cp -r dist/* "$TEMP_DIR/dist/" || { echo "Failed to copy dist directory"; exit 1; }
echo "  - Copied frontend files from dist directory"

# Create uploads directory
mkdir -p "$TEMP_DIR/uploads"
echo "Created uploads directory"

# Create package
PACKAGE_NAME="obview-$(date +%Y%m%d).tar.gz"
echo "Creating package: $PACKAGE_NAME..."
tar -czf $PACKAGE_NAME -C $TEMP_DIR . || { echo "Failed to create package"; exit 1; }
echo "Created package: $PWD/$PACKAGE_NAME"

# Clean up
rm -rf $TEMP_DIR
echo "Cleaned up temporary directory"
echo
echo "Package created successfully!"
echo "To deploy, extract the package and run the installation script:"
echo "  tar -xzf $PACKAGE_NAME"
echo "  sudo chmod +x install.sh"
echo "  sudo ./install.sh"
EOF
chmod +x "$APP_DIR/create-package.sh"
echo "  ✓ Package creation script created"

# Step 5: Update installation script
echo "[5/6] Creating updated installation script..."
cat > "$APP_DIR/install.sh" << 'EOF'
#!/bin/bash

# OBview.io Installation Script
echo "OBview.io Installation Script"
echo "============================"
echo

# Ensure script is run as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo)"
  exit 1
fi

# Set variables
APP_DIR="/opt/obview"
APP_USER="obtv-admin"
DB_USER="obviewuser"
DB_PASS="tbn123456789"
DB_NAME="obview"
SCRIPT_DIR="$(pwd)"

# Ensure the application directory exists
echo "Creating application directory..."
mkdir -p $APP_DIR

# Update system
echo "Updating system packages..."
apt-get update

# Check/install Node.js
echo "Checking Node.js installation..."
if ! command -v node &> /dev/null; then
  echo "Installing Node.js..."
  # Use NodeSource for latest Node.js
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
else
  echo "Node.js is already installed"
fi

# Install PostgreSQL and Nginx if not already installed
echo "Installing PostgreSQL and Nginx..."
apt-get install -y postgresql postgresql-contrib nginx

# Check Node.js version
NODE_VERSION=$(node -v)
echo "Node.js version: $NODE_VERSION"

# Create user if it doesn't exist
if ! id "$APP_USER" &>/dev/null; then
  echo "Creating application user..."
  useradd -m -s /bin/bash $APP_USER
  echo "Created user: $APP_USER"
else
  echo "User $APP_USER already exists"
fi

# Set up PostgreSQL
echo "Setting up PostgreSQL..."
# Check if PostgreSQL is running
if systemctl is-active --quiet postgresql; then
  echo "PostgreSQL is running"
else
  echo "Starting PostgreSQL service..."
  systemctl start postgresql
  systemctl enable postgresql
fi

# Create database user and database
echo "Creating database user and database..."
sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" || echo "User may already exist"
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" || echo "Database may already exist"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" || echo "Privileges may already be granted"

# Import schema
echo "Importing database schema..."
if [ -f "$SCRIPT_DIR/database-schema.sql" ]; then
  export PGPASSWORD=$DB_PASS
  psql -U $DB_USER -h localhost -d $DB_NAME -f "$SCRIPT_DIR/database-schema.sql"
  unset PGPASSWORD
  echo "Schema imported successfully"
else
  echo "Schema file not found: $SCRIPT_DIR/database-schema.sql"
  exit 1
fi

# Copy application files
echo "Copying application files..."

# Server files
cp "$SCRIPT_DIR/server.js" $APP_DIR/
cp "$SCRIPT_DIR"/*.js $APP_DIR/ 2>/dev/null || echo "No additional JS files found"
cp "$SCRIPT_DIR"/*.sh $APP_DIR/ 2>/dev/null || echo "No shell scripts found"
cp "$SCRIPT_DIR"/*.md $APP_DIR/ 2>/dev/null || echo "No documentation files found"

# Create uploads directory
if [ -d "$SCRIPT_DIR/uploads" ]; then
  cp -r "$SCRIPT_DIR/uploads" $APP_DIR/
else
  echo "Creating uploads directory..."
  mkdir -p $APP_DIR/uploads
fi

# Copy frontend files
if [ -d "$SCRIPT_DIR/dist" ]; then
  echo "Copying frontend files..."
  cp -r "$SCRIPT_DIR/dist" $APP_DIR/
  echo "Copied frontend files"
else
  echo "ERROR: Frontend files not found in dist directory"
  exit 1
fi

# Set permissions
echo "Setting permissions..."
chown -R $APP_USER:$APP_USER $APP_DIR
chmod +x $APP_DIR/*.js $APP_DIR/*.sh 2>/dev/null || echo "No executable files to set permissions on"

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
cd $APP_DIR

# Copy package.json template if it exists
if [ -f "$SCRIPT_DIR/package.json.template" ]; then
  cp "$SCRIPT_DIR/package.json.template" $APP_DIR/package.json
  echo "Using package.json template"
elif [ -f "$SCRIPT_DIR/package.json" ]; then
  cp "$SCRIPT_DIR/package.json" $APP_DIR/package.json
  echo "Using existing package.json"
else
  # Create a simple package.json
  cat > $APP_DIR/package.json << 'EOF2'
{
  "name": "obview",
  "version": "1.0.0",
  "description": "Media review and collaboration platform",
  "main": "server.js",
  "type": "module",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "express-session": "^1.17.3",
    "multer": "^1.4.5-lts.1",
    "pg": "^8.11.3"
  }
}
EOF2
  echo "Created minimal package.json"
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Double-check that we have the frontend built correctly
if [ ! -f "$APP_DIR/dist/public/index.html" ]; then
  echo "ERROR: Frontend files are missing or in the wrong location."
  echo "Expected to find index.html at $APP_DIR/dist/public/index.html"
  exit 1
fi

# Create systemd service file
echo "Creating systemd service file..."
cat > /etc/systemd/system/obview.service << 'EOF2'
[Unit]
Description=OBview.io Application
After=network.target postgresql.service

[Service]
Type=simple
User=obtv-admin
WorkingDirectory=/opt/obview
ExecStart=/usr/bin/node /opt/obview/server.js
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=5000
Environment=DATABASE_URL=postgresql://obviewuser:tbn123456789@localhost:5432/obview

[Install]
WantedBy=multi-user.target
EOF2

echo "Enabling and starting service..."
systemctl daemon-reload
systemctl enable obview
systemctl restart obview

# Create Nginx configuration
echo "Setting up Nginx configuration..."
cat > /etc/nginx/sites-available/obview << 'EOF2'
server {
    listen 80;
    server_name obview.io www.obview.io;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # For large file uploads
    client_max_body_size 500M;

    # Enable compression
    gzip on;
    gzip_comp_level 5;
    gzip_min_length 256;
    gzip_proxied any;
    gzip_vary on;
    gzip_types
        application/javascript
        application/json
        application/x-javascript
        application/xml
        application/xml+rss
        image/svg+xml
        text/css
        text/javascript
        text/plain
        text/xml;
}
EOF2

ln -sf /etc/nginx/sites-available/obview /etc/nginx/sites-enabled/
systemctl reload nginx

echo
echo "Installation complete!"
echo "OBview.io should now be running at http://localhost or http://your-server-ip"
echo "You can access the admin interface with username: admin and password: admin"
echo
echo "To check the status of the service, run: systemctl status obview"
echo "To view logs, run: journalctl -u obview"
EOF
chmod +x "$APP_DIR/install.sh"
echo "  ✓ Installation script updated"

# Step 6: Set permissions and restart the service
echo "[6/6] Setting permissions and restarting service..."
chown -R $APP_USER:$APP_USER $APP_DIR
chmod +x $APP_DIR/*.sh $APP_DIR/*.js 2>/dev/null

echo "Restarting service..."
systemctl restart obview

echo
echo "===================================================="
echo "    OBview.io System Fix Complete"
echo "===================================================="
echo
echo "Your OBview.io application has been fixed and upgraded!"
echo
echo "Improvements made:"
echo "  ✓ Fixed missing frontend issue"
echo "  ✓ Created permanent solution with proper frontend"
echo "  ✓ Created better package creation script"
echo "  ✓ Updated installation script for future deployments"
echo
echo "To create a new deployment package, run:"
echo "  cd $APP_DIR"
echo "  ./create-package.sh"
echo
echo "The site should now be working at http://your-server-ip"
echo "If you encounter any issues, check the logs with:"
echo "  journalctl -u obview -n 50 --no-pager"
echo
echo "Backup of previous installation is available at:"
echo "  $BACKUP_DIR"
echo "===================================================="