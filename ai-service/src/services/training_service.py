"""
Service for managing AI model training operations.
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from uuid import uuid4

from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.training_job import TrainingJob
from src.models.dataset import Dataset


class TrainingService:
    """Service for training job management."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def create_training_job(
        self,
        name: str,
        dataset_id: str,
        model_type: str,
        config: Dict[str, Any],
        training_config: Dict[str, Any],
        created_by: str,
    ) -> TrainingJob:
        """
        Create a new training job.
        
        Args:
            name: Name of the training job
            dataset_id: ID of the dataset to use
            model_type: Type of model to train
            config: Model configuration
            training_config: Training configuration
            created_by: ID of the user creating the job
            
        Returns:
            Created training job
        """
        training_job = TrainingJob(
            id=uuid4(),
            name=name,
            dataset_id=dataset_id,
            model_type=model_type,
            status="queued",
            config=config,
            hyperparameters=training_config,
            total_epochs=training_config.get("epochs", 50),
            created_by=created_by,
        )
        
        self.db.add(training_job)
        await self.db.commit()
        await self.db.refresh(training_job)
        
        return training_job
    
    async def get_training_job(self, job_id: str) -> Optional[TrainingJob]:
        """
        Get training job by ID.
        
        Args:
            job_id: Training job ID
            
        Returns:
            Training job or None if not found
        """
        stmt = select(TrainingJob).where(TrainingJob.id == job_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def list_training_jobs(
        self,
        user_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[TrainingJob]:
        """
        List training jobs with optional filtering.
        
        Args:
            user_id: Optional user ID filter
            status: Optional status filter
            limit: Maximum number of jobs to return
            offset: Number of jobs to skip
            
        Returns:
            List of training jobs
        """
        stmt = select(TrainingJob)
        
        if user_id:
            stmt = stmt.where(TrainingJob.created_by == user_id)
        
        if status:
            stmt = stmt.where(TrainingJob.status == status)
        
        stmt = stmt.order_by(TrainingJob.created_at.desc())
        stmt = stmt.limit(limit).offset(offset)
        
        result = await self.db.execute(stmt)
        return result.scalars().all()
    
    async def update_training_job(
        self,
        job_id: str,
        update_data: Dict[str, Any],
    ) -> Optional[TrainingJob]:
        """
        Update training job.
        
        Args:
            job_id: Training job ID
            update_data: Data to update
            
        Returns:
            Updated training job or None if not found
        """
        update_data["updated_at"] = datetime.utcnow()
        
        stmt = (
            update(TrainingJob)
            .where(TrainingJob.id == job_id)
            .values(**update_data)
            .returning(TrainingJob)
        )
        
        result = await self.db.execute(stmt)
        await self.db.commit()
        
        return result.scalar_one_or_none()
    
    async def delete_training_job(self, job_id: str) -> bool:
        """
        Delete training job.
        
        Args:
            job_id: Training job ID
            
        Returns:
            True if deleted, False if not found
        """
        stmt = delete(TrainingJob).where(TrainingJob.id == job_id)
        result = await self.db.execute(stmt)
        await self.db.commit()
        
        return result.rowcount > 0
    
    async def get_dataset(self, dataset_id: str) -> Optional[Dataset]:
        """
        Get dataset by ID.
        
        Args:
            dataset_id: Dataset ID
            
        Returns:
            Dataset or None if not found
        """
        stmt = select(Dataset).where(Dataset.id == dataset_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def get_active_training_jobs_count(self, user_id: Optional[str] = None) -> int:
        """
        Get count of active training jobs.
        
        Args:
            user_id: Optional user ID filter
            
        Returns:
            Count of active jobs
        """
        from sqlalchemy import func
        
        stmt = select(func.count(TrainingJob.id)).where(
            TrainingJob.status.in_(["queued", "running"])
        )
        
        if user_id:
            stmt = stmt.where(TrainingJob.created_by == user_id)
        
        result = await self.db.execute(stmt)
        return result.scalar() or 0
    
    async def get_training_statistics(
        self,
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get training statistics.
        
        Args:
            user_id: Optional user ID filter
            
        Returns:
            Training statistics
        """
        from sqlalchemy import func
        
        # Base query
        base_stmt = select(TrainingJob)
        if user_id:
            base_stmt = base_stmt.where(TrainingJob.created_by == user_id)
        
        # Total jobs
        total_stmt = select(func.count(TrainingJob.id))
        if user_id:
            total_stmt = total_stmt.where(TrainingJob.created_by == user_id)
        
        total_result = await self.db.execute(total_stmt)
        total_jobs = total_result.scalar() or 0
        
        # Jobs by status
        status_stmt = select(
            TrainingJob.status,
            func.count(TrainingJob.id)
        ).group_by(TrainingJob.status)
        
        if user_id:
            status_stmt = status_stmt.where(TrainingJob.created_by == user_id)
        
        status_result = await self.db.execute(status_stmt)
        status_counts = dict(status_result.fetchall())
        
        # Average training time for completed jobs
        avg_time_stmt = select(
            func.avg(
                func.extract('epoch', TrainingJob.completed_at - TrainingJob.started_at)
            )
        ).where(
            TrainingJob.status == "completed",
            TrainingJob.started_at.isnot(None),
            TrainingJob.completed_at.isnot(None),
        )
        
        if user_id:
            avg_time_stmt = avg_time_stmt.where(TrainingJob.created_by == user_id)
        
        avg_time_result = await self.db.execute(avg_time_stmt)
        avg_training_time = avg_time_result.scalar()
        
        return {
            "total_jobs": total_jobs,
            "status_counts": status_counts,
            "average_training_time": avg_training_time,
            "active_jobs": status_counts.get("running", 0) + status_counts.get("queued", 0),
        }