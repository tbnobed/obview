#!/bin/bash

# Create OBview.io Package Script
echo "Creating OBview.io Package..."
echo "==========================="

# Create a temp directory to hold the files
TEMP_DIR=$(mktemp -d)
echo "Created temporary directory: $TEMP_DIR"

# List of files to include
FILELIST=(
  "server.js"
  "database-schema.sql"
  "install.sh"
  "backup.sh"
  "restore.sh"
  "healthcheck.js"
  "check-database.js"
  "password-util.js"
  "package.json.template"
  "README.md"
  "CONFIGURATION.md"
  "DEPLOYMENT.md"
)

# Copy files to temp directory
echo "Copying files..."
for file in "${FILELIST[@]}"; do
  if [ -f "$file" ]; then
    cp "$file" "$TEMP_DIR/"
    echo "  - Copied $file"
  else
    echo "  - Warning: $file not found"
  fi
done

# Create directories
mkdir -p "$TEMP_DIR/uploads"
echo "Created uploads directory"

# Create a basic index.html for the dist/public directory
mkdir -p "$TEMP_DIR/dist/public"
cat > "$TEMP_DIR/dist/public/index.html" << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OBview.io</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: linear-gradient(to right, #2b5876, #4e4376);
      color: white;
      margin: 0;
      padding: 0;
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      text-align: center;
    }
    .container {
      max-width: 800px;
      padding: 40px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 10px;
      box-shadow: 0 10px 20px rgba(0, 0, 0, 0.3);
    }
    h1 {
      font-size: 3rem;
      margin-bottom: 0.5rem;
      background: linear-gradient(to right, #ff8a00, #da1b60);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      font-weight: 700;
    }
    p {
      font-size: 1.2rem;
      line-height: 1.6;
      margin-bottom: 1.5rem;
    }
    .login-btn {
      display: inline-block;
      padding: 12px 24px;
      background: linear-gradient(to right, #ff8a00, #da1b60);
      color: white;
      text-decoration: none;
      border-radius: 5px;
      font-weight: 600;
      transition: all 0.3s ease;
    }
    .login-btn:hover {
      transform: translateY(-3px);
      box-shadow: 0 5px 15px rgba(218, 27, 96, 0.4);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>OBview.io</h1>
    <p>A collaborative media review platform for teams to review, comment, and approve files in a streamlined workflow.</p>
    <a href="/auth" class="login-btn">Log In / Register</a>
  </div>
</body>
</html>
EOF
echo "Created placeholder index.html"

# Create TAR archive
PACKAGE_NAME="obview-$(date +"%Y%m%d").tar.gz"
OUTPUT_DIR="$PWD"
cd "$TEMP_DIR"
tar -czf "$OUTPUT_DIR/$PACKAGE_NAME" .
cd - > /dev/null

echo "Created package: $OUTPUT_DIR/$PACKAGE_NAME"

# Clean up
rm -rf "$TEMP_DIR"
echo "Cleaned up temporary directory"

echo ""
echo "Package created successfully!"
echo "To deploy, extract the package and run the installation script:"
echo "  tar -xzf $PACKAGE_NAME"
echo "  cd obview-*"
echo "  sudo chmod +x install.sh"
echo "  sudo ./install.sh"
echo ""