"""
API routes for dataset management.
"""

from datetime import datetime
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.services.dataset_service import DatasetService

router = APIRouter()


class DatasetCreate(BaseModel):
    """Request model for creating a dataset."""
    name: str = Field(..., description="Name of the dataset")
    description: Optional[str] = Field(None, description="Description of the dataset")
    file_ids: List[str] = Field(..., description="List of file IDs")
    labels: Dict[str, int] = Field(..., description="Dictionary mapping file_id to label")
    tags: Optional[List[str]] = Field(None, description="Optional list of tags")


class DatasetResponse(BaseModel):
    """Response model for dataset information."""
    id: str
    name: str
    description: Optional[str]
    file_count: int
    total_size: int
    file_ids: List[str]
    labels: Optional[Dict[str, int]]
    categories: Optional[List[str]]
    tags: Optional[List[str]]
    status: str
    label_distribution: Optional[Dict[str, int]]
    preprocessing_config: Optional[Dict[str, Any]]
    created_by: str
    created_at: datetime
    updated_at: datetime


class DatasetUpdateRequest(BaseModel):
    """Request model for updating dataset."""
    name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[str] = None


class AddFilesRequest(BaseModel):
    """Request model for adding files to dataset."""
    file_ids: List[str] = Field(..., description="List of file IDs to add")
    labels: Dict[str, int] = Field(..., description="Dictionary mapping file_id to label")


class RemoveFilesRequest(BaseModel):
    """Request model for removing files from dataset."""
    file_ids: List[str] = Field(..., description="List of file IDs to remove")


