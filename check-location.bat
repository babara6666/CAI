@echo off
REM Check if you're in the right location for CAD AI Platform

echo 🔍 Checking Current Location
echo ============================

echo Current directory: %CD%
echo.

echo 📁 Looking for CAD AI Platform files...
echo.

if exist "package.json" (
    echo ✅ package.json found
) else (
    echo ❌ package.json NOT found
)

if exist "docker-compose.yml" (
    echo ✅ docker-compose.yml found
) else (
    echo ❌ docker-compose.yml NOT found
)

if exist "frontend" (
    echo ✅ frontend/ directory found
) else (
    echo ❌ frontend/ directory NOT found
)

if exist "backend" (
    echo ✅ backend/ directory found
) else (
    echo ❌ backend/ directory NOT found
)

if exist "ai-service" (
    echo ✅ ai-service/ directory found
) else (
    echo ❌ ai-service/ directory NOT found
)

echo.

if exist "package.json" if exist "docker-compose.yml" if exist "frontend" if exist "backend" if exist "ai-service" (
    echo 🎉 SUCCESS: You are in the CAD AI Platform directory!
    echo.
    echo You can now run:
    echo   setup-windows.bat    - to set up the platform
    echo   scripts\start-platform.bat - to start the platform
    echo.
) else (
    echo ❌ You are NOT in the CAD AI Platform directory
    echo.
    echo 📋 What you need to do:
    echo.
    echo 1. Navigate to the directory containing the CAD AI Platform files
    echo    This should be where you have all the project files
    echo.
    echo 2. Look for a directory that contains:
    echo    - package.json
    echo    - docker-compose.yml  
    echo    - frontend/ folder
    echo    - backend/ folder
    echo    - ai-service/ folder
    echo.
    echo 3. Use 'cd' command to navigate there, for example:
    echo    cd "C:\path\to\your\cad-ai-platform"
    echo.
    echo 4. Then run this script again to verify
    echo.
)

echo 📂 Current directory contents:
echo ==============================
dir /b

echo.
pause