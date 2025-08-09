"""
Celery tasks for AI model inference operations.
"""

import asyncio
import torch
import numpy as np
from typing import Dict, Any, List, Optional
import logging
from PIL import Image
import io

from src.core.celery_app import celery_app
from src.core.database import AsyncSessionLocal
from src.services.model_service import ModelService
from src.ml.models.cnn_model import create_cad_model
from src.ml.data.transforms import get_inference_transforms

logger = logging.getLogger(__name__)


@celery_app.task(name="extract_features_from_image")
def extract_features_from_image_task(
    image_data: bytes,
    model_id: str,
) -> Dict[str, Any]:
    """
    Extract features from an image using a trained model.
    
    Args:
        image_data: Image data as bytes
        model_id: ID of the model to use
        
    Returns:
        Extracted features and metadata
    """
    async def _extract_features():
        async with AsyncSessionLocal() as db:
            try:
                # Get model
                model_service = ModelService(db)
                model_record = await model_service.get_model(model_id)
                
                if not model_record:
                    raise ValueError(f"Model {model_id} not found")
                
                if model_record.status != "ready":
                    raise ValueError(f"Model {model_id} is not ready")
                
                # Load the trained model
                device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
                model = create_cad_model(model_record.config)
                
                # Load model weights
                checkpoint = torch.load(model_record.model_path, map_location=device)
                model.load_state_dict(checkpoint["model_state_dict"])
                model.to(device)
                model.eval()
                
                # Prepare image
                image = Image.open(io.BytesIO(image_data))
                if image.mode != 'RGB':
                    image = image.convert('RGB')
                
                # Apply transforms
                transforms = get_inference_transforms(
                    input_size=model_record.config.get("input_size", 224)
                )
                image_tensor = transforms(image).unsqueeze(0).to(device)
                
                # Extract features
                with torch.no_grad():
                    features = model.extract_features(image_tensor)
                    features_np = features.cpu().numpy().flatten()
                
                return {
                    "success": True,
                    "model_id": model_id,
                    "features": features_np.tolist(),
                    "feature_dimension": len(features_np),
                }
                
            except Exception as e:
                logger.error(f"Feature extraction failed: {e}")
                return {
                    "success": False,
                    "error": str(e),
                }
    
    # Run the async function
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(_extract_features())
    finally:
        loop.close()


@celery_app.task(name="compute_similarity_batch")
def compute_similarity_batch_task(
    query_features: List[float],
    candidate_features: List[List[float]],
    candidate_ids: List[str],
    similarity_metric: str = "cosine",
) -> Dict[str, Any]:
    """
    Compute similarity between query features and a batch of candidate features.
    
    Args:
        query_features: Query feature vector
        candidate_features: List of candidate feature vectors
        candidate_ids: List of candidate IDs
        similarity_metric: Similarity metric to use
        
    Returns:
        Similarity scores and rankings
    """
    try:
        query_np = np.array(query_features)
        candidates_np = np.array(candidate_features)
        
        if similarity_metric == "cosine":
            # Compute cosine similarity
            query_norm = np.linalg.norm(query_np)
            candidate_norms = np.linalg.norm(candidates_np, axis=1)
            
            # Avoid division by zero
            if query_norm == 0:
                similarities = np.zeros(len(candidates_np))
            else:
                dot_products = np.dot(candidates_np, query_np)
                similarities = dot_products / (query_norm * candidate_norms + 1e-8)
        
        elif similarity_metric == "euclidean":
            # Compute negative Euclidean distance (higher is more similar)
            distances = np.linalg.norm(candidates_np - query_np, axis=1)
            similarities = -distances
        
        else:
            raise ValueError(f"Unsupported similarity metric: {similarity_metric}")
        
        # Create results with IDs and scores
        results = [
            {
                "id": candidate_ids[i],
                "similarity_score": float(similarities[i]),
                "rank": i + 1,
            }
            for i in range(len(candidate_ids))
        ]
        
        # Sort by similarity score (descending)
        results.sort(key=lambda x: x["similarity_score"], reverse=True)
        
        # Update ranks
        for i, result in enumerate(results):
            result["rank"] = i + 1
        
        return {
            "success": True,
            "results": results,
            "similarity_metric": similarity_metric,
            "query_dimension": len(query_features),
            "candidate_count": len(candidate_features),
        }
        
    except Exception as e:
        logger.error(f"Similarity computation failed: {e}")
        return {
            "success": False,
            "error": str(e),
        }


@celery_app.task(name="precompute_embeddings")
def precompute_embeddings_task(
    file_ids: List[str],
    model_id: str,
    batch_size: int = 32,
) -> Dict[str, Any]:
    """
    Precompute embeddings for a batch of files.
    
    Args:
        file_ids: List of file IDs to process
        model_id: ID of the model to use
        batch_size: Batch size for processing
        
    Returns:
        Precomputed embeddings
    """
    async def _precompute_embeddings():
        async with AsyncSessionLocal() as db:
            try:
                # Get model
                model_service = ModelService(db)
                model_record = await model_service.get_model(model_id)
                
                if not model_record:
                    raise ValueError(f"Model {model_id} not found")
                
                if model_record.status != "ready":
                    raise ValueError(f"Model {model_id} is not ready")
                
                # Load the trained model
                device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
                model = create_cad_model(model_record.config)
                
                # Load model weights
                checkpoint = torch.load(model_record.model_path, map_location=device)
                model.load_state_dict(checkpoint["model_state_dict"])
                model.to(device)
                model.eval()
                
                # Prepare transforms
                transforms = get_inference_transforms(
                    input_size=model_record.config.get("input_size", 224)
                )
                
                embeddings = {}
                failed_files = []
                
                # Process files in batches
                for i in range(0, len(file_ids), batch_size):
                    batch_ids = file_ids[i:i + batch_size]
                    batch_tensors = []
                    valid_ids = []
                    
                    # Load and preprocess batch
                    for file_id in batch_ids:
                        try:
                            # TODO: Load image from file storage
                            # This is a placeholder - in real implementation,
                            # you would load the image from your storage system
                            
                            # For now, create a dummy tensor
                            dummy_tensor = torch.randn(3, 224, 224)
                            batch_tensors.append(dummy_tensor)
                            valid_ids.append(file_id)
                            
                        except Exception as e:
                            logger.warning(f"Failed to load file {file_id}: {e}")
                            failed_files.append(file_id)
                    
                    if batch_tensors:
                        # Stack tensors and move to device
                        batch_tensor = torch.stack(batch_tensors).to(device)
                        
                        # Extract features
                        with torch.no_grad():
                            features = model.extract_features(batch_tensor)
                            features_np = features.cpu().numpy()
                        
                        # Store embeddings
                        for j, file_id in enumerate(valid_ids):
                            embeddings[file_id] = features_np[j].tolist()
                
                return {
                    "success": True,
                    "model_id": model_id,
                    "embeddings": embeddings,
                    "processed_count": len(embeddings),
                    "failed_count": len(failed_files),
                    "failed_files": failed_files,
                }
                
            except Exception as e:
                logger.error(f"Embedding precomputation failed: {e}")
                return {
                    "success": False,
                    "error": str(e),
                }
    
    # Run the async function
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(_precompute_embeddings())
    finally:
        loop.close()