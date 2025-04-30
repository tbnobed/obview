#!/usr/bin/env node

// Fix path resolution issues on Ubuntu 24.04
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

console.log('Starting path resolution fixes for Ubuntu 24.04...');

// Fix 1: Add __dirname polyfill to all compiled JS files
function addDirnamePolyfill(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`  - File not found: ${filePath}`);
    return false;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  
  // Skip if already has the polyfill
  if (content.includes('fileURLToPath(import.meta.url)')) {
    console.log(`  - File already has __dirname polyfill: ${filePath}`);
    return false;
  }
  
  const polyfill = `
// Ubuntu 24.04 compatibility - __dirname polyfill for ES modules
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
`;

  // Add polyfill after the last import statement
  let lastImportIndex = content.lastIndexOf('import ');
  if (lastImportIndex === -1) {
    // No imports, add at the beginning
    content = polyfill + content;
  } else {
    // Find the end of the import statement
    let endOfImport = content.indexOf(';', lastImportIndex);
    if (endOfImport === -1) {
      endOfImport = content.indexOf('\n', lastImportIndex);
    }
    if (endOfImport === -1) {
      // Couldn't find end, add to beginning
      content = polyfill + content;
    } else {
      // Add after the last import
      content = 
        content.slice(0, endOfImport + 1) + 
        polyfill + 
        content.slice(endOfImport + 1);
    }
  }
  
  // Replace any path.resolve() with no arguments
  content = content.replace(
    /path\.resolve\s*\(\s*\)/g, 
    "path.resolve(__dirname)"
  );
  
  // Replace any path.resolve(undefined)
  content = content.replace(
    /path\.resolve\s*\(\s*undefined\s*\)/g, 
    "path.resolve(__dirname)"
  );
  
  // Fix any uses of __dirname directly
  content = content.replace(
    /const\s+distPath\s*=\s*path\.join\s*\(\s*__dirname\s*,\s*['"]dist['"]\s*\)/g,
    "const distPath = path.join(__dirname, '../dist')"
  );
  
  fs.writeFileSync(filePath, content);
  console.log(`  ✓ Added __dirname polyfill to ${filePath}`);
  return true;
}

// Fix 2: Patch the compiled JS in the dist folder
function patchDistFiles() {
  console.log('\nPatching compiled JS files in dist folder...');
  
  const distDir = path.join(rootDir, 'dist');
  if (!fs.existsSync(distDir)) {
    console.log('  ✗ dist directory not found');
    return;
  }
  
  // Patch the main server file
  const mainServerFile = path.join(distDir, 'index.js');
  if (addDirnamePolyfill(mainServerFile)) {
    console.log('  ✓ Patched main server file');
  }
  
  // Patch other important server files
  const serverFiles = [
    path.join(distDir, 'server', 'index.js'),
    path.join(distDir, 'server', 'routes.js'),
    path.join(distDir, 'server', 'vite.js')
  ];
  
  for (const file of serverFiles) {
    if (fs.existsSync(file)) {
      addDirnamePolyfill(file);
    }
  }
  
  // Recursively find and patch all JS files in the dist directory
  function findJsFiles(dir) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        findJsFiles(filePath);
      } else if (file.endsWith('.js')) {
        addDirnamePolyfill(filePath);
      }
    }
  }
  
  // Optional: patch all JS files (may take time for large projects)
  // Uncomment if the specific patches above aren't sufficient
  // findJsFiles(distDir);
  
  console.log('  ✓ Finished patching dist files');
}

