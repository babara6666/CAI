#!/bin/bash

# CAD AI Platform Startup Script for Linux/macOS

echo "🚀 Starting CAD AI Platform..."
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${BLUE}📝 Creating environment configuration...${NC}"
    cp .env.example .env
    echo -e "${GREEN}✅ Environment file created. Please review .env file if needed.${NC}"
fi

echo -e "${BLUE}🐳 Starting Docker services...${NC}"
docker-compose up -d

echo -e "${YELLOW}⏳ Waiting for services to start (60 seconds)...${NC}"
sleep 60

echo -e "${BLUE}🗄️ Setting up database...${NC}"
docker-compose exec -T backend npm run migrate || echo -e "${YELLOW}⚠️ Database migration failed, but continuing...${NC}"
docker-compose exec -T backend npm run seed || echo -e "${YELLOW}⚠️ Database seeding failed, but continuing...${NC}"

echo -e "${BLUE}🔍 Checking service health...${NC}"

# Check Backend
if curl -s http://localhost:3001/health > /dev/null; then
    echo -e "${GREEN}✅ Backend is running${NC}"
else
    echo -e "${YELLOW}⚠️ Backend may not be ready yet${NC}"
fi

# Check AI Service
if curl -s http://localhost:8002/health > /dev/null; then
    echo -e "${GREEN}✅ AI Service is running${NC}"
else
    echo -e "${YELLOW}⚠️ AI Service may not be ready yet${NC}"
fi

echo ""
echo -e "${GREEN}🎉 CAD AI Platform is starting up!${NC}"
echo ""
echo -e "${BLUE}📱 Access the application at:${NC}"
echo "   Frontend:      http://localhost:3000"
echo "   Backend API:   http://localhost:3001"
echo "   AI Service:    http://localhost:8002"
echo "   MinIO Console: http://localhost:9001"
echo ""
echo -e "${BLUE}👤 Default login credentials:${NC}"
echo "   Admin: admin@example.com / AdminPassword123!"
echo "   User:  user@example.com / UserPassword123!"
echo ""
echo -e "${BLUE}📋 Useful commands:${NC}"
echo "   View logs:     docker-compose logs -f"
echo "   Stop services: docker-compose down"
echo "   Restart:       docker-compose restart"
echo ""

# Try to open browser (works on macOS and some Linux distributions)
if command -v open > /dev/null; then
    open http://localhost:3000
elif command -v xdg-open > /dev/null; then
    xdg-open http://localhost:3000
fi

echo "Press Ctrl+C to stop viewing logs, or close this terminal to continue..."
echo ""

# Show logs
docker-compose logs -f