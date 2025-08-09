"""
API routes for AI model training operations.
"""

from datetime import datetime
from typing import Dict, Any, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.redis_client import cache_get
from src.services.training_service import TrainingService
from src.tasks.training_tasks import train_cad_model_task, cancel_training_job_task

router = APIRouter()


class TrainingJobCreate(BaseModel):
    """Request model for creating a training job."""
    name: str = Field(..., description="Name of the training job")
    dataset_id: str = Field(..., description="ID of the dataset to use")
    model_type: str = Field(default="cnn", description="Type of model to train")
    config: Dict[str, Any] = Field(default_factory=dict, description="Model configuration")
    training_config: Dict[str, Any] = Field(default_factory=dict, description="Training configuration")


class TrainingJobResponse(BaseModel):
    """Response model for training job information."""
    id: str
    name: str
    dataset_id: str
    model_type: str
    status: str
    config: Dict[str, Any]
    hyperparameters: Optional[Dict[str, Any]]
    current_epoch: int
    total_epochs: int
    progress_percentage: float
    training_loss: Optional[float]
    validation_loss: Optional[float]
    accuracy: Optional[float]
    precision: Optional[float]
    recall: Optional[float]
    f1_score: Optional[float]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    estimated_completion: Optional[datetime]
    model_path: Optional[str]
    error_message: Optional[str]
    created_by: str
    created_at: datetime
    updated_at: datetime


class TrainingProgressResponse(BaseModel):
    """Response model for training progress."""
    training_job_id: str
    status: str
    current_epoch: int
    total_epochs: int
    progress_percentage: float
    training_loss: Optional[float]
    validation_loss: Optional[float]
    accuracy: Optional[float]
    learning_rate: Optional[float]
    estimated_completion: Optional[datetime]
    detailed_metrics: Optional[Dict[str, Any]]


@router.post("/jobs", response_model=TrainingJobResponse)
async def create_training_job(
    job_data: TrainingJobCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = "test-user-id",  # TODO: Get from auth
):
    """
    Create a new training job and start training.
    
    Args:
        job_data: Training job configuration
        background_tasks: FastAPI background tasks
        db: Database session
        current_user_id: ID of the current user
        
    Returns:
        Created training job information
    """
    try:
        training_service = TrainingService(db)
        
        # Validate dataset exists and is ready
        dataset = await training_service.get_dataset(job_data.dataset_id)
        if not dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")
        
        if dataset.status != "ready":
            raise HTTPException(
                status_code=400,
                detail=f"Dataset is not ready for training (status: {dataset.status})"
            )
        
        # Set default configurations
        model_config = {
            "model_type": job_data.model_type,
            "input_channels": 3,
            "num_classes": len(set(dataset.labels.values())) if dataset.labels else 10,
            "feature_dim": 512,
            "dropout_rate": 0.5,
            "input_size": 224,
            **job_data.config,
        }
        
        training_config = {
            "epochs": 50,
            "batch_size": 32,
            "learning_rate": 0.001,
            "weight_decay": 1e-4,
            "patience": 10,
            **job_data.training_config,
        }
        
        # Create training job record
        training_job = await training_service.create_training_job(
            name=job_data.name,
            dataset_id=job_data.dataset_id,
            model_type=job_data.model_type,
            config=model_config,
            training_config=training_config,
            created_by=current_user_id,
        )
        
        # Start training task
        task = train_cad_model_task.delay(
            training_job_id=str(training_job.id),
            dataset_id=job_data.dataset_id,
            model_config=model_config,
            training_config=training_config,
            user_id=current_user_id,
        )
        
        # Update job with Celery task ID
        await training_service.update_training_job(
            str(training_job.id),
            {"celery_task_id": task.id}
        )
        
        return TrainingJobResponse(**training_job.to_dict())
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs", response_model=List[TrainingJobResponse])
async def list_training_jobs(
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = "test-user-id",  # TODO: Get from auth
):
    """
    List training jobs with optional filtering.
    
    Args:
        status: Optional status filter
        limit: Maximum number of jobs to return
        offset: Number of jobs to skip
        db: Database session
        current_user_id: ID of the current user
        
    Returns:
        List of training jobs
    """
    try:
        training_service = TrainingService(db)
        
        jobs = await training_service.list_training_jobs(
            user_id=current_user_id,
            status=status,
            limit=limit,
            offset=offset,
        )
        
        return [TrainingJobResponse(**job.to_dict()) for job in jobs]
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs/{job_id}", response_model=TrainingJobResponse)
async def get_training_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = "test-user-id",  # TODO: Get from auth
):
    """
    Get training job by ID.
    
    Args:
        job_id: Training job ID
        db: Database session
        current_user_id: ID of the current user
        
    Returns:
        Training job information
    """
    try:
        training_service = TrainingService(db)
        
        job = await training_service.get_training_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Training job not found")
        
        # Check ownership (for non-admin users)
        if str(job.created_by) != current_user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        return TrainingJobResponse(**job.to_dict())
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs/{job_id}/progress", response_model=TrainingProgressResponse)
async def get_training_progress(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = "test-user-id",  # TODO: Get from auth
):
    """
    Get real-time training progress.
    
    Args:
        job_id: Training job ID
        db: Database session
        current_user_id: ID of the current user
        
    Returns:
        Training progress information
    """
    try:
        training_service = TrainingService(db)
        
        # Get job from database
        job = await training_service.get_training_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Training job not found")
        
        # Check ownership
        if str(job.created_by) != current_user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Get cached progress data
        cache_key = f"training_progress:{job_id}"
        cached_progress = await cache_get(cache_key)
        
        # Combine database and cached data
        progress_data = {
            "training_job_id": job_id,
            "status": job.status,
            "current_epoch": job.current_epoch,
            "total_epochs": job.total_epochs,
            "progress_percentage": job.progress_percentage,
            "training_loss": job.training_loss,
            "validation_loss": job.validation_loss,
            "accuracy": job.accuracy,
            "learning_rate": None,
            "estimated_completion": job.estimated_completion,
            "detailed_metrics": None,
        }
        
        # Update with cached data if available
        if cached_progress:
            progress_data.update({
                "learning_rate": cached_progress.get("learning_rate"),
                "detailed_metrics": cached_progress.get("detailed_metrics"),
            })
        
        return TrainingProgressResponse(**progress_data)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/jobs/{job_id}/cancel")
