"""
FastAPI application for AI/ML operations in the CAD AI Platform.
Handles model training, inference, and dataset management.
"""

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.api.routes import training, models, datasets, inference
from src.core.config import get_settings
from src.core.database import init_db
from src.core.redis_client import init_redis
from src.core.celery_app import celery_app


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager for startup and shutdown events."""
    # Startup
    settings = get_settings()
    
    # Initialize database connection
    await init_db()
    
    # Initialize Redis connection
    await init_redis()
    
    # Start Celery worker (in production, this would be a separate process)
    if settings.environment == "development":
        # For development, we can start a worker thread
        pass
    
    print("AI Service started successfully")
    
    yield
    
    # Shutdown
    print("AI Service shutting down")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()
    
    app = FastAPI(
        title="CAD AI Service",
        description="AI/ML service for CAD file processing and intelligent search",
        version="1.0.0",
        lifespan=lifespan,
    )
    
    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Include API routes
    app.include_router(training.router, prefix="/api/training", tags=["training"])
    app.include_router(models.router, prefix="/api/models", tags=["models"])
    app.include_router(datasets.router, prefix="/api/datasets", tags=["datasets"])
    app.include_router(inference.router, prefix="/api/inference", tags=["inference"])
    
    @app.get("/health")
    async def health_check():
        """Health check endpoint."""
        return {"status": "healthy", "service": "ai-service"}
    
    @app.exception_handler(Exception)
    async def global_exception_handler(request, exc):
        """Global exception handler."""
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "An unexpected error occurred",
                    "details": str(exc) if settings.debug else None,
                }
            }
        )
    
    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    
    settings = get_settings()
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=8002,
        reload=settings.debug,
        log_level="info",
    )