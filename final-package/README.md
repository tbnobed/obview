# OBview.io Deployment Package

This package contains a self-contained version of OBview.io specifically designed for Ubuntu 24.04 deployment.

## Contents

- `server.js` - Main server file with all backend functionality
- `package.json` - Node.js dependencies and scripts
- `scripts/setup.js` - Database initialization script
- `client/public/` - Static files for the frontend
- `nginx/obview` - Nginx configuration file
- `obview.service` - SystemD service file
- `deploy.sh` - Deployment script

## Quick Deployment

1. Make the deployment script executable:
   ```bash
   chmod +x deploy.sh
   ```

2. Run the deployment script (provide a secure password):
   ```bash
   ./deploy.sh your_secure_password
   ```

3. The script will:
   - Update your system
   - Install dependencies (Node.js, PostgreSQL, Nginx)
   - Set up the database
   - Configure the application
   - Set up the systemd service
   - Configure Nginx

4. Access your application at `http://localhost:5000` or configure your domain.

## Manual Setup

If you prefer to set up the application manually:

1. Install Node.js 18+ and PostgreSQL 16:
   ```bash
   # Install NVM and Node.js
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
   export NVM_DIR="$HOME/.nvm"
   [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
   nvm install 18
   nvm use 18
   
   # Install PostgreSQL
   sudo apt install -y postgresql postgresql-contrib
   ```

2. Set up the PostgreSQL database:
   ```bash
   sudo -u postgres psql -c "CREATE USER obview WITH PASSWORD 'your_password';"
   sudo -u postgres psql -c "CREATE DATABASE obview_db OWNER obview;"
   sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE obview_db TO obview;"
   ```

3. Set up the application directory:
   ```bash
   sudo mkdir -p /var/www/obview
   sudo chown your_username:your_username /var/www/obview
   cp -r * /var/www/obview/
   cd /var/www/obview
   ```

4. Install dependencies:
   ```bash
   npm install
   ```

5. Configure the environment:
   ```bash
   cp .env.example .env
   # Edit .env to set your environment variables
   ```

6. Initialize the database:
   ```bash
   node scripts/setup.js username password email name
   ```

7. Set up the systemd service:
   ```bash
   sudo cp obview.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable obview
   sudo systemctl start obview
   ```

8. Set up Nginx:
   ```bash
   sudo cp nginx/obview /etc/nginx/sites-available/
   sudo ln -s /etc/nginx/sites-available/obview /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

## SSL Configuration

To set up SSL with Let's Encrypt:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

## Troubleshooting

If the application doesn't start:

1. Check the logs:
   ```bash
   sudo journalctl -u obview -f
   ```

2. Check the Nginx logs:
   ```bash
   sudo tail -f /var/log/nginx/error.log
   ```

3. Check the database:
   ```bash
   sudo -u postgres psql -d obview_db -c "SELECT NOW();"
   ```

## Note About the Frontend

This package includes a basic HTML/CSS frontend to verify that the server is running correctly. Your actual application frontend should be compiled and placed in the `client/public/` directory.

The full frontend from your Replit project would typically be bundled and placed here using a build process. For this deployment package, we've included a minimal frontend that confirms the server is functioning properly.