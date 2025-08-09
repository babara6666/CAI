"""
Celery tasks for AI model training operations.
"""

import os
import asyncio
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
import logging

from celery import current_task
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.celery_app import celery_app
from src.core.database import AsyncSessionLocal
from src.core.redis_client import cache_set, cache_get
from src.core.config import get_settings
from src.models.training_job import TrainingJob
from src.models.ai_model import AIModel
from src.models.dataset import Dataset
from src.ml.training.trainer import CADModelTrainer
from src.services.model_service import ModelService
from src.services.dataset_service import DatasetService

logger = logging.getLogger(__name__)
settings = get_settings()


@celery_app.task(bind=True, name="train_cad_model")
def train_cad_model_task(
    self,
    training_job_id: str,
    dataset_id: str,
    model_config: Dict[str, Any],
    training_config: Dict[str, Any],
    user_id: str,
) -> Dict[str, Any]:
    """
    Celery task for training CAD AI models.
    
    Args:
        training_job_id: ID of the training job
        dataset_id: ID of the dataset to use for training
        model_config: Model configuration
        training_config: Training configuration
        user_id: ID of the user who initiated training
        
    Returns:
        Training results
    """
    task_id = self.request.id
    logger.info(f"Starting training task {task_id} for job {training_job_id}")
    
    async def _train_model():
        async with AsyncSessionLocal() as db:
            try:
                # Update training job status
                await _update_training_job_status(
                    db, training_job_id, "running", task_id
                )
                
                # Get dataset information
                dataset_service = DatasetService(db)
                dataset = await dataset_service.get_dataset(dataset_id)
                
                if not dataset:
                    raise ValueError(f"Dataset {dataset_id} not found")
                
                if dataset.status != "ready":
                    raise ValueError(f"Dataset {dataset_id} is not ready for training")
                
                # Prepare dataset configuration
                dataset_config = await _prepare_dataset_config(dataset)
                
                # Create progress callback
                def progress_callback(progress_data: Dict[str, Any]):
                    asyncio.create_task(_update_training_progress(
                        training_job_id, progress_data
                    ))
                
                # Initialize trainer
                trainer = CADModelTrainer(
                    model_config=model_config,
                    training_config=training_config,
                    progress_callback=progress_callback,
                )
                
                # Create model save directory
                model_save_dir = os.path.join(
                    settings.model_storage_path,
                    training_job_id,
                )
                os.makedirs(model_save_dir, exist_ok=True)
                
                # Start training
                training_results = trainer.train(dataset_config, model_save_dir)
                
                # Create AI model record
                model_service = ModelService(db)
                ai_model = await model_service.create_model(
                    name=f"CAD Model - {datetime.utcnow().strftime('%Y%m%d_%H%M%S')}",
                    description=f"Trained on dataset {dataset.name}",
                    version="1.0.0",
                    model_type=model_config.get("model_type", "cnn"),
                    training_job_id=training_job_id,
                    training_dataset_id=dataset_id,
                    model_path=training_results["model_path"],
                    config=model_config,
                    performance_metrics=training_results["detailed_metrics"],
                    created_by=user_id,
                )
                
                # Update training job with completion
                await _update_training_job_completion(
                    db, training_job_id, training_results, ai_model.id
                )
                
                logger.info(f"Training completed successfully for job {training_job_id}")
                
                return {
                    "success": True,
                    "training_job_id": training_job_id,
                    "model_id": str(ai_model.id),
                    "results": training_results,
                }
                
            except Exception as e:
                logger.error(f"Training failed for job {training_job_id}: {e}")
                
                # Update training job with error
                await _update_training_job_status(
                    db, training_job_id, "failed", task_id, str(e)
                )
                
                return {
                    "success": False,
                    "training_job_id": training_job_id,
                    "error": str(e),
                }
    
    # Run the async function
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(_train_model())
    finally:
        loop.close()


async def _update_training_job_status(
    db: AsyncSession,
    training_job_id: str,
    status: str,
    celery_task_id: Optional[str] = None,
    error_message: Optional[str] = None,
):
    """Update training job status in database."""
    from sqlalchemy import select, update
    
    update_data = {
        "status": status,
        "updated_at": datetime.utcnow(),
    }
    
    if celery_task_id:
        update_data["celery_task_id"] = celery_task_id
    
    if status == "running":
        update_data["started_at"] = datetime.utcnow()
        # Estimate completion time (rough estimate)
        update_data["estimated_completion"] = datetime.utcnow() + timedelta(hours=1)
    elif status in ["completed", "failed", "cancelled"]:
        update_data["completed_at"] = datetime.utcnow()
    
    if error_message:
        update_data["error_message"] = error_message
    
    stmt = (
        update(TrainingJob)
        .where(TrainingJob.id == training_job_id)
        .values(**update_data)
    )
    
    await db.execute(stmt)
    await db.commit()


