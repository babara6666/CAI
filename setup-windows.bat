@echo off
REM CAD AI Platform - Windows Setup Script
REM This script sets up the CAD AI Platform on Windows

echo 🚀 CAD AI Platform - Windows Setup
echo ===================================

REM Check if we're in the right directory
if not exist "package.json" (
    echo ❌ Error: package.json not found
    echo.
    echo You need to be in the CAD AI Platform directory.
    echo Current directory: %CD%
    echo.
    echo Please navigate to the directory containing the CAD AI Platform files
    echo and run this script again.
    echo.
    pause
    exit /b 1
)

if not exist "docker-compose.yml" (
    echo ❌ Error: docker-compose.yml not found
    echo.
    echo You need to be in the CAD AI Platform directory.
    echo Please navigate to the directory containing the CAD AI Platform files.
    echo.
    pause
    exit /b 1
)

echo ✅ Found CAD AI Platform files in current directory
echo.

REM Check prerequisites
echo 📋 Checking prerequisites...

REM Check Docker
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not installed or not in PATH
    echo.
    echo Please install Docker Desktop for Windows:
    echo https://docker.com/products/docker-desktop/
    echo.
    pause
    exit /b 1
)
echo ✅ Docker is installed

REM Check if Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not running
    echo.
    echo Please start Docker Desktop and wait for it to be ready
    echo (look for green icon in system tray)
    echo.
    pause
    exit /b 1
)
echo ✅ Docker is running

REM Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed or not in PATH
    echo.
    echo Please install Node.js (v18 or higher):
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo ✅ Node.js is installed

REM Check npm
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm is not available
    echo.
    echo npm should come with Node.js. Please reinstall Node.js.
    echo.
    pause
    exit /b 1
)
echo ✅ npm is available

echo.
echo 🔧 Setting up environment...

REM Create .env file if it doesn't exist
if not exist ".env" (
    if exist ".env.example" (
        echo 📝 Creating .env file from template...
        copy .env.example .env >nul
        echo ✅ Environment file created
    ) else (
        echo ❌ .env.example not found
        echo Creating basic .env file...
        echo # CAD AI Platform Environment > .env
        echo DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cad_ai_platform >> .env
        echo REDIS_URL=redis://localhost:6379 >> .env
        echo JWT_SECRET=your-super-secret-jwt-key-change-this-in-production >> .env
        echo VITE_API_URL=http://localhost:3001 >> .env
        echo VITE_AI_SERVICE_URL=http://localhost:8002 >> .env
        echo ✅ Basic environment file created
    )
) else (
    echo ✅ Environment file already exists
)

echo.
echo 📦 Installing dependencies...
npm install
if %errorlevel% neq 0 (
    echo ❌ Failed to install dependencies
    echo.
    echo Try running these commands manually:
    echo   npm cache clean --force
    echo   npm install
    echo.
    pause
    exit /b 1
)
echo ✅ Dependencies installed

echo.
echo 🐳 Starting Docker services...
docker-compose up -d
if %errorlevel% neq 0 (
    echo ❌ Failed to start Docker services
    echo.
    echo Please check Docker Desktop is running and try again.
    echo.
    pause
    exit /b 1
)
echo ✅ Docker services started

echo.
echo ⏳ Waiting for services to be ready (60 seconds)...
timeout /t 60 /nobreak >nul

echo.
echo 🗄️ Setting up database...
docker-compose exec -T backend npm run migrate
if %errorlevel% neq 0 (
    echo ⚠️ Database migration failed, but continuing...
    echo This might be normal on first run.
)

docker-compose exec -T backend npm run seed
if %errorlevel% neq 0 (
    echo ⚠️ Database seeding failed, but continuing...
    echo This might be normal on first run.
)

echo.
echo 🔍 Checking service health...

REM Check if services are responding
curl -s http://localhost:3001/health >nul 2>&1
if %errorlevel%==0 (
    echo ✅ Backend API is responding
) else (
    echo ⚠️ Backend API not ready yet (this is normal, it may take a few more minutes)
)

curl -s http://localhost:8002/health >nul 2>&1
if %errorlevel%==0 (
    echo ✅ AI Service is responding
) else (
    echo ⚠️ AI Service not ready yet (this is normal, it may take a few more minutes)
)

echo.
echo 🎉 Setup Complete!
echo ==================

echo.
echo 📱 Your CAD AI Platform is starting up!
echo.
echo 🌐 Access URLs:
echo   Frontend (Web App): http://localhost:3000
echo   Backend API:        http://localhost:3001
echo   AI Service:         http://localhost:8002
echo   MinIO Console:      http://localhost:9001
echo.
echo 👤 Default Login Credentials:
echo   Admin: admin@example.com / AdminPassword123!
echo   User:  user@example.com / UserPassword123!
echo.
echo 📋 Useful Commands:
echo   Check status:    docker-compose ps
echo   View logs:       docker-compose logs -f
echo   Stop services:   docker-compose down
echo   Restart:         docker-compose restart
echo.
echo 🔧 Troubleshooting:
echo   If services aren't ready, wait a few more minutes
echo   Check logs with: docker-compose logs -f
echo   Restart with: docker-compose restart
echo.

REM Try to open the web browser
echo 🌐 Opening web browser...
start http://localhost:3000

echo.
echo ✅ Setup completed successfully!
echo.
echo The web application should open in your browser.
echo If not, manually go to: http://localhost:3000
echo.
echo Press any key to view service logs, or close this window.
pause >nul

REM Show logs
echo.
echo 📋 Service Logs (Press Ctrl+C to stop):
echo ========================================
docker-compose logs -f