async def cancel_training_job(
    job_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = "test-user-id",  # TODO: Get from auth
):
    """
    Cancel a running training job.
    
    Args:
        job_id: Training job ID
        background_tasks: FastAPI background tasks
        db: Database session
        current_user_id: ID of the current user
        
    Returns:
        Cancellation confirmation
    """
    try:
        training_service = TrainingService(db)
        
        # Get job
        job = await training_service.get_training_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Training job not found")
        
        # Check ownership
        if str(job.created_by) != current_user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Check if job can be cancelled
        if job.status not in ["queued", "running"]:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot cancel job with status: {job.status}"
            )
        
        # Cancel the Celery task if it exists
        if job.celery_task_id:
            from src.core.celery_app import celery_app
            celery_app.control.revoke(job.celery_task_id, terminate=True)
        
        # Start cancellation task
        background_tasks.add_task(cancel_training_job_task, job_id)
        
        return {
            "success": True,
            "message": "Training job cancellation initiated",
            "job_id": job_id,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/jobs/{job_id}")
async def delete_training_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = "test-user-id",  # TODO: Get from auth
):
    """
    Delete a training job and its artifacts.
    
    Args:
        job_id: Training job ID
        db: Database session
        current_user_id: ID of the current user
        
    Returns:
        Deletion confirmation
    """
    try:
        training_service = TrainingService(db)
        
        # Get job
        job = await training_service.get_training_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Training job not found")
        
        # Check ownership
        if str(job.created_by) != current_user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Cannot delete running jobs
        if job.status == "running":
            raise HTTPException(
                status_code=400,
                detail="Cannot delete running training job. Cancel it first."
            )
        
        # Delete the job
        await training_service.delete_training_job(job_id)
        
        return {
            "success": True,
            "message": "Training job deleted successfully",
            "job_id": job_id,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))