#!/usr/bin/env node

/**
 * CAD AI Platform Setup Validation Script
 * This script validates that all components are properly configured and running
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkFile(filePath, description) {
  if (fs.existsSync(filePath)) {
    log(`✅ ${description}`, 'green');
    return true;
  } else {
    log(`❌ ${description} - Missing: ${filePath}`, 'red');
    return false;
  }
}

function checkCommand(command, description) {
  try {
    execSync(command, { stdio: 'ignore' });
    log(`✅ ${description}`, 'green');
    return true;
  } catch (error) {
    log(`❌ ${description}`, 'red');
    return false;
  }
}

function checkPort(port, service) {
  try {
    const result = execSync(`curl -s http://localhost:${port}/health`, { encoding: 'utf8' });
    log(`✅ ${service} is running on port ${port}`, 'green');
    return true;
  } catch (error) {
    log(`❌ ${service} is not responding on port ${port}`, 'red');
    return false;
  }
}

async function main() {
  log('🔍 CAD AI Platform Setup Validation', 'blue');
  log('=====================================', 'blue');
  
  let allChecks = true;
  
  // Check prerequisites
  log('\n📋 Checking Prerequisites:', 'yellow');
  allChecks &= checkCommand('node --version', 'Node.js is installed');
  allChecks &= checkCommand('npm --version', 'npm is installed');
  allChecks &= checkCommand('docker --version', 'Docker is installed');
  allChecks &= checkCommand('docker-compose --version', 'Docker Compose is installed');
  allChecks &= checkCommand('python --version', 'Python is installed');
  
  // Check project structure
  log('\n📁 Checking Project Structure:', 'yellow');
  allChecks &= checkFile('package.json', 'Root package.json exists');
  allChecks &= checkFile('docker-compose.yml', 'Docker Compose configuration exists');
  allChecks &= checkFile('.env.example', 'Environment template exists');
  allChecks &= checkFile('frontend/package.json', 'Frontend package.json exists');
  allChecks &= checkFile('backend/package.json', 'Backend package.json exists');
  allChecks &= checkFile('ai-service/requirements.txt', 'AI service requirements exist');
  
  // Check Docker files
  log('\n🐳 Checking Docker Configuration:', 'yellow');
  allChecks &= checkFile('frontend/Dockerfile', 'Frontend Dockerfile exists');
  allChecks &= checkFile('frontend/Dockerfile.dev', 'Frontend dev Dockerfile exists');
  allChecks &= checkFile('backend/Dockerfile', 'Backend Dockerfile exists');
  allChecks &= checkFile('ai-service/Dockerfile', 'AI service Dockerfile exists');
  
  // Check environment configuration
  log('\n⚙️ Checking Environment Configuration:', 'yellow');
  if (fs.existsSync('.env')) {
    log('✅ Environment file (.env) exists', 'green');
    
    const envContent = fs.readFileSync('.env', 'utf8');
    const requiredVars = [
      'DATABASE_URL',
      'REDIS_URL',
      'JWT_SECRET',
      'MINIO_ACCESS_KEY',
      'MINIO_SECRET_KEY'
    ];
    
    for (const varName of requiredVars) {
      if (envContent.includes(varName)) {
        log(`✅ ${varName} is configured`, 'green');
      } else {
        log(`❌ ${varName} is missing from .env`, 'red');
        allChecks = false;
      }
    }
  } else {
    log('⚠️ Environment file (.env) not found. Creating from template...', 'yellow');
    try {
      fs.copyFileSync('.env.example', '.env');
      log('✅ Environment file created from template', 'green');
    } catch (error) {
      log('❌ Failed to create environment file', 'red');
      allChecks = false;
    }
  }
  
  // Check if Docker is running
  log('\n🐳 Checking Docker Status:', 'yellow');
  try {
    execSync('docker info', { stdio: 'ignore' });
    log('✅ Docker is running', 'green');
    
    // Check if services are running
    try {
      const result = execSync('docker-compose ps --services --filter status=running', { encoding: 'utf8' });
      const runningServices = result.trim().split('\n').filter(s => s.length > 0);
      
      if (runningServices.length > 0) {
        log(`✅ Docker services are running: ${runningServices.join(', ')}`, 'green');
        
        // Check service health
        log('\n🏥 Checking Service Health:', 'yellow');
        setTimeout(() => {
          checkPort(3001, 'Backend API');
          checkPort(8002, 'AI Service');
          checkPort(3000, 'Frontend');
        }, 2000);
        
      } else {
        log('⚠️ No Docker services are currently running', 'yellow');
        log('💡 Run "docker-compose up -d" to start services', 'blue');
      }
    } catch (error) {
      log('⚠️ Could not check Docker service status', 'yellow');
    }
    
  } catch (error) {
    log('❌ Docker is not running or not accessible', 'red');
    log('💡 Please start Docker Desktop and try again', 'blue');
    allChecks = false;
  }
  
  // Check dependencies
  log('\n📦 Checking Dependencies:', 'yellow');
  
  // Check if node_modules exist
  if (fs.existsSync('node_modules')) {
    log('✅ Root dependencies are installed', 'green');
  } else {
    log('⚠️ Root dependencies not installed', 'yellow');
    log('💡 Run "npm install" to install dependencies', 'blue');
  }
  
  if (fs.existsSync('frontend/node_modules')) {
    log('✅ Frontend dependencies are installed', 'green');
  } else {
    log('⚠️ Frontend dependencies not installed', 'yellow');
  }
  
  if (fs.existsSync('backend/node_modules')) {
    log('✅ Backend dependencies are installed', 'green');
  } else {
    log('⚠️ Backend dependencies not installed', 'yellow');
  }
  
  // Final summary
  log('\n📊 Validation Summary:', 'magenta');
  log('=====================', 'magenta');
  
  if (allChecks) {
    log('🎉 All checks passed! Your CAD AI Platform is ready to run.', 'green');
    log('\n🚀 To start the platform:', 'blue');
    log('   Windows: scripts\\start-platform.bat', 'blue');
    log('   Linux/Mac: ./scripts/start-platform.sh', 'blue');
    log('   Manual: docker-compose up -d', 'blue');
  } else {
    log('⚠️ Some issues were found. Please address them before starting the platform.', 'yellow');
    log('\n🔧 Common fixes:', 'blue');
    log('   1. Install missing prerequisites', 'blue');
    log('   2. Run "npm install" to install dependencies', 'blue');
    log('   3. Copy .env.example to .env and configure', 'blue');
    log('   4. Start Docker Desktop', 'blue');
  }
  
  log('\n📚 For detailed setup instructions, see SETUP_GUIDE.md', 'blue');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };