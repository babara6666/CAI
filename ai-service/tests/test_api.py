"""
API integration tests for the AI service.
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch

from src.main import app

client = TestClient(app)


class TestHealthEndpoint:
    """Test health check endpoint."""
    
    def test_health_check(self):
        """Test health check endpoint."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"
        assert response.json()["service"] == "ai-service"


class TestTrainingAPI:
    """Test training API endpoints."""
    
    @patch('src.api.routes.training.TrainingService')
    def test_list_training_jobs(self, mock_service):
        """Test listing training jobs."""
        # Mock service response
        mock_job = AsyncMock()
        mock_job.to_dict.return_value = {
            "id": "test-job-id",
            "name": "Test Job",
            "dataset_id": "test-dataset-id",
            "model_type": "cnn",
            "status": "completed",
            "config": {},
            "hyperparameters": {},
            "current_epoch": 10,
            "total_epochs": 10,
            "progress_percentage": 100.0,
            "training_loss": 0.1,
            "validation_loss": 0.2,
            "accuracy": 0.9,
            "precision": 0.85,
            "recall": 0.88,
            "f1_score": 0.86,
            "started_at": None,
            "completed_at": None,
            "estimated_completion": None,
            "model_path": "/path/to/model.pth",
            "error_message": None,
            "created_by": "test-user-id",
            "created_at": "2024-01-01T00:00:00",
            "updated_at": "2024-01-01T00:00:00",
        }
        
        mock_service.return_value.list_training_jobs.return_value = [mock_job]
        
        response = client.get("/api/training/jobs")
        assert response.status_code == 200
        
        jobs = response.json()
        assert len(jobs) == 1
        assert jobs[0]["id"] == "test-job-id"
        assert jobs[0]["name"] == "Test Job"


class TestModelsAPI:
    """Test models API endpoints."""
    
    @patch('src.api.routes.models.ModelService')
    def test_list_models(self, mock_service):
        """Test listing AI models."""
        # Mock service response
        mock_model = AsyncMock()
        mock_model.to_dict.return_value = {
            "id": "test-model-id",
            "name": "Test Model",
            "description": "Test model description",
            "version": "1.0.0",
            "model_type": "cnn",
            "training_job_id": "test-job-id",
            "training_dataset_id": "test-dataset-id",
            "model_path": "/path/to/model.pth",
            "config": {},
            "architecture": {},
            "performance": {
                "accuracy": 0.9,
                "precision": 0.85,
                "recall": 0.88,
                "f1_score": 0.86,
            },
            "status": "ready",
            "is_default": False,
            "created_by": "test-user-id",
            "created_at": "2024-01-01T00:00:00",
            "updated_at": "2024-01-01T00:00:00",
        }
        
        mock_service.return_value.list_models.return_value = [mock_model]
        
        response = client.get("/api/models/")
        assert response.status_code == 200
        
        models = response.json()
        assert len(models) == 1
        assert models[0]["id"] == "test-model-id"
        assert models[0]["name"] == "Test Model"


class TestDatasetsAPI:
    """Test datasets API endpoints."""
    
    @patch('src.api.routes.datasets.DatasetService')
    def test_list_datasets(self, mock_service):
        """Test listing datasets."""
        # Mock service response
        mock_dataset = AsyncMock()
        mock_dataset.to_dict.return_value = {
            "id": "test-dataset-id",
            "name": "Test Dataset",
            "description": "Test dataset description",
            "file_count": 100,
            "total_size": 1024000,
            "file_ids": ["file1", "file2", "file3"],
            "labels": {"file1": 0, "file2": 1, "file3": 0},
            "categories": ["category1", "category2"],
            "tags": ["tag1", "tag2"],
            "status": "ready",
            "label_distribution": {"0": 2, "1": 1},
            "preprocessing_config": {},
            "created_by": "test-user-id",
            "created_at": "2024-01-01T00:00:00",
            "updated_at": "2024-01-01T00:00:00",
        }
        
        mock_service.return_value.list_datasets.return_value = [mock_dataset]
        
        response = client.get("/api/datasets/")
        assert response.status_code == 200
        
        datasets = response.json()
        assert len(datasets) == 1
        assert datasets[0]["id"] == "test-dataset-id"
        assert datasets[0]["name"] == "Test Dataset"


class TestInferenceAPI:
    """Test inference API endpoints."""
    
    @patch('src.api.routes.inference.ModelService')
    def test_search_similar_files(self, mock_service):
        """Test similarity search endpoint."""
        # Mock service response
        mock_model = AsyncMock()
        mock_model.id = "test-model-id"
        mock_model.model_type = "cnn"
        mock_model.status = "ready"
        
        mock_service.return_value.get_default_model.return_value = mock_model
        
        request_data = {
            "query": "test query",
            "top_k": 5,
        }
        
        response = client.post("/api/inference/search", json=request_data)
        assert response.status_code == 200
        
        result = response.json()
        assert result["model_id"] == "test-model-id"
        assert result["model_type"] == "cnn"
        assert len(result["results"]) <= 5


if __name__ == "__main__":
    pytest.main([__file__])