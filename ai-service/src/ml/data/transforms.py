"""
Data transforms and augmentation for CAD images.
"""

import torch
from torchvision import transforms
from typing import Dict, Any, Optional
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
import random


class CADSpecificAugmentation:
    """
    Custom augmentation techniques specifically designed for CAD images.
    """
    
    def __init__(self, probability: float = 0.5):
        self.probability = probability
    
    def __call__(self, image: Image.Image) -> Image.Image:
        if random.random() < self.probability:
            return self._apply_cad_augmentation(image)
        return image
    
    def _apply_cad_augmentation(self, image: Image.Image) -> Image.Image:
        """Apply CAD-specific augmentations."""
        # Random choice of augmentation
        augmentation_type = random.choice([
            'line_thickness',
            'contrast_enhancement',
            'technical_noise',
            'grid_overlay',
        ])
        
        if augmentation_type == 'line_thickness':
            return self._adjust_line_thickness(image)
        elif augmentation_type == 'contrast_enhancement':
            return self._enhance_contrast(image)
        elif augmentation_type == 'technical_noise':
            return self._add_technical_noise(image)
        elif augmentation_type == 'grid_overlay':
            return self._add_grid_overlay(image)
        
        return image
    
    def _adjust_line_thickness(self, image: Image.Image) -> Image.Image:
        """Simulate different line thickness in technical drawings."""
        # Convert to numpy for processing
        img_array = np.array(image)
        
        # Apply morphological operations to simulate line thickness changes
        from scipy import ndimage
        
        # Random kernel size for dilation/erosion
        kernel_size = random.choice([1, 2, 3])
        kernel = np.ones((kernel_size, kernel_size))
        
        if random.random() < 0.5:
            # Dilate (thicker lines)
            img_array = ndimage.binary_dilation(img_array < 128, kernel).astype(np.uint8) * 255
            img_array = 255 - img_array  # Invert back
        else:
            # Erode (thinner lines)
            img_array = ndimage.binary_erosion(img_array < 128, kernel).astype(np.uint8) * 255
            img_array = 255 - img_array  # Invert back
        
        return Image.fromarray(img_array)
    
    def _enhance_contrast(self, image: Image.Image) -> Image.Image:
        """Enhance contrast for better feature visibility."""
        enhancer = ImageEnhance.Contrast(image)
        factor = random.uniform(0.8, 1.5)
        return enhancer.enhance(factor)
    
    def _add_technical_noise(self, image: Image.Image) -> Image.Image:
        """Add noise that simulates scanning artifacts or print quality issues."""
        img_array = np.array(image)
        
        # Add salt and pepper noise
        noise = np.random.random(img_array.shape)
        salt_pepper_threshold = 0.02
        
        img_array[noise < salt_pepper_threshold / 2] = 0  # Pepper
        img_array[noise > 1 - salt_pepper_threshold / 2] = 255  # Salt
        
        return Image.fromarray(img_array.astype(np.uint8))
    
    def _add_grid_overlay(self, image: Image.Image) -> Image.Image:
        """Add subtle grid overlay to simulate graph paper or CAD grid."""
        img_array = np.array(image)
        height, width = img_array.shape[:2]
        
        # Create grid pattern
        grid_spacing = random.choice([20, 30, 40, 50])
        grid_intensity = random.uniform(0.1, 0.3)
        
        # Vertical lines
        for x in range(0, width, grid_spacing):
            if x < width:
                img_array[:, x] = img_array[:, x] * (1 - grid_intensity)
        
        # Horizontal lines
        for y in range(0, height, grid_spacing):
            if y < height:
                img_array[y, :] = img_array[y, :] * (1 - grid_intensity)
        
        return Image.fromarray(img_array.astype(np.uint8))


class AdaptiveResize:
    """
    Adaptive resize that maintains aspect ratio and pads if necessary.
    """
    
    def __init__(self, size: int, fill_color: tuple = (255, 255, 255)):
        self.size = size
        self.fill_color = fill_color
    
    def __call__(self, image: Image.Image) -> Image.Image:
        # Calculate scaling factor
        width, height = image.size
        scale = min(self.size / width, self.size / height)
        
        # Resize maintaining aspect ratio
        new_width = int(width * scale)
        new_height = int(height * scale)
        image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        # Create new image with target size and fill color
        new_image = Image.new('RGB', (self.size, self.size), self.fill_color)
        
        # Paste resized image in center
        x_offset = (self.size - new_width) // 2
        y_offset = (self.size - new_height) // 2
        new_image.paste(image, (x_offset, y_offset))
        
        return new_image