async def _update_training_progress(
    training_job_id: str,
    progress_data: Dict[str, Any],
):
    """Update training progress in database and cache."""
    async with AsyncSessionLocal() as db:
        from sqlalchemy import update
        
        # Update database
        update_data = {
            "current_epoch": progress_data.get("epoch", 0),
            "progress_percentage": progress_data.get("progress", 0),
            "training_loss": progress_data.get("train_loss"),
            "validation_loss": progress_data.get("val_loss"),
            "accuracy": progress_data.get("val_acc"),
            "updated_at": datetime.utcnow(),
        }
        
        # Add detailed metrics if available
        if "detailed_metrics" in progress_data:
            metrics = progress_data["detailed_metrics"]
            update_data.update({
                "precision": metrics.get("precision"),
                "recall": metrics.get("recall"),
                "f1_score": metrics.get("f1_score"),
            })
        
        stmt = (
            update(TrainingJob)
            .where(TrainingJob.id == training_job_id)
            .values(**update_data)
        )
        
        await db.execute(stmt)
        await db.commit()
    
    # Cache progress for real-time updates
    cache_key = f"training_progress:{training_job_id}"
    await cache_set(cache_key, progress_data, expire=300)  # 5 minutes


async def _update_training_job_completion(
    db: AsyncSession,
    training_job_id: str,
    training_results: Dict[str, Any],
    model_id: str,
):
    """Update training job with completion results."""
    from sqlalchemy import update
    
    update_data = {
        "status": "completed",
        "completed_at": datetime.utcnow(),
        "model_path": training_results["model_path"],
        "training_loss": training_results["final_train_loss"],
        "validation_loss": training_results["final_val_loss"],
        "accuracy": training_results["final_val_acc"],
        "precision": training_results["detailed_metrics"].get("precision"),
        "recall": training_results["detailed_metrics"].get("recall"),
        "f1_score": training_results["detailed_metrics"].get("f1_score"),
        "progress_percentage": 100.0,
        "updated_at": datetime.utcnow(),
    }
    
    stmt = (
        update(TrainingJob)
        .where(TrainingJob.id == training_job_id)
        .values(**update_data)
    )
    
    await db.execute(stmt)
    await db.commit()


async def _prepare_dataset_config(dataset: Dataset) -> Dict[str, Any]:
    """Prepare dataset configuration for training."""
    # Split files into train/validation sets
    file_ids = dataset.file_ids
    labels = dataset.labels or {}
    
    # Simple 80/20 split
    split_index = int(len(file_ids) * 0.8)
    train_files = file_ids[:split_index]
    val_files = file_ids[split_index:]
    
    # Filter labels for each split
    train_labels = {fid: labels[fid] for fid in train_files if fid in labels}
    val_labels = {fid: labels[fid] for fid in val_files if fid in labels}
    
    return {
        "train_files": train_files,
        "val_files": val_files,
        "train_labels": train_labels,
        "val_labels": val_labels,
        "augmentation": {
            "enable_rotation": True,
            "enable_flip": True,
            "enable_cad_augmentation": True,
            "rotation_degrees": 15,
            "flip_probability": 0.5,
            "cad_augmentation_probability": 0.3,
        },
    }


@celery_app.task(name="cancel_training_job")
def cancel_training_job_task(training_job_id: str) -> Dict[str, Any]:
    """
    Cancel a running training job.
    
    Args:
        training_job_id: ID of the training job to cancel
        
    Returns:
        Cancellation result
    """
    async def _cancel_job():
        async with AsyncSessionLocal() as db:
            try:
                # Update job status
                await _update_training_job_status(
                    db, training_job_id, "cancelled"
                )
                
                # Clear progress cache
                cache_key = f"training_progress:{training_job_id}"
                await cache_set(cache_key, {"status": "cancelled"}, expire=60)
                
                logger.info(f"Training job {training_job_id} cancelled")
                
                return {
                    "success": True,
                    "training_job_id": training_job_id,
                    "message": "Training job cancelled successfully",
                }
                
            except Exception as e:
                logger.error(f"Failed to cancel training job {training_job_id}: {e}")
                return {
                    "success": False,
                    "training_job_id": training_job_id,
                    "error": str(e),
                }
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(_cancel_job())
    finally:
        loop.close()


@celery_app.task(name="cleanup_training_artifacts")
def cleanup_training_artifacts_task(training_job_id: str) -> Dict[str, Any]:
    """
    Clean up training artifacts for completed or failed jobs.
    
    Args:
        training_job_id: ID of the training job
        
    Returns:
        Cleanup result
    """
    try:
        # Remove temporary training files
        model_save_dir = os.path.join(
            settings.model_storage_path,
            training_job_id,
        )
        
        if os.path.exists(model_save_dir):
            # Keep final model but remove checkpoints
            for filename in os.listdir(model_save_dir):
                if filename.startswith("checkpoint_epoch_"):
                    file_path = os.path.join(model_save_dir, filename)
                    os.remove(file_path)
        
        # Clear progress cache
        cache_key = f"training_progress:{training_job_id}"
        asyncio.run(cache_set(cache_key, None, expire=1))
        
        logger.info(f"Cleaned up artifacts for training job {training_job_id}")
        
        return {
            "success": True,
            "training_job_id": training_job_id,
            "message": "Artifacts cleaned up successfully",
        }
        
    except Exception as e:
        logger.error(f"Failed to cleanup artifacts for job {training_job_id}: {e}")
        return {
            "success": False,
            "training_job_id": training_job_id,
            "error": str(e),
        }