@router.post("/", response_model=DatasetResponse)
async def create_dataset(
    dataset_data: DatasetCreate,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = "test-user-id",  # TODO: Get from auth
):
    """
    Create a new dataset.
    
    Args:
        dataset_data: Dataset creation data
        db: Database session
        current_user_id: ID of the current user
        
    Returns:
        Created dataset information
    """
    try:
        dataset_service = DatasetService(db)
        
        # Validate that all files have labels
        missing_labels = [fid for fid in dataset_data.file_ids if fid not in dataset_data.labels]
        if missing_labels:
            raise HTTPException(
                status_code=400,
                detail=f"Missing labels for files: {missing_labels}"
            )
        
        # Create dataset
        dataset = await dataset_service.create_dataset(
            name=dataset_data.name,
            description=dataset_data.description,
            file_ids=dataset_data.file_ids,
            labels=dataset_data.labels,
            tags=dataset_data.tags,
            created_by=current_user_id,
        )
        
        return DatasetResponse(**dataset.to_dict())
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[DatasetResponse])
async def list_datasets(
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = "test-user-id",  # TODO: Get from auth
):
    """
    List datasets with optional filtering.
    
    Args:
        status: Optional status filter
        limit: Maximum number of datasets to return
        offset: Number of datasets to skip
        db: Database session
        current_user_id: ID of the current user
        
    Returns:
        List of datasets
    """
    try:
        dataset_service = DatasetService(db)
        
        datasets = await dataset_service.list_datasets(
            user_id=current_user_id,
            status=status,
            limit=limit,
            offset=offset,
        )
        
        return [DatasetResponse(**dataset.to_dict()) for dataset in datasets]
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = "test-user-id",  # TODO: Get from auth
):
    """
    Get dataset by ID.
    
    Args:
        dataset_id: Dataset ID
        db: Database session
        current_user_id: ID of the current user
        
    Returns:
        Dataset information
    """
    try:
        dataset_service = DatasetService(db)
        
        dataset = await dataset_service.get_dataset(dataset_id)
        if not dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")
        
        # Check ownership (for non-admin users)
        if str(dataset.created_by) != current_user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        return DatasetResponse(**dataset.to_dict())
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{dataset_id}", response_model=DatasetResponse)
async def update_dataset(
    dataset_id: str,
    update_data: DatasetUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = "test-user-id",  # TODO: Get from auth
):
    """
    Update dataset.
    
    Args:
        dataset_id: Dataset ID
        update_data: Update data
        db: Database session
        current_user_id: ID of the current user
        
    Returns:
        Updated dataset
    """
    try:
        dataset_service = DatasetService(db)
        
        # Check if dataset exists
        existing_dataset = await dataset_service.get_dataset(dataset_id)
        if not existing_dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")
        
        # Check ownership
        if str(existing_dataset.created_by) != current_user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Prepare update data
        update_dict = {}
        if update_data.name is not None:
            update_dict["name"] = update_data.name
        if update_data.description is not None:
            update_dict["description"] = update_data.description
        if update_data.tags is not None:
            update_dict["tags"] = update_data.tags
        if update_data.status is not None:
            update_dict["status"] = update_data.status
        
        # Update dataset
        updated_dataset = await dataset_service.update_dataset(dataset_id, update_dict)
        if not updated_dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")
        
        return DatasetResponse(**updated_dataset.to_dict())
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{dataset_id}")
async def delete_dataset(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = "test-user-id",  # TODO: Get from auth
):
    """
    Delete dataset.
    
    Args:
        dataset_id: Dataset ID
        db: Database session
        current_user_id: ID of the current user
        
    Returns:
        Deletion confirmation
    """
    try:
        dataset_service = DatasetService(db)
        
        # Check if dataset exists
        existing_dataset = await dataset_service.get_dataset(dataset_id)
        if not existing_dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")
        
        # Check ownership
        if str(existing_dataset.created_by) != current_user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Delete dataset
        deleted = await dataset_service.delete_dataset(dataset_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Dataset not found")
        
        return {
            "success": True,
            "message": "Dataset deleted successfully",
            "dataset_id": dataset_id,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{dataset_id}/files", response_model=DatasetResponse)
async def add_files_to_dataset(
    dataset_id: str,
    files_data: AddFilesRequest,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = "test-user-id",  # TODO: Get from auth
):
    """
    Add files to an existing dataset.
    
    Args:
        dataset_id: Dataset ID
        files_data: Files to add with labels
        db: Database session
        current_user_id: ID of the current user
        
    Returns:
        Updated dataset
    """
    try:
        dataset_service = DatasetService(db)
        
        # Check if dataset exists
        existing_dataset = await dataset_service.get_dataset(dataset_id)
        if not existing_dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")
        
        # Check ownership
        if str(existing_dataset.created_by) != current_user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Validate that all files have labels
        missing_labels = [fid for fid in files_data.file_ids if fid not in files_data.labels]
        if missing_labels:
            raise HTTPException(
                status_code=400,
                detail=f"Missing labels for files: {missing_labels}"
            )
        
        # Add files to dataset
        updated_dataset = await dataset_service.add_files_to_dataset(
            dataset_id=dataset_id,
            file_ids=files_data.file_ids,
            labels=files_data.labels,
        )
        
        if not updated_dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")
        
        return DatasetResponse(**updated_dataset.to_dict())
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{dataset_id}/files", response_model=DatasetResponse)
async def remove_files_from_dataset(
    dataset_id: str,
    files_data: RemoveFilesRequest,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = "test-user-id",  # TODO: Get from auth
):
    """
    Remove files from an existing dataset.
    
    Args:
        dataset_id: Dataset ID
        files_data: Files to remove
        db: Database session
        current_user_id: ID of the current user
        
    Returns:
        Updated dataset
    """
    try:
        dataset_service = DatasetService(db)
        
        # Check if dataset exists
        existing_dataset = await dataset_service.get_dataset(dataset_id)
        if not existing_dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")
        
        # Check ownership
        if str(existing_dataset.created_by) != current_user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Remove files from dataset
        updated_dataset = await dataset_service.remove_files_from_dataset(
            dataset_id=dataset_id,
            file_ids=files_data.file_ids,
        )
        
        if not updated_dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")
        
        return DatasetResponse(**updated_dataset.to_dict())
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))