#!/bin/bash
# ubuntu-setup.sh: Quick setup script for OBview.io on Ubuntu servers
# Usage: ./ubuntu-setup.sh [domain]

set -e

# Detect if script is being run as root
if [ "$(id -u)" != "0" ]; then
   echo "This script must be run as root. Try: sudo $0 $1"
   exit 1
fi

# Check for domain argument
DOMAIN=$1
if [ -z "$DOMAIN" ]; then
  echo "No domain specified. OBview.io will be accessible via IP address only."
  echo "For a proper setup with SSL, run: sudo $0 yourdomain.com"
  echo ""
  echo "Continue without domain? (y/n)"
  read -r answer
  if [ "$answer" != "y" ]; then
    echo "Exiting. Please run again with domain parameter."
    exit 1
  fi
fi

# Install dependencies
echo "=== Installing dependencies ==="
apt update
apt install -y apt-transport-https ca-certificates curl gnupg lsb-release \
               git nano ufw fail2ban unattended-upgrades

# Install Docker
echo "=== Installing Docker ==="
if ! command -v docker &> /dev/null; then
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt update
  apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
else
  echo "Docker already installed, skipping."
fi

# Create project directory
echo "=== Setting up project directory ==="
mkdir -p /opt/obview
cd /opt/obview

# Clone repository
echo "=== Cloning OBview.io repository ==="
if [ -d ".git" ]; then
  echo "Git repository already exists, updating..."
  git pull
else
  # Note: You'll need to replace this with your actual repository URL
  git clone https://github.com/yourusername/obview.git .
fi

# Create environment file
echo "=== Setting up environment configuration ==="
if [ ! -f ".env" ]; then
  cp .env.example .env
  # Generate secure passwords and secrets
  PG_PASSWORD=$(openssl rand -base64 24)
  SESSION_SECRET=$(openssl rand -base64 32)
  sed -i "s/POSTGRES_PASSWORD=postgres/POSTGRES_PASSWORD=$PG_PASSWORD/" .env
  sed -i "s/SESSION_SECRET=your_secure_session_secret_here/SESSION_SECRET=$SESSION_SECRET/" .env
  
  # Set up app URL if domain is specified
  if [ -n "$DOMAIN" ]; then
    sed -i "s|APP_URL=http://localhost:3000|APP_URL=https://$DOMAIN|" .env
  fi
  
  echo "Created .env file with secure random passwords."
  echo "*** You should edit the .env file to update admin credentials and email settings:"
  echo "*** sudo nano /opt/obview/.env"
fi

# Configure firewall
echo "=== Configuring firewall ==="
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable

# Set up Nginx if domain is specified
if [ -n "$DOMAIN" ]; then
  echo "=== Setting up Nginx and SSL for $DOMAIN ==="
  apt install -y nginx certbot python3-certbot-nginx
  
  # Create Nginx config
  cat > /etc/nginx/sites-available/obview.conf << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    # Allow large file uploads
    client_max_body_size 500M;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 90s;
    }
    
    # Add WebSocket support for real-time features
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

  # Enable site and get SSL certificate
  ln -sf /etc/nginx/sites-available/obview.conf /etc/nginx/sites-enabled/
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
  
  echo "Would you like to obtain SSL certificate for $DOMAIN now? (y/n)"
  read -r answer
  if [ "$answer" = "y" ]; then
    certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN"
  else
    echo "You can run the following command later to obtain SSL certificate:"
    echo "certbot --nginx -d $DOMAIN -d www.$DOMAIN"
  fi
fi

# Create backup script
echo "=== Setting up backup script ==="
mkdir -p /opt/obview/backups
cat > /opt/obview/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/obview/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
mkdir -p $BACKUP_DIR

# Database backup
cd /opt/obview
docker compose exec -T db pg_dump -U postgres obview > $BACKUP_DIR/obview_db_$TIMESTAMP.sql

# Compress the backup
gzip $BACKUP_DIR/obview_db_$TIMESTAMP.sql

# Keep only the last 7 backups
ls -t $BACKUP_DIR/obview_db_*.sql.gz | tail -n +8 | xargs -r rm

# Log the backup
echo "Backup completed at $(date)" >> $BACKUP_DIR/backup_log.txt
EOF

chmod +x /opt/obview/backup.sh

# Set up cron job for backups
echo "=== Setting up automatic backups ==="
(crontab -l 2>/dev/null || echo "") | grep -v "/opt/obview/backup.sh" | { cat; echo "0 2 * * * /opt/obview/backup.sh"; } | crontab -

# Start the application
echo "=== Starting OBview.io ==="
cd /opt/obview

# Make scripts executable
chmod +x scripts/*.sh
chmod +x scripts/*.js 2>/dev/null || true

# Run the fix-docker-build script if it exists
if [ -f "./scripts/fix-docker-build.sh" ]; then
  echo "Running Docker build fix script..."
  ./scripts/fix-docker-build.sh
else
  # Fallback to standard docker compose commands
  docker compose down || true  # Stop if already running
  docker compose build
  docker compose up -d
fi

# Final instructions
echo ""
echo "=== OBview.io Setup Complete ==="
echo ""
if [ -n "$DOMAIN" ]; then
  echo "Your OBview.io installation is now available at: https://$DOMAIN"
else
  IP_ADDRESS=$(curl -s ifconfig.me)
  echo "Your OBview.io installation is now available at: http://$IP_ADDRESS:3000"
fi
echo ""
echo "Important next steps:"
echo "1. Edit your environment configuration: sudo nano /opt/obview/.env"
echo "2. Set up your admin account with a strong password"
echo "3. Configure SendGrid API key for email functionality"
echo ""
echo "For troubleshooting and maintenance commands, refer to DEPLOYMENT.md"
echo "or run: cat /opt/obview/DEPLOYMENT.md"
echo ""
echo "To view logs: cd /opt/obview && docker compose logs -f"
echo ""
echo "IMPORTANT: Make sure to take regular backups of your data!"
echo "Automatic backups are configured to run daily at 2 AM."
echo ""