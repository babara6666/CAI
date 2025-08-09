"""
Service for managing AI models.
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from uuid import uuid4

from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.ai_model import AIModel


class ModelService:
    """Service for AI model management."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def create_model(
        self,
        name: str,
        description: Optional[str],
        version: str,
        model_type: str,
        training_job_id: str,
        training_dataset_id: str,
        model_path: str,
        config: Dict[str, Any],
        performance_metrics: Dict[str, Any],
        created_by: str,
    ) -> AIModel:
        """
        Create a new AI model record.
        
        Args:
            name: Model name
            description: Model description
            version: Model version
            model_type: Type of model
            training_job_id: ID of the training job
            training_dataset_id: ID of the training dataset
            model_path: Path to the model file
            config: Model configuration
            performance_metrics: Performance metrics
            created_by: ID of the user creating the model
            
        Returns:
            Created AI model
        """
        ai_model = AIModel(
            id=uuid4(),
            name=name,
            description=description,
            version=version,
            model_type=model_type,
            training_job_id=training_job_id,
            training_dataset_id=training_dataset_id,
            model_path=model_path,
            config=config,
            accuracy=performance_metrics.get("accuracy"),
            precision=performance_metrics.get("precision"),
            recall=performance_metrics.get("recall"),
            f1_score=performance_metrics.get("f1_score"),
            created_by=created_by,
        )
        
        self.db.add(ai_model)
        await self.db.commit()
        await self.db.refresh(ai_model)
        
        return ai_model
    
    async def get_model(self, model_id: str) -> Optional[AIModel]:
        """
        Get AI model by ID.
        
        Args:
            model_id: Model ID
            
        Returns:
            AI model or None if not found
        """
        stmt = select(AIModel).where(AIModel.id == model_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def list_models(
        self,
        model_type: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[AIModel]:
        """
        List AI models with optional filtering.
        
        Args:
            model_type: Optional model type filter
            status: Optional status filter
            limit: Maximum number of models to return
            offset: Number of models to skip
            
        Returns:
            List of AI models
        """
        stmt = select(AIModel)
        
        if model_type:
            stmt = stmt.where(AIModel.model_type == model_type)
        
        if status:
            stmt = stmt.where(AIModel.status == status)
        
        stmt = stmt.order_by(AIModel.created_at.desc())
        stmt = stmt.limit(limit).offset(offset)
        
        result = await self.db.execute(stmt)
        return result.scalars().all()
    
    async def update_model(
        self,
        model_id: str,
        update_data: Dict[str, Any],
    ) -> Optional[AIModel]:
        """
        Update AI model.
        
        Args:
            model_id: Model ID
            update_data: Data to update
            
        Returns:
            Updated AI model or None if not found
        """
        update_data["updated_at"] = datetime.utcnow()
        
        stmt = (
            update(AIModel)
            .where(AIModel.id == model_id)
            .values(**update_data)
            .returning(AIModel)
        )
        
        result = await self.db.execute(stmt)
        await self.db.commit()
        
        return result.scalar_one_or_none()
    
    async def delete_model(self, model_id: str) -> bool:
        """
        Delete AI model.
        
        Args:
            model_id: Model ID
            
        Returns:
            True if deleted, False if not found
        """
        stmt = delete(AIModel).where(AIModel.id == model_id)
        result = await self.db.execute(stmt)
        await self.db.commit()
        
        return result.rowcount > 0
    
    async def get_default_model(self, model_type: Optional[str] = None) -> Optional[AIModel]:
        """
        Get the default model for a given type.
        
        Args:
            model_type: Optional model type filter
            
        Returns:
            Default AI model or None if not found
        """
        stmt = select(AIModel).where(
            AIModel.is_default == True,
            AIModel.status == "ready",
        )
        
        if model_type:
            stmt = stmt.where(AIModel.model_type == model_type)
        
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def set_default_model(self, model_id: str, model_type: str) -> bool:
        """
        Set a model as the default for its type.
        
        Args:
            model_id: Model ID to set as default
            model_type: Model type
            
        Returns:
            True if successful, False otherwise
        """
        # First, unset all defaults for this model type
        unset_stmt = (
            update(AIModel)
            .where(
                AIModel.model_type == model_type,
                AIModel.is_default == True,
            )
            .values(is_default=False, updated_at=datetime.utcnow())
        )
        
        await self.db.execute(unset_stmt)
        
        # Set the new default
        set_stmt = (
            update(AIModel)
            .where(AIModel.id == model_id)
            .values(is_default=True, updated_at=datetime.utcnow())
        )
        
        result = await self.db.execute(set_stmt)
        await self.db.commit()
        
        return result.rowcount > 0