def get_training_transforms(
    input_size: int = 224,
    augmentation_config: Optional[Dict[str, Any]] = None,
) -> transforms.Compose:
    """
    Get training transforms with augmentation.
    
    Args:
        input_size: Target input size for the model
        augmentation_config: Configuration for augmentation parameters
        
    Returns:
        Composed transforms for training
    """
    if augmentation_config is None:
        augmentation_config = {}
    
    # Base transforms
    transform_list = [
        AdaptiveResize(input_size),
    ]
    
    # Augmentation transforms
    if augmentation_config.get("enable_rotation", True):
        rotation_degrees = augmentation_config.get("rotation_degrees", 15)
        transform_list.append(
            transforms.RandomRotation(
                degrees=rotation_degrees,
                fill=255,  # White fill for technical drawings
            )
        )
    
    if augmentation_config.get("enable_flip", True):
        flip_prob = augmentation_config.get("flip_probability", 0.5)
        transform_list.extend([
            transforms.RandomHorizontalFlip(p=flip_prob),
            transforms.RandomVerticalFlip(p=flip_prob * 0.5),  # Less likely for technical drawings
        ])
    
    if augmentation_config.get("enable_perspective", False):
        perspective_prob = augmentation_config.get("perspective_probability", 0.3)
        transform_list.append(
            transforms.RandomPerspective(
                distortion_scale=0.2,
                p=perspective_prob,
                fill=255,
            )
        )
    
    if augmentation_config.get("enable_affine", True):
        affine_prob = augmentation_config.get("affine_probability", 0.3)
        transform_list.append(
            transforms.RandomAffine(
                degrees=0,
                translate=(0.1, 0.1),
                scale=(0.9, 1.1),
                fill=255,
                p=affine_prob,
            )
        )
    
    # CAD-specific augmentation
    if augmentation_config.get("enable_cad_augmentation", True):
        cad_aug_prob = augmentation_config.get("cad_augmentation_probability", 0.3)
        transform_list.append(CADSpecificAugmentation(probability=cad_aug_prob))
    
    # Color jitter (subtle for technical drawings)
    if augmentation_config.get("enable_color_jitter", True):
        color_jitter_prob = augmentation_config.get("color_jitter_probability", 0.3)
        transform_list.append(
            transforms.RandomApply([
                transforms.ColorJitter(
                    brightness=0.2,
                    contrast=0.2,
                    saturation=0.1,
                    hue=0.05,
                )
            ], p=color_jitter_prob)
        )
    
    # Convert to tensor and normalize
    transform_list.extend([
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],  # ImageNet means
            std=[0.229, 0.224, 0.225],   # ImageNet stds
        ),
    ])
    
    return transforms.Compose(transform_list)


def get_validation_transforms(input_size: int = 224) -> transforms.Compose:
    """
    Get validation transforms without augmentation.
    
    Args:
        input_size: Target input size for the model
        
    Returns:
        Composed transforms for validation
    """
    return transforms.Compose([
        AdaptiveResize(input_size),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225],
        ),
    ])


def get_inference_transforms(input_size: int = 224) -> transforms.Compose:
    """
    Get inference transforms (same as validation).
    
    Args:
        input_size: Target input size for the model
        
    Returns:
        Composed transforms for inference
    """
    return get_validation_transforms(input_size)


def denormalize_tensor(tensor: torch.Tensor) -> torch.Tensor:
    """
    Denormalize a tensor that was normalized with ImageNet stats.
    
    Args:
        tensor: Normalized tensor
        
    Returns:
        Denormalized tensor
    """
    mean = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1)
    std = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1)
    
    return tensor * std + mean


def tensor_to_pil(tensor: torch.Tensor) -> Image.Image:
    """
    Convert a tensor to PIL Image.
    
    Args:
        tensor: Input tensor (C, H, W)
        
    Returns:
        PIL Image
    """
    # Denormalize if normalized
    if tensor.min() < 0:
        tensor = denormalize_tensor(tensor)
    
    # Clamp values to [0, 1]
    tensor = torch.clamp(tensor, 0, 1)
    
    # Convert to numpy and transpose
    np_array = tensor.numpy().transpose(1, 2, 0)
    
    # Convert to uint8
    np_array = (np_array * 255).astype(np.uint8)
    
    return Image.fromarray(np_array)