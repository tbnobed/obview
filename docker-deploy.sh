#!/bin/bash
set -e

echo "🐳 Starting Obviu.io Docker Deployment"

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Creating from template..."
    cp .env.example .env
    echo "📝 Please edit .env file with your settings before continuing:"
    echo "   - POSTGRES_PASSWORD (use a strong password)"
    echo "   - SESSION_SECRET (generate a random string)"
    echo "   - SENDGRID_API_KEY (for email functionality)"
    echo ""
    echo "Press Enter when you've updated the .env file..."
    read
fi

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker compose down

# Clean up old images (optional)
echo "🧹 Cleaning up old Docker images..."
docker image prune -f

# Build and start
echo "🚀 Building and starting services..."
docker compose up -d --build

# Show status
echo "📊 Container status:"
docker compose ps

echo ""
echo "✅ Deployment complete!"
echo "🌐 Application should be available at: http://localhost:5000"
echo "📋 View logs: docker compose logs -f"
echo "🔧 Check health: docker compose ps"