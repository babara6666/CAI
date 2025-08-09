"""
Dataset classes for CAD image data loading and preprocessing.
"""

import os
import torch
from torch.utils.data import Dataset
from PIL import Image
import numpy as np
from typing import List, Dict, Any, Optional, Callable
import requests
from io import BytesIO
import logging

logger = logging.getLogger(__name__)


class CADDataset(Dataset):
    """
    Dataset class for loading CAD images with labels.
    Supports both local files and remote URLs.
    """
    
    def __init__(
        self,
        file_ids: List[str],
        labels: Dict[str, int],
        transform: Optional[Callable] = None,
        base_url: Optional[str] = None,
    ):
        """
        Initialize CAD dataset.
        
        Args:
            file_ids: List of file IDs or paths
            labels: Dictionary mapping file_id to label index
            transform: Optional transform to apply to images
            base_url: Base URL for remote file access
        """
        self.file_ids = file_ids
        self.labels = labels
        self.transform = transform
        self.base_url = base_url
        
        # Filter out files without labels
        self.valid_files = [
            file_id for file_id in file_ids 
            if file_id in labels
        ]
        
        logger.info(f"Dataset initialized with {len(self.valid_files)} valid files")
    
    def __len__(self) -> int:
        return len(self.valid_files)
    
    def __getitem__(self, idx: int) -> tuple:
        """
        Get item by index.
        
        Args:
            idx: Index of the item
            
        Returns:
            Tuple of (image, label)
        """
        file_id = self.valid_files[idx]
        label = self.labels[file_id]
        
        try:
            # Load image
            image = self._load_image(file_id)
            
            # Apply transforms
            if self.transform:
                image = self.transform(image)
            
            return image, label
            
        except Exception as e:
            logger.error(f"Error loading image {file_id}: {e}")
            # Return a black image as fallback
            if self.transform:
                fallback_image = Image.new('RGB', (224, 224), color='black')
                return self.transform(fallback_image), label
            else:
                return torch.zeros(3, 224, 224), label
    
    def _load_image(self, file_id: str) -> Image.Image:
        """
        Load image from file ID.
        
        Args:
            file_id: File identifier
            
        Returns:
            PIL Image
        """
        if self.base_url:
            # Load from remote URL
            url = f"{self.base_url}/files/{file_id}/thumbnail"
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            image = Image.open(BytesIO(response.content))
        else:
            # Load from local path
            if os.path.exists(file_id):
                image = Image.open(file_id)
            else:
                # Try common image extensions
                for ext in ['.jpg', '.jpeg', '.png', '.bmp', '.tiff']:
                    path = f"{file_id}{ext}"
                    if os.path.exists(path):
                        image = Image.open(path)
                        break
                else:
                    raise FileNotFoundError(f"Image file not found: {file_id}")
        
        # Convert to RGB if necessary
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        return image
    
    def get_class_distribution(self) -> Dict[int, int]:
        """Get distribution of classes in the dataset."""
        distribution = {}
        for file_id in self.valid_files:
            label = self.labels[file_id]
            distribution[label] = distribution.get(label, 0) + 1
        return distribution


