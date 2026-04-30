#!/bin/bash

# IMS Setup and Initialization Script
# Run this script to set up the development environment

set -e

echo "================================================"
echo "Incident Management System - Setup Script"
echo "================================================"
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

echo "✅ Docker found"

# Check Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker Compose found"

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo ""
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "✅ .env file created. Please update it with your configuration."
fi

# Install dependencies
echo ""
echo "📦 Installing Backend dependencies..."
cd Backend
npm install
cd ..

echo "✅ Backend dependencies installed"

echo ""
echo "📦 Installing Frontend dependencies..."
cd frontend
npm install
cd ..

echo "✅ Frontend dependencies installed"

# Build Docker images
echo ""
echo "🐳 Building Docker images..."
docker-compose build

echo "✅ Docker images built"

# Start services
echo ""
echo "🚀 Starting services..."
docker-compose up -d

echo "✅ Services started"

# Wait for services to be ready
echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check health
echo ""
echo "🏥 Checking service health..."

# Check Backend
if curl -f http://localhost:8081/health > /dev/null 2>&1; then
    echo "✅ Backend is healthy"
else
    echo "⚠️  Backend is not responding yet, it may still be starting..."
fi

# Summary
echo ""
echo "================================================"
echo "Setup Complete! 🎉"
echo "================================================"
echo ""
echo "Available services:"
echo "  • Backend API: http://localhost:8081"
echo "  • Frontend: http://localhost:5173"
echo "  • PostgreSQL: localhost:5432"
echo "  • MongoDB: localhost:27017"
echo "  • Redis: localhost:6379"
echo "  • RabbitMQ: http://localhost:15672 (guest/guest)"
echo ""
echo "Next steps:"
echo "  1. View logs: docker-compose logs -f"
echo "  2. Run tests: cd Backend && npm test"
echo "  3. Check metrics: curl http://localhost:8081/metrics/json"
echo ""
echo "To stop services:"
echo "  docker-compose down"
echo ""
echo "For more information, see ENHANCEMENTS.md and PERFORMANCE_GUIDE.md"
echo ""
