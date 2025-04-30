#!/bin/bash

# OBview.io Deployment Script for Ubuntu 24.04
# Usage: bash deploy.sh <database_password>

set -e

DB_PASSWORD=${1:-obview}
APP_DIR="/var/www/obview"

echo "Starting OBview.io deployment on Ubuntu 24.04..."

# Update system
echo "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install dependencies
echo "Installing dependencies..."
sudo apt install -y git curl build-essential nginx postgresql postgresql-contrib

# Install NVM and Node.js
echo "Installing Node.js..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 18
nvm use 18
nvm alias default 18

# Set up PostgreSQL
echo "Setting up PostgreSQL..."
sudo -u postgres psql -c "CREATE USER obview WITH PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE obview_db OWNER obview;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE obview_db TO obview;"

# Create application directory
echo "Setting up application directory..."
sudo mkdir -p $APP_DIR
sudo chown $USER:$USER $APP_DIR

# Copy application files
echo "Copying application files..."
cp -r * $APP_DIR/

# Install dependencies
echo "Installing Node.js dependencies..."
cd $APP_DIR
npm install

# Setup environment
echo "Setting up environment..."
cp .env.example .env
sed -i "s|postgres://username:password@localhost:5432/dbname|postgres://obview:$DB_PASSWORD@localhost:5432/obview_db|g" .env
sed -i "s|your-secure-session-secret|$(openssl rand -hex 32)|g" .env

# Create uploads directory
echo "Creating uploads directory..."
mkdir -p $APP_DIR/uploads
chmod 755 $APP_DIR/uploads

# Initialize database
echo "Initializing database..."
node scripts/setup.js admin "$DB_PASSWORD" admin@obview.io "Admin User"

# Setup systemd service
echo "Setting up systemd service..."
sudo cp obview.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable obview
sudo systemctl start obview

# Setup Nginx
echo "Setting up Nginx..."
sudo cp nginx/obview /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/obview /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

# Setup firewall
echo "Configuring firewall..."
sudo ufw allow 'Nginx Full'
sudo ufw allow ssh
sudo ufw enable

echo "Deployment completed! OBview.io is now running on your server."
echo "You can access it at http://localhost:5000 or configure your domain with SSL."
echo "Default admin credentials: admin / $DB_PASSWORD"