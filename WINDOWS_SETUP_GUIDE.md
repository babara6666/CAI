# CAD AI Platform - Windows Setup Guide

## 🚀 Quick Start for Windows PC

Since you already have the CAD AI Platform code in your current directory, follow these steps:

### Step 1: Verify Your Current Location

First, check that you're in the right directory:

```cmd
# Check current directory
dir

# You should see these folders/files:
# - frontend/
# - backend/
# - ai-service/
# - docker-compose.yml
# - package.json
# - README.md
```

If you don't see these files, you need to navigate to where the CAD AI Platform code is located.

### Step 2: Install Prerequisites

Make sure you have these installed:

1. **Docker Desktop for Windows**
   - Download from: https://docker.com/products/docker-desktop/
   - Install and start Docker Desktop
   - Verify: `docker --version`

2. **Node.js (v18 or higher)**
   - Download from: https://nodejs.org/
   - Install the LTS version
   - Verify: `node --version` and `npm --version`

3. **Git for Windows** (if not already installed)
   - Download from: https://git-scm.com/download/win
   - Verify: `git --version`

### Step 3: Setup Environment

```cmd
# 1. Copy environment configuration
copy .env.example .env

# 2. Install dependencies
npm install
```

### Step 4: Start the Platform (Easy Method)

```cmd
# Run the automated startup script
scripts\start-platform.bat
```

This script will:
- ✅ Check if Docker is running
- ✅ Create environment file if needed
- ✅ Start all Docker services
- ✅ Set up the database
- ✅ Check service health
- ✅ Open your browser to the application

### Step 5: Alternative Manual Setup

If the automated script doesn't work, try manual setup:

```cmd
# 1. Start Docker services
docker-compose up -d

# 2. Wait for services to start (2-3 minutes)
timeout /t 120

# 3. Set up database
docker-compose exec backend npm run migrate
docker-compose exec backend npm run seed

# 4. Check if services are running
docker-compose ps
```

### Step 6: Access the Application

Once everything is running:

- **Frontend (Web App)**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **AI Service**: http://localhost:8002
- **MinIO Console**: http://localhost:9001

**Default Login Credentials:**
- Admin: `admin@example.com` / `AdminPassword123!`
- User: `user@example.com` / `UserPassword123!`

## 🔧 Troubleshooting Common Windows Issues

### Issue 1: "Cannot find directory"

If you get an error about not finding the directory:

```cmd
# Check where you are
cd

# List files in current directory
dir

# If you don't see the CAD AI Platform files, you might need to:
# 1. Navigate to the correct folder where you have the code
# 2. Or create a new folder and copy the files there
```

### Issue 2: Docker not running

```cmd
# Check if Docker is running
docker --version

# If not working:
# 1. Open Docker Desktop application
# 2. Wait for it to start (green icon in system tray)
# 3. Try again
```

### Issue 3: Port conflicts

```cmd
# Check what's using the ports
netstat -an | findstr :3000
netstat -an | findstr :3001
netstat -an | findstr :5432

# If ports are in use, either:
# 1. Stop the conflicting applications
# 2. Or edit .env file to use different ports
```

### Issue 4: Permission errors

```cmd
# Run Command Prompt as Administrator
# Right-click on Command Prompt -> "Run as administrator"
```

### Issue 5: npm install fails

```cmd
# Clear npm cache
npm cache clean --force

# Delete node_modules and try again
rmdir /s node_modules
npm install
```

## 🎯 Step-by-Step Verification

Run these commands to verify everything is working:

```cmd
# 1. Check Docker
docker --version
docker info

# 2. Check Node.js
node --version
npm --version

# 3. Check project files exist
dir package.json
dir docker-compose.yml
dir frontend\package.json
dir backend\package.json

# 4. Validate setup
node scripts\validate-setup.js

# 5. Start services
docker-compose up -d

# 6. Check services are running
docker-compose ps

# 7. Test health endpoints
curl http://localhost:3001/health
curl http://localhost:8002/health
```

## 🚀 Using the Application

### 1. Open Web Browser
Go to: http://localhost:3000

### 2. Login
Use these credentials:
- **Admin**: admin@example.com / AdminPassword123!
- **User**: user@example.com / UserPassword123!

### 3. Upload CAD Files
1. Click "Files" in the navigation
2. Click "Upload Files"
3. Drag and drop CAD files (DWG, DXF, STEP, etc.)
4. Add project name and tags
5. Click "Upload"

### 4. Search for Files
1. Go to "Search"
2. Enter queries like:
   - "Find mechanical parts"
   - "Show electrical components"
   - "Structural elements"

### 5. Train AI Models
1. Navigate to "AI" → "Datasets"
2. Create a dataset with your uploaded files
3. Go to "AI" → "Training"
4. Configure and start training

## 📊 Monitoring

### View Logs
```cmd
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f ai-service
```

### Stop Services
```cmd
# Stop all services
docker-compose down

# Stop and remove all data
docker-compose down -v
```

### Restart Services
```cmd
# Restart all services
docker-compose restart

# Restart specific service
docker-compose restart backend
```

## 🆘 Getting Help

If you're still having issues:

1. **Check the current directory**: Make sure you're in the folder with the CAD AI Platform files
2. **Verify Docker is running**: Look for Docker Desktop in your system tray
3. **Check ports**: Make sure ports 3000, 3001, 5432, 6379, 8002, 9000 are available
4. **Run validation**: `node scripts\validate-setup.js`
5. **Check logs**: `docker-compose logs -f`

## 📝 Quick Commands Reference

```cmd
# Setup
copy .env.example .env
npm install

# Start everything
scripts\start-platform.bat

# Manual start
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Stop everything
docker-compose down

# Validate setup
node scripts\validate-setup.js
```

---

**🎉 Once you see the web interface at http://localhost:3000, you're all set!**

The CAD AI Platform is now running with all features:
- File upload and management
- 3D CAD file visualization
- AI-powered search
- Model training capabilities
- Admin dashboard
- Complete API system