class CADSiameseDataset(Dataset):
    """
    Dataset class for Siamese network training with CAD images.
    Generates pairs of similar and dissimilar images.
    """
    
    def __init__(
        self,
        file_ids: List[str],
        labels: Dict[str, int],
        transform: Optional[Callable] = None,
        base_url: Optional[str] = None,
        positive_ratio: float = 0.5,
    ):
        """
        Initialize Siamese dataset.
        
        Args:
            file_ids: List of file IDs
            labels: Dictionary mapping file_id to label
            transform: Optional transform to apply to images
            base_url: Base URL for remote file access
            positive_ratio: Ratio of positive pairs to generate
        """
        self.file_ids = file_ids
        self.labels = labels
        self.transform = transform
        self.base_url = base_url
        self.positive_ratio = positive_ratio
        
        # Group files by label
        self.label_to_files = {}
        for file_id in file_ids:
            if file_id in labels:
                label = labels[file_id]
                if label not in self.label_to_files:
                    self.label_to_files[label] = []
                self.label_to_files[label].append(file_id)
        
        # Generate pairs
        self.pairs = self._generate_pairs()
        
        logger.info(f"Siamese dataset initialized with {len(self.pairs)} pairs")
    
    def _generate_pairs(self) -> List[tuple]:
        """Generate pairs of images with similarity labels."""
        pairs = []
        num_positive = int(len(self.file_ids) * self.positive_ratio)
        num_negative = len(self.file_ids) - num_positive
        
        # Generate positive pairs (same class)
        for _ in range(num_positive):
            # Choose a random class with at least 2 images
            valid_labels = [
                label for label, files in self.label_to_files.items()
                if len(files) >= 2
            ]
            if not valid_labels:
                break
                
            label = np.random.choice(valid_labels)
            files = self.label_to_files[label]
            file1, file2 = np.random.choice(files, 2, replace=False)
            pairs.append((file1, file2, 1))  # 1 for similar
        
        # Generate negative pairs (different classes)
        for _ in range(num_negative):
            if len(self.label_to_files) < 2:
                break
                
            labels = list(self.label_to_files.keys())
            label1, label2 = np.random.choice(labels, 2, replace=False)
            
            file1 = np.random.choice(self.label_to_files[label1])
            file2 = np.random.choice(self.label_to_files[label2])
            pairs.append((file1, file2, 0))  # 0 for dissimilar
        
        return pairs
    
    def __len__(self) -> int:
        return len(self.pairs)
    
    def __getitem__(self, idx: int) -> tuple:
        """
        Get pair by index.
        
        Args:
            idx: Index of the pair
            
        Returns:
            Tuple of (image1, image2, similarity_label)
        """
        file1, file2, similarity = self.pairs[idx]
        
        try:
            # Load images
            image1 = self._load_image(file1)
            image2 = self._load_image(file2)
            
            # Apply transforms
            if self.transform:
                image1 = self.transform(image1)
                image2 = self.transform(image2)
            
            return image1, image2, similarity
            
        except Exception as e:
            logger.error(f"Error loading pair {file1}, {file2}: {e}")
            # Return black images as fallback
            if self.transform:
                fallback_image = Image.new('RGB', (224, 224), color='black')
                return (
                    self.transform(fallback_image),
                    self.transform(fallback_image),
                    similarity
                )
            else:
                return torch.zeros(3, 224, 224), torch.zeros(3, 224, 224), similarity
    
    def _load_image(self, file_id: str) -> Image.Image:
        """Load image from file ID (same as CADDataset)."""
        if self.base_url:
            url = f"{self.base_url}/files/{file_id}/thumbnail"
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            image = Image.open(BytesIO(response.content))
        else:
            if os.path.exists(file_id):
                image = Image.open(file_id)
            else:
                for ext in ['.jpg', '.jpeg', '.png', '.bmp', '.tiff']:
                    path = f"{file_id}{ext}"
                    if os.path.exists(path):
                        image = Image.open(path)
                        break
                else:
                    raise FileNotFoundError(f"Image file not found: {file_id}")
        
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        return image


def create_dataset(
    dataset_type: str,
    file_ids: List[str],
    labels: Dict[str, int],
    transform: Optional[Callable] = None,
    **kwargs
) -> Dataset:
    """
    Factory function to create datasets.
    
    Args:
        dataset_type: Type of dataset ('standard' or 'siamese')
        file_ids: List of file IDs
        labels: Dictionary mapping file_id to label
        transform: Optional transform to apply
        **kwargs: Additional arguments for specific dataset types
        
    Returns:
        Dataset instance
    """
    if dataset_type == "standard":
        return CADDataset(file_ids, labels, transform, **kwargs)
    elif dataset_type == "siamese":
        return CADSiameseDataset(file_ids, labels, transform, **kwargs)
    else:
        raise ValueError(f"Unsupported dataset type: {dataset_type}")