# CAD AI Platform

A comprehensive web-based system for managing, searching, and interacting with CAD files using artificial intelligence.

## Features

- **File Management**: Upload, organize, and version control CAD files
- **AI-Powered Search**: Natural language search capabilities using custom-trained models
- **3D Visualization**: Browser-based CAD file preview with WebGL
- **Custom AI Models**: Train specialized models on your CAD datasets
- **Role-Based Access**: Admin, engineer, and viewer roles with appropriate permissions
- **RESTful API**: Complete API for system integration
- **Audit Logging**: Comprehensive tracking and reporting

## Architecture

This is a monorepo containing:

- **Frontend**: React 18 + TypeScript + Material-UI
- **Backend**: Node.js + Express + TypeScript
- **AI Service**: Python + FastAPI + TensorFlow/PyTorch
- **Database**: PostgreSQL with Redis caching
- **Storage**: MinIO (S3-compatible) for file storage

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.11+
- Docker & Docker Compose

### Development Setup

1. **Clone and install dependencies**:
   ```bash
   git clone <repository-url>
   cd cad-ai-platform
   npm install
   ```

2. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start services with Docker**:
   ```bash
   npm run docker:up
   ```

4. **Start development servers**:
   ```bash
   npm run dev
   ```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- AI Service: http://localhost:8002
- MinIO Console: http://localhost:9001

### Manual Setup (without Docker)

1. **Start PostgreSQL and Redis**:
   ```bash
   # Install and start PostgreSQL
   createdb cad_ai_platform
   
   # Install and start Redis
   redis-server
   ```

2. **Install Python dependencies**:
   ```bash
   cd ai-service
   pip install -r requirements.txt
   cd ..
   ```

3. **Start all services**:
   ```bash
   npm run dev
   ```

## Project Structure

```
cad-ai-platform/
├── frontend/                 # React frontend application
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── Dockerfile
├── backend/                  # Node.js backend API
│   ├── src/
│   ├── package.json
│   └── Dockerfile
├── ai-service/              # Python AI/ML service
│   ├── main.py
│   ├── requirements.txt
│   └── Dockerfile
├── database/                # Database scripts
│   └── init.sql
├── nginx/                   # Nginx configuration
│   └── nginx.conf
├── docker-compose.yml       # Docker services
└── package.json            # Root package.json
```

## Available Scripts

### Root Level
- `npm run dev` - Start all services in development mode
- `npm run build` - Build all services
- `npm run test` - Run tests for all services
- `npm run docker:up` - Start Docker services
- `npm run docker:down` - Stop Docker services

### Frontend
- `npm run dev --workspace=frontend` - Start React dev server
- `npm run build --workspace=frontend` - Build for production
- `npm run test --workspace=frontend` - Run frontend tests

### Backend
- `npm run dev --workspace=backend` - Start backend with hot reload
- `npm run build --workspace=backend` - Build TypeScript
- `npm run test --workspace=backend` - Run backend tests

### AI Service
- `npm run dev --workspace=ai-service` - Start FastAPI with hot reload
- `npm run test --workspace=ai-service` - Run Python tests

## Environment Variables

Copy `.env.example` to `.env` and configure:

- **Database**: PostgreSQL connection settings
- **Redis**: Cache configuration
- **MinIO/S3**: File storage settings
- **JWT**: Authentication secrets
- **API**: Service URLs and ports

## API Documentation

Once running, API documentation is available at:
- Backend API: http://localhost:3001/docs
- AI Service: http://localhost:8002/docs

## Testing

Run tests for all services:
```bash
npm run test
```

Or run tests for specific services:
```bash
npm run test --workspace=frontend
npm run test --workspace=backend
npm run test --workspace=ai-service
```

## Deployment

### Production with Docker

1. Build production images:
   ```bash
   npm run docker:build
   ```

2. Start with production profile:
   ```bash
   docker-compose --profile production up -d
   ```

### Manual Deployment

1. Build all services:
   ```bash
   npm run build
   ```

2. Set production environment variables

3. Start services with process manager (PM2, systemd, etc.)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run linting and tests
6. Submit a pull request

## License

[Your License Here]

## Support

For support and questions, please [create an issue](link-to-issues) or contact the development team.