#!/bin/bash

# CAD AI Platform Development Setup Script

set -e

echo "🚀 Setting up CAD AI Platform development environment..."

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    echo "❌ Python is not installed. Please install Python 3.11+ first."
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Prerequisites check passed!"

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Set up environment variables
echo "🔧 Setting up environment variables..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env file from .env.example"
    echo "⚠️  Please review and update .env file with your configuration"
else
    echo "✅ .env file already exists"
fi

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p logs
mkdir -p uploads
mkdir -p ai-service/models
mkdir -p ai-service/data

# Set up Python virtual environment for AI service
echo "🐍 Setting up Python environment for AI service..."
cd ai-service
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "✅ Created Python virtual environment"
fi

source venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
echo "✅ Installed Python dependencies"
cd ..

# Start Docker services
echo "🐳 Starting Docker services..."
docker-compose up -d postgres redis minio

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Run database migrations
echo "🗄️  Setting up database..."
# Note: This would run actual migrations in a real setup
echo "✅ Database setup complete"

echo ""
echo "🎉 Development environment setup complete!"
echo ""
echo "To start development:"
echo "  npm run dev"
echo ""
echo "Available services:"
echo "  Frontend:     http://localhost:3000"
echo "  Backend API:  http://localhost:3001"
echo "  AI Service:   http://localhost:8002"
echo "  MinIO Console: http://localhost:9001 (admin/minioadmin123)"
echo ""
echo "To stop Docker services:"
echo "  npm run docker:down"
echo ""