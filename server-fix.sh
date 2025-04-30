#!/bin/bash

# OBview.io Server-Side Fix Script
echo "OBview.io Server-Side Fix Script"
echo "=============================="
echo

# Ensure script is run as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo)"
  exit 1
fi

# Set variables
APP_DIR="/opt/obview"
APP_USER="obtv-admin"

# Check if application directory exists
if [ ! -d "$APP_DIR" ]; then
  echo "Error: $APP_DIR does not exist"
  exit 1
fi

# Stop the service
echo "Stopping OBview service..."
systemctl stop obview

# Create directories
echo "Creating directory structure..."
mkdir -p $APP_DIR/dist/public

# Check if frontend React source exists
if [ -d "$APP_DIR/client/src" ]; then
  echo "Frontend source found. Will attempt to build..."
  
  # Navigate to client directory
  cd $APP_DIR/client
  
  # Install development dependencies
  echo "Installing development dependencies..."
  npm install
  
  # Build the frontend
  echo "Building frontend..."
  npm run build
  
  # Check if build succeeded
  if [ -d "$APP_DIR/client/dist" ]; then
    echo "Frontend built successfully. Copying build files..."
    # Copy build files to the correct location
    cp -r $APP_DIR/client/dist/* $APP_DIR/dist/public/
    echo "Files copied to $APP_DIR/dist/public/"
  else
    echo "Frontend build failed."
    echo "Will create minimal frontend files..."
    create_minimal_frontend
  fi
else
  echo "Frontend source not found."
  create_minimal_frontend
fi

# Set permissions
echo "Setting permissions..."
chown -R $APP_USER:$APP_USER $APP_DIR/dist

# Restart the service
echo "Starting OBview service..."
systemctl start obview

echo
echo "Fix completed!"
echo "Check the service status with: systemctl status obview"

# Function to create minimal frontend
create_minimal_frontend() {
  echo "Creating minimal frontend files..."
  
  # Create index.html
  cat > $APP_DIR/dist/public/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OBview.io</title>
  <link rel="stylesheet" href="/styles.css">
  <script src="/app.js" defer></script>
</head>
<body>
  <div id="app"></div>
</body>
</html>
EOF

  # Create minimal CSS
  cat > $APP_DIR/dist/public/styles.css << 'EOF'
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.6;
  color: #333;
  background-color: #f5f5f5;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.header {
  background: linear-gradient(to right, #2b5876, #4e4376);
  color: white;
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-radius: 5px;
  margin-bottom: 20px;
}

.header h1 {
  margin: 0;
}

button, .button {
  background-color: #4e4376;
  color: white;
  border: none;
  padding: 10px 15px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.3s;
}

button:hover, .button:hover {
  background-color: #3a325a;
}

input, textarea, select {
  width: 100%;
  padding: 10px;
  margin-bottom: 15px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
}

.card {
  background-color: white;
  border-radius: 5px;
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
  padding: 20px;
  margin-bottom: 20px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.login-container {
  max-width: 400px;
  margin: 100px auto;
  background-color: white;
  padding: 30px;
  border-radius: 5px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.error {
  color: #e74c3c;
  margin-bottom: 15px;
}

.file-viewer {
  background-color: white;
  border-radius: 5px;
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
  padding: 20px;
  margin-bottom: 20px;
}

.comment {
  background-color: #f9f9f9;
  border-radius: 5px;
  padding: 15px;
  margin-bottom: 15px;
}

.comment-author {
  font-weight: bold;
  margin-bottom: 5px;
}

.comment-date {
  color: #888;
  font-size: 12px;
  margin-bottom: 10px;
}
EOF

  # Create minimal JavaScript
  cat > $APP_DIR/dist/public/app.js << 'EOF'
// Main application code
document.addEventListener('DOMContentLoaded', function() {
  checkAuthentication();
});

// Check if user is authenticated
function checkAuthentication() {
  fetch('/api/user')
    .then(response => {
      if (response.ok) return response.json();
      throw new Error('Not authenticated');
    })
    .then(user => {
      renderApp(user);
    })
    .catch(() => {
      renderLogin();
    });
}

// Render main application
function renderApp(user) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="container">
      <header class="header">
        <h1>OBview.io</h1>
        <div>
          <span>Welcome, ${user.name || user.username}</span>
          <button id="logout-btn">Logout</button>
        </div>
      </header>
      
      <main>
        <h2>Your Projects</h2>
        <div id="projects-container" class="grid">
          <p>Loading projects...</p>
        </div>
      </main>
    </div>
  `;

  // Add logout handler
  document.getElementById('logout-btn').addEventListener('click', () => {
    fetch('/api/logout', { method: 'POST' })
      .then(() => {
        window.location.reload();
      });
  });

  // Load projects
  loadProjects();
}

// Load user's projects
function loadProjects() {
  fetch('/api/projects')
    .then(response => response.json())
    .then(projects => {
      const container = document.getElementById('projects-container');
      
      if (projects.length === 0) {
        container.innerHTML = `
          <div class="card">
            <h3>No projects yet</h3>
            <p>Create your first project to get started</p>
            <button id="new-project-btn">Create Project</button>
          </div>
        `;
        
        document.getElementById('new-project-btn').addEventListener('click', showCreateProjectForm);
      } else {
        container.innerHTML = projects.map(project => `
          <div class="card">
            <h3>${project.name}</h3>
            <p>${project.description || 'No description'}</p>
            <button class="view-project-btn" data-id="${project.id}">View Project</button>
          </div>
        `).join('');
        
        // Add event listeners to view buttons
        document.querySelectorAll('.view-project-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const projectId = btn.getAttribute('data-id');
            viewProject(projectId);
          });
        });
      }
    })
    .catch(error => {
      console.error('Error loading projects:', error);
      document.getElementById('projects-container').innerHTML = `
        <div class="card error">
          <p>Error loading projects. Please try again later.</p>
        </div>
      `;
    });
}

// Show form to create a new project
function showCreateProjectForm() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="container">
      <header class="header">
        <h1>OBview.io</h1>
        <button id="back-btn">Back to Projects</button>
      </header>
      
      <main>
        <h2>Create New Project</h2>
        <div class="card">
          <form id="create-project-form">
            <div>
              <label for="project-name">Project Name</label>
              <input type="text" id="project-name" required>
            </div>
            
            <div>
              <label for="project-description">Description</label>
              <textarea id="project-description" rows="3"></textarea>
            </div>
            
            <button type="submit">Create Project</button>
          </form>
        </div>
      </main>
    </div>
  `;
  
  // Back button handler
  document.getElementById('back-btn').addEventListener('click', () => {
    checkAuthentication();
  });
  
  // Form submission handler
  document.getElementById('create-project-form').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const name = document.getElementById('project-name').value;
    const description = document.getElementById('project-description').value;
    
    fetch('/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, description })
    })
    .then(response => {
      if (response.ok) return response.json();
      throw new Error('Failed to create project');
    })
    .then(() => {
      checkAuthentication();
    })
    .catch(error => {
      console.error('Error creating project:', error);
      alert('Error creating project. Please try again.');
    });
  });
}

// View a specific project
function viewProject(projectId) {
  fetch(`/api/projects/${projectId}`)
    .then(response => response.json())
    .then(project => {
      const app = document.getElementById('app');
      app.innerHTML = `
        <div class="container">
          <header class="header">
            <h1>OBview.io</h1>
            <button id="back-btn">Back to Projects</button>
          </header>
          
          <main>
            <h2>${project.name}</h2>
            <p>${project.description || 'No description'}</p>
            
            <div class="card">
              <h3>Files</h3>
              <button id="upload-file-btn">Upload File</button>
              <div id="files-container">
                <p>Loading files...</p>
              </div>
            </div>
          </main>
        </div>
      `;
      
      // Back button handler
      document.getElementById('back-btn').addEventListener('click', () => {
        checkAuthentication();
      });
      
      // Upload file button handler
      document.getElementById('upload-file-btn').addEventListener('click', () => {
        showUploadForm(projectId);
      });
      
      // Load project files
      loadProjectFiles(projectId);
    })
    .catch(error => {
      console.error('Error loading project:', error);
      const app = document.getElementById('app');
      app.innerHTML = `
        <div class="container">
          <header class="header">
            <h1>OBview.io</h1>
            <button id="back-btn">Back to Projects</button>
          </header>
          
          <main>
            <div class="card error">
              <p>Error loading project. Please try again later.</p>
            </div>
          </main>
        </div>
      `;
      
      document.getElementById('back-btn').addEventListener('click', () => {
        checkAuthentication();
      });
    });
}

// Load files for a project
function loadProjectFiles(projectId) {
  fetch(`/api/projects/${projectId}/files`)
    .then(response => response.json())
    .then(files => {
      const container = document.getElementById('files-container');
      
      if (files.length === 0) {
        container.innerHTML = `<p>No files in this project yet.</p>`;
      } else {
        container.innerHTML = files.map(file => `
          <div class="card">
            <h4>${file.filename}</h4>
            <p>Type: ${file.filetype || 'Unknown'}</p>
            <p>Size: ${formatFileSize(file.filesize || 0)}</p>
            <p>Uploaded by: ${file.uploaderName || file.uploaderUsername || 'Unknown'}</p>
            <button class="view-file-btn" data-id="${file.id}">View File</button>
          </div>
        `).join('');
        
        // Add event listeners to view buttons
        document.querySelectorAll('.view-file-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const fileId = btn.getAttribute('data-id');
            viewFile(fileId, projectId);
          });
        });
      }
    })
    .catch(error => {
      console.error('Error loading files:', error);
      document.getElementById('files-container').innerHTML = `
        <p class="error">Error loading files. Please try again later.</p>
      `;
    });
}

// Show form to upload a file
function showUploadForm(projectId) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="container">
      <header class="header">
        <h1>OBview.io</h1>
        <button id="back-btn">Back to Project</button>
      </header>
      
      <main>
        <h2>Upload File</h2>
        <div class="card">
          <form id="upload-form" enctype="multipart/form-data">
            <div>
              <label for="file-input">Select File</label>
              <input type="file" id="file-input" name="file" required>
            </div>
            
            <button type="submit">Upload</button>
          </form>
        </div>
      </main>
    </div>
  `;
  
  // Back button handler
  document.getElementById('back-btn').addEventListener('click', () => {
    viewProject(projectId);
  });
  
  // Form submission handler
  document.getElementById('upload-form').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const fileInput = document.getElementById('file-input');
    const file = fileInput.files[0];
    
    if (!file) {
      alert('Please select a file to upload');
      return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    fetch(`/api/projects/${projectId}/upload`, {
      method: 'POST',
      body: formData
    })
    .then(response => {
      if (response.ok) return response.json();
      throw new Error('Failed to upload file');
    })
    .then(() => {
      viewProject(projectId);
    })
    .catch(error => {
      console.error('Error uploading file:', error);
      alert('Error uploading file. Please try again.');
    });
  });
}

// View a specific file
function viewFile(fileId, projectId) {
  Promise.all([
    fetch(`/api/files/${fileId}`).then(res => {
      if (res.ok) return res.json();
      throw new Error('Failed to load file data');
    }),
    fetch(`/api/files/${fileId}/comments`).then(res => {
      if (res.ok) return res.json();
      return [];
    })
  ])
  .then(([file, comments]) => {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="container">
        <header class="header">
          <h1>OBview.io</h1>
          <button id="back-btn">Back to Project</button>
        </header>
        
        <main>
          <h2>${file.filename}</h2>
          
          <div class="file-viewer">
            <iframe src="/api/files/${fileId}/content" style="width: 100%; height: 500px; border: none;"></iframe>
          </div>
          
          <h3>Comments</h3>
          <div id="comments-container">
            ${comments.length === 0 ? 
              '<p>No comments yet.</p>' :
              comments.map(comment => `
                <div class="comment">
                  <div class="comment-author">${comment.user ? comment.user.name : 'Unknown User'}</div>
                  <div class="comment-date">${new Date(comment.createdAt).toLocaleString()}</div>
                  <div>${comment.content}</div>
                </div>
              `).join('')
            }
          </div>
          
          <div class="card">
            <h3>Add Comment</h3>
            <form id="comment-form">
              <div>
                <label for="comment-content">Comment</label>
                <textarea id="comment-content" rows="3" required></textarea>
              </div>
              
              <button type="submit">Add Comment</button>
            </form>
          </div>
        </main>
      </div>
    `;
    
    // Back button handler
    document.getElementById('back-btn').addEventListener('click', () => {
      viewProject(projectId);
    });
    
    // Comment form handler
    document.getElementById('comment-form').addEventListener('submit', (e) => {
      e.preventDefault();
      
      const content = document.getElementById('comment-content').value;
      
      fetch(`/api/files/${fileId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content })
      })
      .then(response => {
        if (response.ok) {
          viewFile(fileId, projectId);
        } else {
          throw new Error('Failed to add comment');
        }
      })
      .catch(error => {
        console.error('Error adding comment:', error);
        alert('Error adding comment. Please try again.');
      });
    });
  })
  .catch(error => {
    console.error('Error viewing file:', error);
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="container">
        <header class="header">
          <h1>OBview.io</h1>
          <button id="back-btn">Back to Project</button>
        </header>
        
        <main>
          <div class="card error">
            <p>Error loading file. Please try again later.</p>
          </div>
        </main>
      </div>
    `;
    
    document.getElementById('back-btn').addEventListener('click', () => {
      viewProject(projectId);
    });
  });
}

// Render login page
function renderLogin() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="login-container">
      <h1 style="text-align: center; margin-bottom: 30px;">OBview.io</h1>
      <h2>Login</h2>
      
      <form id="login-form">
        <div>
          <label for="username">Username</label>
          <input type="text" id="username" required>
        </div>
        
        <div>
          <label for="password">Password</label>
          <input type="password" id="password" required>
        </div>
        
        <div id="login-error" class="error" style="display: none;"></div>
        
        <button type="submit">Login</button>
      </form>
    </div>
  `;
  
  document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    fetch('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    })
    .then(response => {
      if (response.ok) return response.json();
      throw new Error('Invalid username or password');
    })
    .then(user => {
      renderApp(user);
    })
    .catch(error => {
      console.error('Login error:', error);
      const errorElement = document.getElementById('login-error');
      errorElement.textContent = error.message;
      errorElement.style.display = 'block';
    });
  });
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}
EOF

  echo "Minimal frontend files created."
}