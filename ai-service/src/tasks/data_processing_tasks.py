"""
Celery tasks for data processing operations.
"""

import asyncio
import os
import shutil
from typing import Dict, Any, List, Optional
import logging
from PIL import Image
import numpy as np

from src.core.celery_app import celery_app
from src.core.database import AsyncSessionLocal
from src.services.dataset_service import DatasetService
from src.ml.data.transforms import get_validation_transforms

logger = logging.getLogger(__name__)


@celery_app.task(name="validate_dataset")
def validate_dataset_task(dataset_id: str) -> Dict[str, Any]:
    """
    Validate a dataset for training readiness.
    
    Args:
        dataset_id: ID of the dataset to validate
        
    Returns:
        Validation results
    """
    async def _validate_dataset():
        async with AsyncSessionLocal() as db:
            try:
                # Get dataset
                dataset_service = DatasetService(db)
                dataset = await dataset_service.get_dataset(dataset_id)
                
                if not dataset:
                    raise ValueError(f"Dataset {dataset_id} not found")
                
                validation_results = {
                    "dataset_id": dataset_id,
                    "total_files": len(dataset.file_ids),
                    "labeled_files": len(dataset.labels) if dataset.labels else 0,
                    "unlabeled_files": [],
                    "invalid_files": [],
                    "class_distribution": dataset.label_distribution or {},
                    "issues": [],
                    "is_valid": True,
                }
                
                # Check for unlabeled files
                if dataset.labels:
                    unlabeled = [fid for fid in dataset.file_ids if fid not in dataset.labels]
                    validation_results["unlabeled_files"] = unlabeled
                    
                    if unlabeled:
                        validation_results["issues"].append(
                            f"Found {len(unlabeled)} unlabeled files"
                        )
                        validation_results["is_valid"] = False
                
                # Check minimum files per class
                if dataset.label_distribution:
                    min_files_per_class = 2
                    small_classes = [
                        label for label, count in dataset.label_distribution.items()
                        if count < min_files_per_class
                    ]
                    
                    if small_classes:
                        validation_results["issues"].append(
                            f"Classes with insufficient samples: {small_classes}"
                        )
                        validation_results["is_valid"] = False
                
                # Check total dataset size
                min_total_files = 10
                if validation_results["labeled_files"] < min_total_files:
                    validation_results["issues"].append(
                        f"Dataset too small: {validation_results['labeled_files']} < {min_total_files}"
                    )
                    validation_results["is_valid"] = False
                
                # TODO: Validate actual file accessibility
                # This would involve checking if files exist and are readable
                
                # Update dataset status
                new_status = "ready" if validation_results["is_valid"] else "error"
                await dataset_service.update_dataset(dataset_id, {"status": new_status})
                
                return {
                    "success": True,
                    "validation_results": validation_results,
                }
                
            except Exception as e:
                logger.error(f"Dataset validation failed: {e}")
                return {
                    "success": False,
                    "error": str(e),
                }
    
    # Run the async function
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(_validate_dataset())
    finally:
        loop.close()


