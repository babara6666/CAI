"""
API routes for AI model management.
"""

from datetime import datetime
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.services.model_service import ModelService

router = APIRouter()


class AIModelResponse(BaseModel):
    """Response model for AI model information."""
    id: str
    name: str
    description: Optional[str]
    version: str
    model_type: str
    training_job_id: str
    training_dataset_id: str
    model_path: str
    config: Dict[str, Any]
    architecture: Optional[Dict[str, Any]]
    performance: Dict[str, Any]
    status: str
    is_default: bool
    created_by: str
    created_at: datetime
    updated_at: datetime


class ModelUpdateRequest(BaseModel):
    """Request model for updating AI model."""
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


@router.get("/", response_model=List[AIModelResponse])
async def list_models(
    model_type: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """
    List AI models with optional filtering.
    
    Args:
        model_type: Optional model type filter
        status: Optional status filter
        limit: Maximum number of models to return
        offset: Number of models to skip
        db: Database session
        
    Returns:
        List of AI models
    """
    try:
        model_service = ModelService(db)
        
        models = await model_service.list_models(
            model_type=model_type,
            status=status,
            limit=limit,
            offset=offset,
        )
        
        return [AIModelResponse(**model.to_dict()) for model in models]
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{model_id}", response_model=AIModelResponse)
async def get_model(
    model_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Get AI model by ID.
    
    Args:
        model_id: Model ID
        db: Database session
        
    Returns:
        AI model information
    """
    try:
        model_service = ModelService(db)
        
        model = await model_service.get_model(model_id)
        if not model:
            raise HTTPException(status_code=404, detail="Model not found")
        
        return AIModelResponse(**model.to_dict())
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{model_id}", response_model=AIModelResponse)
async def update_model(
    model_id: str,
    update_data: ModelUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = "test-user-id",  # TODO: Get from auth
):
    """
    Update AI model.
    
    Args:
        model_id: Model ID
        update_data: Update data
        db: Database session
        current_user_id: ID of the current user
        
    Returns:
        Updated AI model
    """
    try:
        model_service = ModelService(db)
        
        # Check if model exists
        existing_model = await model_service.get_model(model_id)
        if not existing_model:
            raise HTTPException(status_code=404, detail="Model not found")
        
        # Check ownership (for non-admin users)
        if str(existing_model.created_by) != current_user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Prepare update data
        update_dict = {}
        if update_data.name is not None:
            update_dict["name"] = update_data.name
        if update_data.description is not None:
            update_dict["description"] = update_data.description
        if update_data.status is not None:
            update_dict["status"] = update_data.status
        
        # Update model
        updated_model = await model_service.update_model(model_id, update_dict)
        if not updated_model:
            raise HTTPException(status_code=404, detail="Model not found")
        
        return AIModelResponse(**updated_model.to_dict())
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{model_id}")
async def delete_model(
    model_id: str,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = "test-user-id",  # TODO: Get from auth
):
    """
    Delete AI model.
    
    Args:
        model_id: Model ID
        db: Database session
        current_user_id: ID of the current user
        
    Returns:
        Deletion confirmation
    """
    try:
        model_service = ModelService(db)
        
        # Check if model exists
        existing_model = await model_service.get_model(model_id)
        if not existing_model:
            raise HTTPException(status_code=404, detail="Model not found")
        
        # Check ownership (for non-admin users)
        if str(existing_model.created_by) != current_user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Cannot delete default models
        if existing_model.is_default:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete default model. Set another model as default first."
            )
        
        # Delete model
        deleted = await model_service.delete_model(model_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Model not found")
        
        return {
            "success": True,
            "message": "Model deleted successfully",
            "model_id": model_id,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{model_id}/set-default")
async def set_default_model(
    model_id: str,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = "test-user-id",  # TODO: Get from auth
):
    """
    Set model as default for its type.
    
    Args:
        model_id: Model ID
        db: Database session
        current_user_id: ID of the current user
        
    Returns:
        Success confirmation
    """
    try:
        model_service = ModelService(db)
        
        # Check if model exists
        model = await model_service.get_model(model_id)
        if not model:
            raise HTTPException(status_code=404, detail="Model not found")
        
        # Check if model is ready
        if model.status != "ready":
            raise HTTPException(
                status_code=400,
                detail=f"Cannot set model with status '{model.status}' as default"
            )
        
        # Set as default
        success = await model_service.set_default_model(model_id, model.model_type)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to set default model")
        
        return {
            "success": True,
            "message": f"Model set as default for type '{model.model_type}'",
            "model_id": model_id,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/default/{model_type}", response_model=AIModelResponse)
async def get_default_model(
    model_type: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Get default model for a given type.
    
    Args:
        model_type: Model type
        db: Database session
        
    Returns:
        Default AI model
    """
    try:
        model_service = ModelService(db)
        
        model = await model_service.get_default_model(model_type)
        if not model:
            raise HTTPException(
                status_code=404,
                detail=f"No default model found for type '{model_type}'"
            )
        
        return AIModelResponse(**model.to_dict())
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))