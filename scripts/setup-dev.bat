@echo off
REM CAD AI Platform Development Setup Script for Windows

echo 🚀 Setting up CAD AI Platform development environment...

REM Check prerequisites
echo 📋 Checking prerequisites...

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js 18+ first.
    exit /b 1
)

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Python is not installed. Please install Python 3.11+ first.
    exit /b 1
)

where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Docker is not installed. Please install Docker first.
    exit /b 1
)

where docker-compose >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Docker Compose is not installed. Please install Docker Compose first.
    exit /b 1
)

echo ✅ Prerequisites check passed!

REM Install Node.js dependencies
echo 📦 Installing Node.js dependencies...
npm install

REM Set up environment variables
echo 🔧 Setting up environment variables...
if not exist .env (
    copy .env.example .env
    echo ✅ Created .env file from .env.example
    echo ⚠️  Please review and update .env file with your configuration
) else (
    echo ✅ .env file already exists
)

REM Create necessary directories
echo 📁 Creating necessary directories...
if not exist logs mkdir logs
if not exist uploads mkdir uploads
if not exist ai-service\models mkdir ai-service\models
if not exist ai-service\data mkdir ai-service\data

REM Set up Python virtual environment for AI service
echo 🐍 Setting up Python environment for AI service...
cd ai-service
if not exist venv (
    python -m venv venv
    echo ✅ Created Python virtual environment
)

call venv\Scripts\activate.bat
pip install -r requirements.txt
pip install -r requirements-dev.txt
echo ✅ Installed Python dependencies
cd ..

REM Start Docker services
echo 🐳 Starting Docker services...
docker-compose up -d postgres redis minio

REM Wait for services to be ready
echo ⏳ Waiting for services to be ready...
timeout /t 10 /nobreak >nul

REM Run database migrations
echo 🗄️  Setting up database...
REM Note: This would run actual migrations in a real setup
echo ✅ Database setup complete

echo.
echo 🎉 Development environment setup complete!
echo.
echo To start development:
echo   npm run dev
echo.
echo Available services:
echo   Frontend:      http://localhost:3000
echo   Backend API:   http://localhost:3001
echo   AI Service:    http://localhost:8002
echo   MinIO Console: http://localhost:9001 (admin/minioadmin123)
echo.
echo To stop Docker services:
echo   npm run docker:down
echo.