// Fix 3: Add client-side routing handler
function addClientSideRouting() {
  console.log('\nAdding client-side routing support...');
  
  const serverFiles = [
    path.join(rootDir, 'server', 'routes.ts'),
    path.join(rootDir, 'server', 'index.ts'),
    path.join(rootDir, 'dist', 'server', 'routes.js'),
    path.join(rootDir, 'dist', 'server', 'index.js'),
    path.join(rootDir, 'dist', 'index.js')
  ];
  
  let fixed = false;
  
  for (const filePath of serverFiles) {
    if (!fs.existsSync(filePath)) {
      console.log(`  - File not found: ${filePath}`);
      continue;
    }
    
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Skip if already has client-side routing
    if (content.includes("app.get('*'") || content.includes('app.get("*"')) {
      console.log(`  - File already has client-side routing: ${filePath}`);
      continue;
    }
    
    // Add path import if needed
    if (!content.includes('import path from')) {
      content = content.replace(
        /import.*from.*['"].*['"]/,
        '$&\nimport path from "path";'
      );
      
      if (!content.includes('import fs from')) {
        content = content.replace(
          /import.*from.*['"].*['"]/,
          '$&\nimport fs from "fs";'
        );
      }
    }
    
    // Handle client-side routing - find where to insert the code
    let insertPosition = -1;
    
    // Try to find common patterns where the code should be inserted
    const patterns = [
      { search: 'return httpServer', before: true },
      { search: 'app.listen', before: true },
      { search: 'export default app', before: true },
      { search: 'module.exports = app', before: true },
      { search: 'app.use(express.static', after: true }
    ];
    
    for (const pattern of patterns) {
      const index = content.indexOf(pattern.search);
      if (index !== -1) {
        if (pattern.before) {
          insertPosition = index;
        } else {
          // Find the end of the statement
          let endOfStatement = content.indexOf(';', index);
          if (endOfStatement === -1) {
            endOfStatement = content.indexOf('\n', index);
          }
          if (endOfStatement !== -1) {
            insertPosition = endOfStatement + 1;
          }
        }
        break;
      }
    }
    
    if (insertPosition === -1) {
      console.log(`  - Could not find insertion position in ${filePath}`);
      continue;
    }
    
    // Create the client-side routing handler
    const routingHandler = `
// Handle client-side routing (added by compatibility script)
app.get('*', (req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return next();
  }
  
  // Serve index.html for client-side routes
  const indexPath = path.join(__dirname, '..', 'dist', 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    // Try alternate path
    const altPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(altPath)) {
      res.sendFile(altPath);
    } else {
      console.error('Error: index.html not found at', indexPath, 'or', altPath);
      res.status(404).send('Application not properly built. Missing index.html');
    }
  }
});
`;
    
    // Insert the routing handler
    content = 
      content.slice(0, insertPosition) + 
      routingHandler + 
      content.slice(insertPosition);
    
    fs.writeFileSync(filePath, content);
    console.log(`  ✓ Added client-side routing to ${filePath}`);
    fixed = true;
  }
  
  if (!fixed) {
    console.log('  ⚠ Could not add client-side routing to any files');
  }
}

// Fix 4: Add WebSocket support for NeonDB
function addWebSocketSupport() {
  console.log('\nAdding WebSocket support for NeonDB...');
  
  const dbFiles = [
    path.join(rootDir, 'server', 'db.ts'),
    path.join(rootDir, 'dist', 'server', 'db.js')
  ];
  
  let fixed = false;
  
  for (const filePath of dbFiles) {
    if (!fs.existsSync(filePath)) {
      console.log(`  - File not found: ${filePath}`);
      continue;
    }
    
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Skip if already has WebSocket configuration
    if (content.includes('neonConfig.webSocketConstructor')) {
      console.log(`  - File already has WebSocket config: ${filePath}`);
      continue;
    }
    
    // Add ws import if needed
    if (!content.includes('import ws from')) {
      content = content.replace(
        /import.*from.*['"].*['"]/,
        '$&\nimport ws from "ws";'
      );
    }
    
    // Add WebSocket configuration
    if (content.includes('neonConfig')) {
      // Add right before first use of neonConfig
      content = content.replace(
        /neonConfig/,
        'neonConfig.webSocketConstructor = ws;\nneonConfig'
      );
    } else if (content.includes('new Pool')) {
      // Add before pool creation
      const importIndex = content.lastIndexOf('import ');
      if (importIndex !== -1) {
        let endOfImports = content.indexOf('\n\n', importIndex);
        if (endOfImports === -1) {
          endOfImports = content.indexOf('\n', importIndex);
        }
        if (endOfImports !== -1) {
          const wsConfig = `
// Configure NeonDB WebSocket support for Ubuntu 24.04
import { neonConfig } from '@neondatabase/serverless';
neonConfig.webSocketConstructor = ws;
`;
          content = 
            content.slice(0, endOfImports + 1) + 
            wsConfig + 
            content.slice(endOfImports + 1);
        }
      }
    }
    
    fs.writeFileSync(filePath, content);
    console.log(`  ✓ Added WebSocket support to ${filePath}`);
    fixed = true;
  }
  
  if (!fixed) {
    console.log('  ⚠ Could not add WebSocket support to any files');
  }
}

// Fix 5: Create launcher script
function createLauncherScript() {
  console.log('\nCreating Ubuntu-compatible launcher script...');
  
  const launcherPath = path.join(rootDir, 'ubuntu-start.js');
  const launcherContent = `#!/usr/bin/env node

// Ubuntu 24.04 compatible launcher for OBview
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Create global __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
globalThis.__dirname = __dirname;
globalThis.__filename = __filename;

// Paths to check for server entry point
const possiblePaths = [
  join(__dirname, 'dist', 'index.js'),
  join(__dirname, 'server', 'index.js'),
  join(__dirname, 'index.js')
];

// Find the server entry point
let serverPath = null;
for (const path of possiblePaths) {
  if (fs.existsSync(path)) {
    serverPath = path;
    break;
  }
}

if (!serverPath) {
  console.error('Error: Could not find server entry point. Build the application first.');
  process.exit(1);
}

// Set production environment
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

console.log(\`Starting OBview server from \${serverPath}...\`);

// Import and run the server
import(serverPath).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
`;
  
  fs.writeFileSync(launcherPath, launcherContent);
  fs.chmodSync(launcherPath, '755'); // Make executable
  
  console.log(`  ✓ Created launcher script at ${launcherPath}`);
}

// Fix 6: Create SystemD service file
function createSystemdService() {
  console.log('\nCreating SystemD service file...');
  
  const servicePath = path.join(rootDir, 'obview.service');
  const serviceContent = `[Unit]
Description=OBview.io Media Review Platform
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=obtv-admin
Group=obtv-admin
WorkingDirectory=/var/www/obview
ExecStart=/usr/bin/node /var/www/obview/ubuntu-start.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=obview
Environment=NODE_ENV=production
EnvironmentFile=/var/www/obview/.env

# Security enhancements for Ubuntu 24.04
ProtectSystem=full
PrivateTmp=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
`;
  
  fs.writeFileSync(servicePath, serviceContent);
  console.log(`  ✓ Created SystemD service file at ${servicePath}`);
}

// Fix 7: Create Nginx configuration
function createNginxConfig() {
  console.log('\nCreating Nginx configuration...');
  
  const nginxDir = path.join(rootDir, 'nginx');
  if (!fs.existsSync(nginxDir)) {
    fs.mkdirSync(nginxDir);
  }
  
  const nginxPath = path.join(nginxDir, 'obview');
  const nginxContent = `server {
    listen 80;
    server_name obview.io www.obview.io;

    # Redirect to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name obview.io www.obview.io;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/obview.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/obview.io/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    
    # Add security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-XSS-Protection "1; mode=block";
    
    # File upload limits
    client_max_body_size 500M;
    
    # Proxy to Node.js server
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
        
        # WebSocket support
        proxy_read_timeout 86400;
    }
    
    # Serve uploads directory directly
    location /uploads/ {
        alias /var/www/obview/uploads/;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000";
        access_log off;
    }
    
    # Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}`;
  
  fs.writeFileSync(nginxPath, nginxContent);
  console.log(`  ✓ Created Nginx configuration at ${nginxPath}`);
}

// Fix 8: Create deployment script
function createDeploymentScript() {
  console.log('\nCreating deployment script...');
  
  const deployPath = path.join(rootDir, 'deploy.sh');
  const deployContent = `#!/bin/bash

# OBview.io Deployment Script for Ubuntu 24.04
set -e

echo "OBview.io Deployment Script"
echo "=========================="
echo

# Check if running with sudo
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root or with sudo"
  exit 1
fi

# Get installation directory
INSTALL_DIR=${1:-"/var/www/obview"}
echo "Installing to: $INSTALL_DIR"

# Create installation directory if it doesn't exist
mkdir -p $INSTALL_DIR
cd $INSTALL_DIR

# Install dependencies
echo "Installing dependencies..."
apt update
apt install -y nodejs npm nginx postgresql postgresql-contrib python3-certbot-nginx

# Install Node.js packages
echo "Installing Node.js packages..."
npm install ws @neondatabase/serverless express express-session

# Run the compatibility fixes
echo "Applying compatibility fixes..."
node fixes/fix-path-resolution.js

# Set up database
echo "Setting up database..."
if [ ! -f .env ]; then
  cat > .env << EOF
NODE_ENV=production
PORT=5000
HOST=0.0.0.0
DATABASE_URL=postgres://obview:your_secure_password@localhost:5432/obview_db
SESSION_SECRET=your-secure-session-secret
EOF
  echo "Created .env file with default settings"
  echo "Please update DATABASE_URL with your actual database credentials"
fi

# Set permissions
echo "Setting permissions..."
chown -R obtv-admin:obtv-admin $INSTALL_DIR
chmod -R 755 $INSTALL_DIR
chmod 600 $INSTALL_DIR/.env

# Set up SystemD service
echo "Setting up SystemD service..."
cp $INSTALL_DIR/obview.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable obview

# Set up Nginx
echo "Setting up Nginx..."
cp $INSTALL_DIR/nginx/obview /etc/nginx/sites-available/
ln -sf /etc/nginx/sites-available/obview /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx

echo
echo "Installation complete!"
echo "======================="
echo "1. Update .env with your database credentials"
echo "2. Start the service: systemctl start obview"
echo "3. Check status: systemctl status obview"
echo
echo "If you need SSL, run: certbot --nginx -d obview.io -d www.obview.io"
echo
`;
  
  fs.writeFileSync(deployPath, deployContent);
  fs.chmodSync(deployPath, '755'); // Make executable
  console.log(`  ✓ Created deployment script at ${deployPath}`);
}

// Fix 9: Create README with deployment instructions
function createReadme() {
  console.log('\nCreating README with deployment instructions...');
  
  const readmePath = path.join(rootDir, 'README.md');
  const readmeContent = `# OBview.io Deployment for Ubuntu 24.04

This package contains the complete OBview.io application with specific fixes for Ubuntu 24.04 compatibility.

## Quick Start

\`\`\`bash
# 1. Extract the package
unzip obview-deploy-full.zip
cd obview-deploy-full

# 2. Run the deployment script (as root)
sudo ./deploy.sh
\`\`\`

## Manual Installation

If you prefer to install manually, follow these steps:

### 1. Install Dependencies

\`\`\`bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
sudo apt install -y nodejs npm

# Install PostgreSQL and Nginx
sudo apt install -y postgresql postgresql-contrib nginx
\`\`\`

### 2. Set Up Database

\`\`\`bash
# Create database user
sudo -u postgres psql -c "CREATE USER obview WITH PASSWORD 'your_secure_password';"

# Create database
sudo -u postgres psql -c "CREATE DATABASE obview_db OWNER obview;"
\`\`\`

### 3. Set Up Application

\`\`\`bash
# Create application directory
sudo mkdir -p /var/www/obview
sudo chown your_username:your_username /var/www/obview

# Copy files to application directory
cp -R * /var/www/obview/
cd /var/www/obview

# Install dependencies
npm install
npm install ws @neondatabase/serverless

# Apply compatibility fixes
node fixes/fix-path-resolution.js

# Create .env file
cat > .env << EOF
NODE_ENV=production
PORT=5000
HOST=0.0.0.0
DATABASE_URL=postgres://obview:your_secure_password@localhost:5432/obview_db
SESSION_SECRET=your-secure-session-secret
EOF
\`\`\`

### 4. Set Up SystemD Service

\`\`\`bash
# Copy service file
sudo cp obview.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable and start service
sudo systemctl enable obview
sudo systemctl start obview
\`\`\`

### 5. Set Up Nginx

\`\`\`bash
# Copy nginx configuration
sudo cp nginx/obview /etc/nginx/sites-available/

# Create symbolic link
sudo ln -s /etc/nginx/sites-available/obview /etc/nginx/sites-enabled/

# Test and restart Nginx
sudo nginx -t
sudo systemctl restart nginx
\`\`\`

### 6. Set Up SSL (Optional)

\`\`\`bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d obview.io -d www.obview.io
\`\`\`

## Troubleshooting

If you encounter issues:

1. Check application logs: \`sudo journalctl -u obview -f\`
2. Check Nginx logs: \`sudo tail -f /var/log/nginx/error.log\`
3. Check database connection: \`sudo -u postgres psql -d obview_db -c "SELECT NOW();"\`

## Manual Testing

To test the application manually:

\`\`\`bash
# Run with Node.js directly
cd /var/www/obview
node ubuntu-start.js
\`\`\`

## File Structure

- \`server/\` - Backend server code
- \`client/\` - Frontend client code
- \`dist/\` - Compiled application
- \`uploads/\` - File uploads directory
- \`fixes/\` - Compatibility fix scripts
- \`nginx/\` - Nginx configuration
- \`obview.service\` - SystemD service file
- \`ubuntu-start.js\` - Ubuntu-compatible launcher
- \`deploy.sh\` - Deployment script
`;
  
  fs.writeFileSync(readmePath, readmeContent);
  console.log(`  ✓ Created README at ${readmePath}`);
}

// Run all fixes
console.log('Running OBview compatibility fixes for Ubuntu 24.04...\n');

patchDistFiles();
addClientSideRouting();
addWebSocketSupport();
createLauncherScript();
createSystemdService();
createNginxConfig();
createDeploymentScript();
createReadme();

console.log('\nAll compatibility fixes have been applied successfully!');
console.log('Your application is now ready for deployment on Ubuntu 24.04.');
console.log('Follow the instructions in README.md to deploy the application.');