@celery_app.task(name="preprocess_dataset")
def preprocess_dataset_task(
    dataset_id: str,
    preprocessing_config: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Preprocess a dataset for training.
    
    Args:
        dataset_id: ID of the dataset to preprocess
        preprocessing_config: Preprocessing configuration
        
    Returns:
        Preprocessing results
    """
    async def _preprocess_dataset():
        async with AsyncSessionLocal() as db:
            try:
                # Get dataset
                dataset_service = DatasetService(db)
                dataset = await dataset_service.get_dataset(dataset_id)
                
                if not dataset:
                    raise ValueError(f"Dataset {dataset_id} not found")
                
                # Update dataset status
                await dataset_service.update_dataset(dataset_id, {"status": "processing"})
                
                preprocessing_results = {
                    "dataset_id": dataset_id,
                    "processed_files": 0,
                    "failed_files": [],
                    "statistics": {
                        "mean_width": 0,
                        "mean_height": 0,
                        "min_width": float('inf'),
                        "max_width": 0,
                        "min_height": float('inf'),
                        "max_height": 0,
                    },
                }
                
                # Get preprocessing transforms
                transforms = get_validation_transforms(
                    input_size=preprocessing_config.get("target_size", 224)
                )
                
                widths = []
                heights = []
                
                # Process each file
                for file_id in dataset.file_ids:
                    try:
                        # TODO: Load image from file storage
                        # This is a placeholder - in real implementation,
                        # you would load the image from your storage system
                        
                        # For now, simulate image processing
                        # In real implementation:
                        # image = load_image_from_storage(file_id)
                        # processed_image = transforms(image)
                        
                        # Simulate image dimensions
                        width, height = 256, 256  # Placeholder dimensions
                        widths.append(width)
                        heights.append(height)
                        
                        preprocessing_results["processed_files"] += 1
                        
                    except Exception as e:
                        logger.warning(f"Failed to preprocess file {file_id}: {e}")
                        preprocessing_results["failed_files"].append(file_id)
                
                # Calculate statistics
                if widths and heights:
                    preprocessing_results["statistics"] = {
                        "mean_width": np.mean(widths),
                        "mean_height": np.mean(heights),
                        "min_width": min(widths),
                        "max_width": max(widths),
                        "min_height": min(heights),
                        "max_height": max(heights),
                    }
                
                # Update dataset with preprocessing results
                await dataset_service.update_dataset(dataset_id, {
                    "preprocessing_config": preprocessing_config,
                    "status": "ready" if not preprocessing_results["failed_files"] else "error",
                })
                
                return {
                    "success": True,
                    "preprocessing_results": preprocessing_results,
                }
                
            except Exception as e:
                logger.error(f"Dataset preprocessing failed: {e}")
                
                # Update dataset status to error
                try:
                    await dataset_service.update_dataset(dataset_id, {"status": "error"})
                except:
                    pass
                
                return {
                    "success": False,
                    "error": str(e),
                }
    
    # Run the async function
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(_preprocess_dataset())
    finally:
        loop.close()


@celery_app.task(name="augment_dataset")
def augment_dataset_task(
    dataset_id: str,
    augmentation_config: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Create augmented versions of dataset images.
    
    Args:
        dataset_id: ID of the dataset to augment
        augmentation_config: Augmentation configuration
        
    Returns:
        Augmentation results
    """
    async def _augment_dataset():
        async with AsyncSessionLocal() as db:
            try:
                # Get dataset
                dataset_service = DatasetService(db)
                dataset = await dataset_service.get_dataset(dataset_id)
                
                if not dataset:
                    raise ValueError(f"Dataset {dataset_id} not found")
                
                augmentation_results = {
                    "dataset_id": dataset_id,
                    "original_files": len(dataset.file_ids),
                    "augmented_files": 0,
                    "failed_files": [],
                    "augmentation_types": [],
                }
                
                # Get augmentation transforms
                from src.ml.data.transforms import get_training_transforms
                
                transforms = get_training_transforms(
                    input_size=224,
                    augmentation_config=augmentation_config,
                )
                
                augmented_file_ids = []
                augmented_labels = {}
                
                # Apply augmentations
                augmentations_per_image = augmentation_config.get("augmentations_per_image", 2)
                
                for file_id in dataset.file_ids:
                    if file_id not in dataset.labels:
                        continue
                    
                    original_label = dataset.labels[file_id]
                    
                    try:
                        # TODO: Load and augment image
                        # This is a placeholder - in real implementation,
                        # you would load the image, apply augmentations, and save
                        
                        for aug_idx in range(augmentations_per_image):
                            augmented_id = f"{file_id}_aug_{aug_idx}"
                            augmented_file_ids.append(augmented_id)
                            augmented_labels[augmented_id] = original_label
                            
                            augmentation_results["augmented_files"] += 1
                        
                    except Exception as e:
                        logger.warning(f"Failed to augment file {file_id}: {e}")
                        augmentation_results["failed_files"].append(file_id)
                
                # Update dataset with augmented files
                if augmented_file_ids:
                    await dataset_service.add_files_to_dataset(
                        dataset_id=dataset_id,
                        file_ids=augmented_file_ids,
                        labels=augmented_labels,
                    )
                
                augmentation_results["augmentation_types"] = list(augmentation_config.keys())
                
                return {
                    "success": True,
                    "augmentation_results": augmentation_results,
                }
                
            except Exception as e:
                logger.error(f"Dataset augmentation failed: {e}")
                return {
                    "success": False,
                    "error": str(e),
                }
    
    # Run the async function
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(_augment_dataset())
    finally:
        loop.close()


@celery_app.task(name="cleanup_dataset_cache")
def cleanup_dataset_cache_task(dataset_id: str) -> Dict[str, Any]:
    """
    Clean up cached data for a dataset.
    
    Args:
        dataset_id: ID of the dataset to clean up
        
    Returns:
        Cleanup results
    """
    try:
        from src.core.config import get_settings
        settings = get_settings()
        
        # Define cache directories
        cache_dirs = [
            os.path.join(settings.model_storage_path, "cache", dataset_id),
            os.path.join("/tmp", f"dataset_cache_{dataset_id}"),
        ]
        
        cleanup_results = {
            "dataset_id": dataset_id,
            "cleaned_directories": [],
            "freed_space": 0,
            "errors": [],
        }
        
        for cache_dir in cache_dirs:
            if os.path.exists(cache_dir):
                try:
                    # Calculate directory size before deletion
                    dir_size = sum(
                        os.path.getsize(os.path.join(dirpath, filename))
                        for dirpath, dirnames, filenames in os.walk(cache_dir)
                        for filename in filenames
                    )
                    
                    # Remove directory
                    shutil.rmtree(cache_dir)
                    
                    cleanup_results["cleaned_directories"].append(cache_dir)
                    cleanup_results["freed_space"] += dir_size
                    
                except Exception as e:
                    cleanup_results["errors"].append(f"Failed to clean {cache_dir}: {e}")
        
        return {
            "success": True,
            "cleanup_results": cleanup_results,
        }
        
    except Exception as e:
        logger.error(f"Dataset cache cleanup failed: {e}")
        return {
            "success": False,
            "error": str(e),
        }