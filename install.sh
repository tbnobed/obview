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

# Ensure the application directory exists
echo "Creating application directory..."
mkdir -p $APP_DIR

# Update and install required packages
echo "Installing required packages..."
apt-get update
apt-get install -y nodejs npm postgresql nginx

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
if [ -f "database-schema.sql" ]; then
  export PGPASSWORD=$DB_PASS
  psql -U $DB_USER -h localhost -d $DB_NAME -f database-schema.sql
  unset PGPASSWORD
  echo "Schema imported successfully"
else
  echo "Schema file not found: database-schema.sql"
  exit 1
fi

# Copy application files
echo "Copying application files..."
cp server.js $APP_DIR/
if [ -d "dist" ]; then
  cp -r dist $APP_DIR/
else
  echo "Warning: 'dist' directory not found"
fi

if [ -d "uploads" ]; then
  cp -r uploads $APP_DIR/
else
  echo "Creating uploads directory..."
  mkdir -p $APP_DIR/uploads
fi

# Set permissions
echo "Setting permissions..."
chown -R $APP_USER:$APP_USER $APP_DIR

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
cd $APP_DIR
sudo -u $APP_USER npm install express pg express-session multer

# Set up systemd service
echo "Setting up systemd service..."
if [ -f "obview.service" ]; then
  cp obview.service /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable obview
  systemctl start obview
  echo "Service installed and started"
else
  echo "Service file not found: obview.service"
  exit 1
fi

# Set up Nginx
echo "Setting up Nginx..."
if [ -f "nginx-obview" ]; then
  cp nginx-obview /etc/nginx/sites-available/obview
  ln -sf /etc/nginx/sites-available/obview /etc/nginx/sites-enabled/
  systemctl reload nginx
  echo "Nginx configured"
else
  echo "Nginx config file not found: nginx-obview"
  exit 1
fi

echo
echo "Installation complete!"
echo "OBview.io should now be running at http://localhost or http://your-server-ip"
echo "You can access the admin interface with username: admin and password: admin"
echo