"""
Service for managing datasets for AI training.
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from uuid import uuid4

from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.dataset import Dataset


class DatasetService:
    """Service for dataset management."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def create_dataset(
        self,
        name: str,
        description: Optional[str],
        file_ids: List[str],
        labels: Dict[str, int],
        tags: Optional[List[str]],
        created_by: str,
    ) -> Dataset:
        """
        Create a new dataset.
        
        Args:
            name: Dataset name
            description: Dataset description
            file_ids: List of file IDs in the dataset
            labels: Dictionary mapping file_id to label
            tags: Optional list of tags
            created_by: ID of the user creating the dataset
            
        Returns:
            Created dataset
        """
        # Calculate label distribution
        label_distribution = {}
        for file_id in file_ids:
            if file_id in labels:
                label = labels[file_id]
                label_distribution[str(label)] = label_distribution.get(str(label), 0) + 1
        
        dataset = Dataset(
            id=uuid4(),
            name=name,
            description=description,
            file_count=len(file_ids),
            file_ids=file_ids,
            labels=labels,
            tags=tags or [],
            label_distribution=label_distribution,
            status="ready",
            created_by=created_by,
        )
        
        self.db.add(dataset)
        await self.db.commit()
        await self.db.refresh(dataset)
        
        return dataset
    
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
    
    async def list_datasets(
        self,
        user_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Dataset]:
        """
        List datasets with optional filtering.
        
        Args:
            user_id: Optional user ID filter
            status: Optional status filter
            limit: Maximum number of datasets to return
            offset: Number of datasets to skip
            
        Returns:
            List of datasets
        """
        stmt = select(Dataset)
        
        if user_id:
            stmt = stmt.where(Dataset.created_by == user_id)
        
        if status:
            stmt = stmt.where(Dataset.status == status)
        
        stmt = stmt.order_by(Dataset.created_at.desc())
        stmt = stmt.limit(limit).offset(offset)
        
        result = await self.db.execute(stmt)
        return result.scalars().all()
    
    async def update_dataset(
        self,
        dataset_id: str,
        update_data: Dict[str, Any],
    ) -> Optional[Dataset]:
        """
        Update dataset.
        
        Args:
            dataset_id: Dataset ID
            update_data: Data to update
            
        Returns:
            Updated dataset or None if not found
        """
        update_data["updated_at"] = datetime.utcnow()
        
        stmt = (
            update(Dataset)
            .where(Dataset.id == dataset_id)
            .values(**update_data)
            .returning(Dataset)
        )
        
        result = await self.db.execute(stmt)
        await self.db.commit()
        
        return result.scalar_one_or_none()
    
    async def delete_dataset(self, dataset_id: str) -> bool:
        """
        Delete dataset.
        
        Args:
            dataset_id: Dataset ID
            
        Returns:
            True if deleted, False if not found
        """
        stmt = delete(Dataset).where(Dataset.id == dataset_id)
        result = await self.db.execute(stmt)
        await self.db.commit()
        
        return result.rowcount > 0
    
    async def add_files_to_dataset(
        self,
        dataset_id: str,
        file_ids: List[str],
        labels: Dict[str, int],
    ) -> Optional[Dataset]:
        """
        Add files to an existing dataset.
        
        Args:
            dataset_id: Dataset ID
            file_ids: List of file IDs to add
            labels: Dictionary mapping file_id to label
            
        Returns:
            Updated dataset or None if not found
        """
        dataset = await self.get_dataset(dataset_id)
        if not dataset:
            return None
        
        # Merge file IDs and labels
        updated_file_ids = list(set(dataset.file_ids + file_ids))
        updated_labels = {**(dataset.labels or {}), **labels}
        
        # Recalculate label distribution
        label_distribution = {}
        for file_id in updated_file_ids:
            if file_id in updated_labels:
                label = updated_labels[file_id]
                label_distribution[str(label)] = label_distribution.get(str(label), 0) + 1
        
        # Update dataset
        return await self.update_dataset(dataset_id, {
            "file_ids": updated_file_ids,
            "file_count": len(updated_file_ids),
            "labels": updated_labels,
            "label_distribution": label_distribution,
        })
    
    async def remove_files_from_dataset(
        self,
        dataset_id: str,
        file_ids: List[str],
    ) -> Optional[Dataset]:
        """
        Remove files from an existing dataset.
        
        Args:
            dataset_id: Dataset ID
            file_ids: List of file IDs to remove
            
        Returns:
            Updated dataset or None if not found
        """
        dataset = await self.get_dataset(dataset_id)
        if not dataset:
            return None
        
        # Remove file IDs
        updated_file_ids = [fid for fid in dataset.file_ids if fid not in file_ids]
        
        # Remove labels for removed files
        updated_labels = {
            fid: label for fid, label in (dataset.labels or {}).items()
            if fid not in file_ids
        }
        
        # Recalculate label distribution
        label_distribution = {}
        for file_id in updated_file_ids:
            if file_id in updated_labels:
                label = updated_labels[file_id]
                label_distribution[str(label)] = label_distribution.get(str(label), 0) + 1
        
        # Update dataset
        return await self.update_dataset(dataset_id, {
            "file_ids": updated_file_ids,
            "file_count": len(updated_file_ids),
            "labels": updated_labels,
            "label_distribution": label_distribution,
        })