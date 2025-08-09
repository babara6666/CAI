"""
Configuration settings for the AI service.
"""

import os
from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings."""
    
    # Environment
    environment: str = os.getenv("ENVIRONMENT", "development")
    debug: bool = os.getenv("DEBUG", "true").lower() == "true"
    
    # Database
    database_url: str = os.getenv(
        "DATABASE_URL", 
        "postgresql://postgres:password@localhost:5432/cad_ai_platform"
    )
    
    # Redis
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    
    # Celery
    celery_broker_url: str = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/1")
    celery_result_backend: str = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")
    
    # File Storage
    storage_type: str = os.getenv("STORAGE_TYPE", "local")  # local, s3, minio
    storage_bucket: str = os.getenv("STORAGE_BUCKET", "cad-files")
    storage_endpoint: str = os.getenv("STORAGE_ENDPOINT", "")
    storage_access_key: str = os.getenv("STORAGE_ACCESS_KEY", "")
    storage_secret_key: str = os.getenv("STORAGE_SECRET_KEY", "")
    
    # Model Storage
    model_storage_path: str = os.getenv("MODEL_STORAGE_PATH", "./models")
    
    # Training Configuration
    max_training_jobs: int = int(os.getenv("MAX_TRAINING_JOBS", "2"))
    training_timeout: int = int(os.getenv("TRAINING_TIMEOUT", "3600"))  # 1 hour
    
    # CORS
    allowed_origins: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://frontend:3000",
    ]
    
    # JWT
    jwt_secret_key: str = os.getenv("JWT_SECRET_KEY", "your-secret-key-here")
    jwt_algorithm: str = "HS256"
    
    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()