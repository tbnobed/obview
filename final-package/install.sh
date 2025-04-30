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
cp "$SCRIPT_DIR/server.js" $APP_DIR/
cp "$SCRIPT_DIR"/*.js $APP_DIR/ 2>/dev/null || echo "No additional JS files found"
cp "$SCRIPT_DIR"/*.sh $APP_DIR/ 2>/dev/null || echo "No shell scripts found"
cp "$SCRIPT_DIR"/*.md $APP_DIR/ 2>/dev/null || echo "No documentation files found"

if [ -d "$SCRIPT_DIR/dist" ]; then
  cp -r "$SCRIPT_DIR/dist" $APP_DIR/
  echo "Copied frontend assets"
else
  echo "Warning: 'dist' directory not found"
  mkdir -p $APP_DIR/dist/public
fi

if [ -d "$SCRIPT_DIR/uploads" ]; then
  cp -r "$SCRIPT_DIR/uploads" $APP_DIR/
else
  echo "Creating uploads directory..."
  mkdir -p $APP_DIR/uploads
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
else
  # Create a simple package.json
  cat > $APP_DIR/package.json << 'EOF'
{
  "name": "obview",
  "version": "1.0.0",
  "description": "Media review and collaboration platform",
  "main": "server.js",
  "type": "module",
  "dependencies": {
    "express": "^4.18.2",
    "express-session": "^1.17.3",
    "multer": "^1.4.5-lts.1",
    "pg": "^8.11.3"
  }
}
EOF
  echo "Created minimal package.json"
fi

# Install dependencies
npm install

# Create systemd service file
echo "Creating systemd service file..."
cat > /etc/systemd/system/obview.service << 'EOF'
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
EOF

echo "Enabling and starting service..."
systemctl daemon-reload
systemctl enable obview
systemctl start obview

# Create Nginx configuration
echo "Setting up Nginx configuration..."
cat > /etc/nginx/sites-available/obview << 'EOF'
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
EOF

ln -sf /etc/nginx/sites-available/obview /etc/nginx/sites-enabled/
systemctl reload nginx

echo
echo "Installation complete!"
echo "OBview.io should now be running at http://localhost or http://your-server-ip"
echo "You can access the admin interface with username: admin and password: admin"
echo
echo "To check the status of the service, run: systemctl status obview"
echo "To view logs, run: journalctl -u obview -f"
echo