@echo off
REM CAD AI Platform Startup Script for Windows

echo 🚀 Starting CAD AI Platform...
echo ================================

REM Check if Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not running. Please start Docker Desktop and try again.
    pause
    exit /b 1
)

REM Check if .env file exists
if not exist ".env" (
    echo 📝 Creating environment configuration...
    copy .env.example .env
    echo ✅ Environment file created. Please review .env file if needed.
)

echo 🐳 Starting Docker services...
docker-compose up -d

echo ⏳ Waiting for services to start (60 seconds)...
timeout /t 60 /nobreak >nul

echo 🗄️ Setting up database...
docker-compose exec -T backend npm run migrate
if %errorlevel% neq 0 (
    echo ⚠️ Database migration failed, but continuing...
)

docker-compose exec -T backend npm run seed
if %errorlevel% neq 0 (
    echo ⚠️ Database seeding failed, but continuing...
)

echo 🔍 Checking service health...

REM Check Backend
curl -s http://localhost:3001/health >nul
if %errorlevel%==0 (
    echo ✅ Backend is running
) else (
    echo ⚠️ Backend may not be ready yet
)

REM Check AI Service
curl -s http://localhost:8002/health >nul
if %errorlevel%==0 (
    echo ✅ AI Service is running
) else (
    echo ⚠️ AI Service may not be ready yet
)

echo.
echo 🎉 CAD AI Platform is starting up!
echo.
echo 📱 Access the application at:
echo    Frontend:     http://localhost:3000
echo    Backend API:  http://localhost:3001
echo    AI Service:   http://localhost:8002
echo    MinIO Console: http://localhost:9001
echo.
echo 👤 Default login credentials:
echo    Admin: admin@example.com / AdminPassword123!
echo    User:  user@example.com / UserPassword123!
echo.
echo 📋 Useful commands:
echo    View logs:    docker-compose logs -f
echo    Stop services: docker-compose down
echo    Restart:      docker-compose restart
echo.

REM Open browser to the application
start http://localhost:3000

echo Press any key to view service logs, or close this window to continue...
pause >nul

REM Show logs
docker-compose logs -f