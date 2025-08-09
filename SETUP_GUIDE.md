# CAD AI Platform - Complete Setup Guide

## 🚀 How to Run the Complete End-to-End Web Application

This guide will walk you through setting up and running the entire CAD AI Platform from scratch.

## 📋 Prerequisites

Before starting, ensure you have the following installed:

### Required Software:
- **Node.js** (v18.0.0 or higher) - [Download here](https://nodejs.org/)
- **Python** (v3.11 or higher) - [Download here](https://python.org/)
- **Docker Desktop** - [Download here](https://docker.com/products/docker-desktop/)
- **Git** - [Download here](https://git-scm.com/)

### System Requirements:
- **RAM**: 8GB minimum, 16GB recommended
- **Storage**: 10GB free space
- **OS**: Windows 10/11, macOS 10.15+, or Linux

## 🛠️ Quick Start (Recommended)

### Option 1: Docker Setup (Easiest)

1. **Clone the repository**:
   ```bash
   git clone <your-repository-url>
   cd cad-ai-platform
   ```

2. **Copy environment configuration**:
   ```bash
   # Windows
   copy .env.example .env
   
   # macOS/Linux
   cp .env.example .env
   ```

3. **Start all services with Docker**:
   ```bash
   docker-compose up -d
   ```

4. **Wait for services to start** (about 2-3 minutes):
   ```bash
   # Check if all services are running
   docker-compose ps
   ```

5. **Initialize the database**:
   ```bash
   # Run database migrations
   docker-compose exec backend npm run migrate
   
   # Seed initial data
   docker-compose exec backend npm run seed
   ```

6. **Access the application**:
   - **Frontend**: http://localhost:3000
   - **Backend API**: http://localhost:3001
   - **AI Service**: http://localhost:8002
   - **MinIO Console**: http://localhost:9001 (admin/minioadmin123)

### Option 2: Manual Setup (For Development)

If you prefer to run services individually:

1. **Clone and install dependencies**:
   ```bash
   git clone <your-repository-url>
   cd cad-ai-platform
   npm install
   ```

2. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env file with your preferred settings
   ```

3. **Start infrastructure services**:
   ```bash
   # Start PostgreSQL, Redis, and MinIO
   docker-compose up -d postgres redis minio
   ```

4. **Install Python dependencies**:
   ```bash
   cd ai-service
   pip install -r requirements.txt
   cd ..
   ```

5. **Run database setup**:
   ```bash
   cd backend
   npm run migrate
   npm run seed
   cd ..
   ```

6. **Start all development servers**:
   ```bash
   # This starts frontend, backend, and AI service
   npm run dev
   ```

## 🔧 Detailed Setup Instructions

### Step 1: Environment Configuration

Edit your `.env` file to customize settings:

```bash
# Database settings
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cad_ai_platform

# API URLs (adjust ports if needed)
VITE_API_URL=http://localhost:3001
VITE_AI_SERVICE_URL=http://localhost:8002

# Security (IMPORTANT: Change in production!)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# File storage
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
```

### Step 2: Service Architecture

The platform consists of these services:

| Service | Port | Purpose |
|---------|------|---------|
| Frontend | 3000 | React web application |
| Backend | 3001 | Node.js API server |
| AI Service | 8002 | Python ML/AI service |
| PostgreSQL | 5432 | Main database |
| Redis | 6379 | Caching and sessions |
| MinIO | 9000/9001 | File storage |

### Step 3: First-Time Setup

After starting services, you need to:

1. **Create admin user**:
   ```bash
   # Using the API
   curl -X POST http://localhost:3001/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "email": "admin@example.com",
       "username": "admin",
       "password": "AdminPassword123!",
       "role": "admin"
     }'
   ```

2. **Create test user**:
   ```bash
   curl -X POST http://localhost:3001/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "email": "user@example.com",
       "username": "testuser",
       "password": "UserPassword123!",
       "role": "engineer"
     }'
   ```

## 🎯 Using the Application

### 1. Login to the System

1. Open http://localhost:3000 in your browser
2. Click "Login" 
3. Use credentials:
   - **Admin**: admin@example.com / AdminPassword123!
   - **User**: user@example.com / UserPassword123!

### 2. Upload CAD Files

1. Navigate to "Files" section
2. Click "Upload Files"
3. Drag and drop CAD files (DWG, DXF, STEP, etc.)
4. Add metadata (project name, tags, description)
5. Click "Upload"

### 3. Search for Files

1. Go to "Search" section
2. Enter natural language queries like:
   - "Find mechanical parts with gears"
   - "Show electrical components from last month"
   - "Structural elements for building project"
3. Use filters to refine results
4. Rate search results to improve AI

### 4. Create AI Datasets

1. Navigate to "AI" → "Datasets"
2. Click "Create Dataset"
3. Select CAD files to include
4. Add labels and categories
5. Save dataset for training

### 5. Train AI Models

1. Go to "AI" → "Training"
2. Select a dataset
3. Configure training parameters:
   - Model architecture (CNN recommended)
   - Learning rate (0.001 default)
   - Batch size (32 default)
   - Epochs (10-50 depending on data)
4. Start training and monitor progress

### 6. Admin Functions

As an admin user:

1. **User Management**: "Admin" → "Users"
   - View all users
   - Change roles and permissions
   - Deactivate accounts

2. **System Monitoring**: "Admin" → "System"
   - View system metrics
   - Monitor resource usage
   - Check service health

3. **Audit Logs**: "Admin" → "Audit"
   - Review user activities
   - Export compliance reports
   - Monitor security events

## 🧪 Testing the System

### Run All Tests

```bash
# Run complete test suite
npm run test

# Run integration tests
npm run test:integration

# Run end-to-end tests
npm run test:e2e
```

### Test Individual Components

```bash
# Frontend tests
cd frontend && npm test

# Backend tests
cd backend && npm test

# AI service tests
cd ai-service && python -m pytest
```

### Load Testing

```bash
# Install k6 (load testing tool)
# Windows: choco install k6
# macOS: brew install k6
# Linux: sudo apt install k6

# Run load tests
k6 run scripts/load-tests/api-load-test.js
k6 run scripts/load-tests/file-upload-load-test.js
k6 run scripts/load-tests/search-load-test.js
```

## 🔍 Troubleshooting

### Common Issues:

1. **Services won't start**:
   ```bash
   # Check Docker is running
   docker --version
   
   # Check ports aren't in use
   netstat -an | grep :3000
   netstat -an | grep :3001
   netstat -an | grep :5432
   ```

2. **Database connection errors**:
   ```bash
   # Reset database
   docker-compose down -v
   docker-compose up -d postgres
   
   # Wait 30 seconds, then run migrations
   docker-compose exec backend npm run migrate
   ```

3. **File upload issues**:
   ```bash
   # Check MinIO is running
   curl http://localhost:9000/minio/health/live
   
   # Reset MinIO data
   docker-compose down
   docker volume rm cad-ai-platform_minio_data
   docker-compose up -d
   ```

4. **AI service not responding**:
   ```bash
   # Check Python dependencies
   cd ai-service
   pip install -r requirements.txt
   
   # Check service logs
   docker-compose logs ai-service
   ```

### Performance Issues:

1. **Slow file uploads**:
   - Check available disk space
   - Increase `MAX_FILE_SIZE` in .env
   - Monitor network bandwidth

2. **Slow search results**:
   - Ensure Redis is running
   - Check database indexes
   - Monitor AI service resources

3. **Training takes too long**:
   - Reduce dataset size for testing
   - Lower epoch count
   - Use smaller batch sizes

## 📊 Monitoring and Logs

### View Service Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f ai-service
docker-compose logs -f frontend
```

### Health Checks

```bash
# Backend health
curl http://localhost:3001/health

# AI service health  
curl http://localhost:8002/health

# Database health
docker-compose exec postgres pg_isready
```

### Metrics and Monitoring

- **Prometheus metrics**: http://localhost:3001/metrics
- **Application logs**: `backend/logs/app.log`
- **Database logs**: `docker-compose logs postgres`

## 🚀 Production Deployment

For production deployment:

1. **Use production environment**:
   ```bash
   cp .env.production.template .env.production
   # Edit with production values
   ```

2. **Build production images**:
   ```bash
   docker-compose -f docker-compose.prod.yml build
   ```

3. **Deploy with SSL**:
   ```bash
   # Generate SSL certificates
   ./scripts/generate-ssl-certs.sh
   
   # Start with production profile
   docker-compose -f docker-compose.prod.yml up -d
   ```

4. **Set up monitoring**:
   ```bash
   # Start monitoring stack
   docker-compose -f docker-compose.monitoring.yml up -d
   ```

## 📚 Additional Resources

- **API Documentation**: http://localhost:3001/docs
- **AI Service API**: http://localhost:8002/docs
- **Database Schema**: `backend/src/database/migrations/`
- **Test Results**: `INTEGRATION_TEST_SUMMARY.md`
- **Performance Guide**: `backend/PERFORMANCE.md`

## 🆘 Getting Help

If you encounter issues:

1. Check the troubleshooting section above
2. Review service logs for error messages
3. Ensure all prerequisites are installed
4. Verify environment configuration
5. Check that all required ports are available

## 🎉 Success!

Once everything is running, you should have:

- ✅ Web interface at http://localhost:3000
- ✅ API server responding at http://localhost:3001
- ✅ AI service running at http://localhost:8002
- ✅ Database and storage systems operational
- ✅ File upload and search functionality working
- ✅ AI model training capabilities available

**Congratulations! Your CAD AI Platform is now fully operational!** 🎊

---

*For additional support or questions, please refer to the project documentation or create an issue in the repository.*