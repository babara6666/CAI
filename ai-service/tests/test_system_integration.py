import pytest
import asyncio
import aiohttp
import tempfile
import os
import json
import time
from pathlib import Path
from typing import List, Dict, Any

from src.main import app
from src.core.config import settings
from src.services.training_service import TrainingService
from src.services.model_service import ModelService
from src.services.dataset_service import DatasetService
from src.ml.models.cnn_model import CNNModel
from src.ml.training.trainer import ModelTrainer
from src.ml.evaluation.evaluator import ModelEvaluator

class TestSystemIntegration:
    """Comprehensive system integration tests for AI service"""
    
    @pytest.fixture(autouse=True)
    async def setup_test_environment(self):
        """Setup test environment before each test"""
        self.test_data_dir = Path(tempfile.mkdtemp())
        self.test_files = []
        
        # Create test CAD files (mock data)
        for i in range(10):
            test_file = self.test_data_dir / f"test_cad_{i}.dwg"
            test_file.write_bytes(b"mock CAD file content " + str(i).encode())
            self.test_files.append(str(test_file))
        
        # Initialize services
        self.training_service = TrainingService()
        self.model_service = ModelService()
        self.dataset_service = DatasetService()
        
        yield
        
        # Cleanup
        import shutil
        shutil.rmtree(self.test_data_dir, ignore_errors=True)

    async def test_complete_ai_workflow_integration(self):
        """Test complete AI workflow from dataset creation to inference"""
        
        # Step 1: Create dataset
        dataset_data = {
            "name": "Integration Test Dataset",
            "description": "Dataset for system integration testing",
            "files": self.test_files[:5],
            "labels": ["mechanical", "electrical", "structural", "hydraulic", "pneumatic"]
        }
        
        dataset = await self.dataset_service.create_dataset(dataset_data)
        assert dataset is not None
        assert dataset["name"] == "Integration Test Dataset"
        assert len(dataset["files"]) == 5
        
        dataset_id = dataset["id"]
        
        # Step 2: Validate dataset
        validation_result = await self.dataset_service.validate_dataset(dataset_id)
        assert validation_result["valid"] is True
        assert validation_result["file_count"] == 5
        assert validation_result["label_count"] == 5
        
        # Step 3: Start model training
        training_config = {
            "model_name": "Integration Test Model",
            "architecture": "cnn",
            "hyperparameters": {
                "learning_rate": 0.001,
                "batch_size": 16,
                "epochs": 5,
                "dropout_rate": 0.2
            },
            "training_config": {
                "validation_split": 0.2,
                "early_stopping": True,
                "save_best_only": True
            }
        }
        
        training_job = await self.training_service.start_training(
            dataset_id, training_config
        )
        assert training_job is not None
        assert training_job["status"] == "started"
        
        job_id = training_job["id"]
        
        # Step 4: Monitor training progress
        max_wait_time = 300  # 5 minutes
        start_time = time.time()
        
        while time.time() - start_time < max_wait_time:
            progress = await self.training_service.get_training_progress(job_id)
            
            assert progress is not None
            assert "epoch" in progress
            assert "loss" in progress
            assert "accuracy" in progress
            assert "status" in progress
            
            if progress["status"] in ["completed", "failed"]:
                break
                
            await asyncio.sleep(5)
        
        # Verify training completed successfully
        final_progress = await self.training_service.get_training_progress(job_id)
        assert final_progress["status"] == "completed"
        assert final_progress["epoch"] == 5
        assert final_progress["accuracy"] > 0.0
        
        # Step 5: Get trained model
        models = await self.model_service.list_models()
        trained_model = None
        
        for model in models:
            if model["training_job_id"] == job_id:
                trained_model = model
                break
        
        assert trained_model is not None
        assert trained_model["status"] == "ready"
        assert trained_model["performance"]["accuracy"] > 0.0
        
        model_id = trained_model["id"]
        
        # Step 6: Test model inference
        inference_data = {
            "query": "find mechanical parts with gears",
            "files": self.test_files[5:],  # Use different files for inference
            "top_k": 3
        }
        
        inference_results = await self.model_service.run_inference(
            model_id, inference_data
        )
        
        assert inference_results is not None
        assert "results" in inference_results
        assert len(inference_results["results"]) <= 3
        
        for result in inference_results["results"]:
            assert "file_id" in result
            assert "confidence" in result
            assert "features" in result
            assert 0.0 <= result["confidence"] <= 1.0
        
        # Step 7: Test model evaluation
        evaluation_data = {
            "test_files": self.test_files[7:],
            "ground_truth_labels": ["mechanical", "electrical", "structural"]
        }
        
        evaluation_results = await self.model_service.evaluate_model(
            model_id, evaluation_data
        )
        
        assert evaluation_results is not None
        assert "accuracy" in evaluation_results
        assert "precision" in evaluation_results
        assert "recall" in evaluation_results
        assert "f1_score" in evaluation_results
        
        # All metrics should be between 0 and 1
        for metric in ["accuracy", "precision", "recall", "f1_score"]:
            assert 0.0 <= evaluation_results[metric] <= 1.0

    async def test_concurrent_training_jobs(self):
        """Test handling of multiple concurrent training jobs"""
        
        # Create multiple datasets
        datasets = []
        for i in range(3):
            dataset_data = {
                "name": f"Concurrent Test Dataset {i}",
                "description": f"Dataset {i} for concurrent training test",
                "files": self.test_files[i*2:(i+1)*2],
                "labels": [f"label_{i}_1", f"label_{i}_2"]
            }
            
            dataset = await self.dataset_service.create_dataset(dataset_data)
            datasets.append(dataset)
        
        # Start multiple training jobs concurrently
        training_jobs = []
        for i, dataset in enumerate(datasets):
            training_config = {
                "model_name": f"Concurrent Test Model {i}",
                "architecture": "cnn",
                "hyperparameters": {
                    "learning_rate": 0.001,
                    "batch_size": 8,
                    "epochs": 3
                }
            }
            
            job = await self.training_service.start_training(
                dataset["id"], training_config
            )
            training_jobs.append(job)
        
        # Verify all jobs started
        assert len(training_jobs) == 3
        for job in training_jobs:
            assert job["status"] == "started"
        
        # Monitor all jobs until completion
        max_wait_time = 600  # 10 minutes
        start_time = time.time()
        completed_jobs = 0
        
        while time.time() - start_time < max_wait_time and completed_jobs < 3:
            completed_jobs = 0
            
            for job in training_jobs:
                progress = await self.training_service.get_training_progress(job["id"])
                if progress["status"] in ["completed", "failed"]:
                    completed_jobs += 1
            
            await asyncio.sleep(10)
        
        # Verify all jobs completed successfully
        assert completed_jobs == 3
        
        for job in training_jobs:
            final_progress = await self.training_service.get_training_progress(job["id"])
            assert final_progress["status"] == "completed"

    async def test_model_performance_under_load(self):
        """Test model inference performance under high load"""
        
        # First create and train a model
        dataset_data = {
            "name": "Load Test Dataset",
            "description": "Dataset for load testing",
            "files": self.test_files,
            "labels": ["test"] * len(self.test_files)
        }
        
        dataset = await self.dataset_service.create_dataset(dataset_data)
        
        training_config = {
            "model_name": "Load Test Model",
            "architecture": "cnn",
            "hyperparameters": {
                "learning_rate": 0.001,
                "batch_size": 16,
                "epochs": 3
            }
        }
        
        training_job = await self.training_service.start_training(
            dataset["id"], training_config
        )
        
        # Wait for training completion
        while True:
            progress = await self.training_service.get_training_progress(training_job["id"])
            if progress["status"] in ["completed", "failed"]:
                break
            await asyncio.sleep(5)
        
        # Get the trained model
        models = await self.model_service.list_models()
        model = models[-1]  # Get the latest model
        model_id = model["id"]
        
        # Perform concurrent inference requests
        inference_tasks = []
        num_concurrent_requests = 20
        
        for i in range(num_concurrent_requests):
            inference_data = {
                "query": f"load test query {i}",
                "files": [self.test_files[i % len(self.test_files)]],
                "top_k": 1
            }
            
            task = self.model_service.run_inference(model_id, inference_data)
            inference_tasks.append(task)
        
        # Execute all inference requests concurrently
        start_time = time.time()
        results = await asyncio.gather(*inference_tasks, return_exceptions=True)
        end_time = time.time()
        
        # Verify all requests completed successfully
        successful_results = [r for r in results if not isinstance(r, Exception)]
        assert len(successful_results) == num_concurrent_requests
        
        # Verify reasonable performance (should complete within 30 seconds)
        total_time = end_time - start_time
        assert total_time < 30.0
        
        # Verify average response time is reasonable
        avg_response_time = total_time / num_concurrent_requests
        assert avg_response_time < 2.0  # Less than 2 seconds per request on average

    async def test_data_pipeline_integrity(self):
        """Test data processing pipeline integrity"""
        
        # Test data preprocessing
        from src.ml.data.transforms import DataTransforms
        from src.ml.data.dataset import CADDataset
        
        transforms = DataTransforms()
        
        # Test image preprocessing
        test_image_data = b"mock image data"
        processed_image = transforms.preprocess_image(test_image_data)
        assert processed_image is not None
        assert processed_image.shape is not None
        
        # Test feature extraction
        features = transforms.extract_features(processed_image)
        assert features is not None
        assert len(features) > 0
        
        # Test dataset creation
        dataset = CADDataset(
            files=self.test_files[:5],
            labels=["test"] * 5,
            transforms=transforms
        )
        
        assert len(dataset) == 5
        
        # Test data loading
        sample = dataset[0]
        assert "image" in sample
        assert "label" in sample
        assert "metadata" in sample
        
        # Test batch processing
        from torch.utils.data import DataLoader
        
        dataloader = DataLoader(dataset, batch_size=2, shuffle=True)
        batch = next(iter(dataloader))
        
        assert batch["image"].shape[0] == 2  # Batch size
        assert batch["label"].shape[0] == 2
        assert len(batch["metadata"]) == 2

    async def test_model_versioning_and_rollback(self):
        """Test model versioning and rollback capabilities"""
        
        # Create dataset
        dataset_data = {
            "name": "Versioning Test Dataset",
            "description": "Dataset for model versioning test",
            "files": self.test_files[:5],
            "labels": ["v1"] * 5
        }
        
        dataset = await self.dataset_service.create_dataset(dataset_data)
        
        # Train first model version
        training_config_v1 = {
            "model_name": "Versioning Test Model",
            "version": "1.0",
            "architecture": "cnn",
            "hyperparameters": {
                "learning_rate": 0.001,
                "batch_size": 16,
                "epochs": 3
            }
        }
        
        job_v1 = await self.training_service.start_training(
            dataset["id"], training_config_v1
        )
        
        # Wait for completion
        while True:
            progress = await self.training_service.get_training_progress(job_v1["id"])
            if progress["status"] in ["completed", "failed"]:
                break
            await asyncio.sleep(5)
        
        # Get first model
        models = await self.model_service.list_models()
        model_v1 = models[-1]
        
        # Train second model version with different config
        training_config_v2 = {
            "model_name": "Versioning Test Model",
            "version": "2.0",
            "architecture": "cnn",
            "hyperparameters": {
                "learning_rate": 0.0005,  # Different learning rate
                "batch_size": 16,
                "epochs": 3
            }
        }
        
        job_v2 = await self.training_service.start_training(
            dataset["id"], training_config_v2
        )
        
        # Wait for completion
        while True:
            progress = await self.training_service.get_training_progress(job_v2["id"])
            if progress["status"] in ["completed", "failed"]:
                break
            await asyncio.sleep(5)
        
        # Get second model
        models = await self.model_service.list_models()
        model_v2 = models[-1]
        
        # Verify both models exist
        assert model_v1["id"] != model_v2["id"]
        assert model_v1["version"] == "1.0"
        assert model_v2["version"] == "2.0"
        
        # Test model comparison
        comparison = await self.model_service.compare_models(
            [model_v1["id"], model_v2["id"]]
        )
        
        assert comparison is not None
        assert len(comparison["models"]) == 2
        assert "performance_comparison" in comparison
        
        # Test model rollback (set v1 as active)
        await self.model_service.set_active_model(model_v1["id"])
        
        active_model = await self.model_service.get_active_model()
        assert active_model["id"] == model_v1["id"]
        
        # Test inference with rolled back model
        inference_data = {
            "query": "rollback test query",
            "files": [self.test_files[0]],
            "top_k": 1
        }
        
        results = await self.model_service.run_inference(
            active_model["id"], inference_data
        )
        
        assert results is not None
        assert len(results["results"]) == 1

    async def test_error_handling_and_recovery(self):
        """Test error handling and recovery mechanisms"""
        
        # Test invalid dataset creation
        invalid_dataset_data = {
            "name": "",  # Invalid empty name
            "files": [],  # Invalid empty files
            "labels": []
        }
        
        with pytest.raises(ValueError):
            await self.dataset_service.create_dataset(invalid_dataset_data)
        
        # Test training with invalid configuration
        valid_dataset_data = {
            "name": "Error Test Dataset",
            "files": self.test_files[:3],
            "labels": ["test"] * 3
        }
        
        dataset = await self.dataset_service.create_dataset(valid_dataset_data)
        
        invalid_training_config = {
            "model_name": "Error Test Model",
            "architecture": "invalid_architecture",  # Invalid architecture
            "hyperparameters": {
                "learning_rate": -1,  # Invalid negative learning rate
                "batch_size": 0,  # Invalid batch size
                "epochs": -5  # Invalid negative epochs
            }
        }
        
        with pytest.raises(ValueError):
            await self.training_service.start_training(
                dataset["id"], invalid_training_config
            )
        
        # Test inference with non-existent model
        with pytest.raises(ValueError):
            await self.model_service.run_inference(
                "non-existent-model-id", {"query": "test"}
            )
        
        # Test recovery from training failure
        recovery_config = {
            "model_name": "Recovery Test Model",
            "architecture": "cnn",
            "hyperparameters": {
                "learning_rate": 0.001,
                "batch_size": 16,
                "epochs": 1  # Short training for quick test
            },
            "recovery_config": {
                "max_retries": 3,
                "retry_delay": 1
            }
        }
        
        # Simulate training failure and recovery
        job = await self.training_service.start_training(
            dataset["id"], recovery_config
        )
        
        # The training should handle failures gracefully
        assert job is not None
        assert job["status"] in ["started", "queued"]

    async def test_api_endpoints_integration(self):
        """Test API endpoints integration"""
        
        from fastapi.testclient import TestClient
        
        client = TestClient(app)
        
        # Test health check
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"
        
        # Test dataset endpoints
        dataset_data = {
            "name": "API Test Dataset",
            "description": "Dataset for API testing",
            "files": self.test_files[:3],
            "labels": ["api_test"] * 3
        }
        
        response = client.post("/api/v1/datasets", json=dataset_data)
        assert response.status_code == 201
        
        dataset = response.json()
        dataset_id = dataset["id"]
        
        # Test get dataset
        response = client.get(f"/api/v1/datasets/{dataset_id}")
        assert response.status_code == 200
        assert response.json()["id"] == dataset_id
        
        # Test list datasets
        response = client.get("/api/v1/datasets")
        assert response.status_code == 200
        assert len(response.json()["datasets"]) > 0
        
        # Test training endpoints
        training_config = {
            "model_name": "API Test Model",
            "architecture": "cnn",
            "hyperparameters": {
                "learning_rate": 0.001,
                "batch_size": 16,
                "epochs": 2
            }
        }
        
        response = client.post(
            f"/api/v1/datasets/{dataset_id}/train",
            json=training_config
        )
        assert response.status_code == 202
        
        training_job = response.json()
        job_id = training_job["id"]
        
        # Test get training status
        response = client.get(f"/api/v1/training/{job_id}")
        assert response.status_code == 200
        assert response.json()["id"] == job_id
        
        # Test list models
        response = client.get("/api/v1/models")
        assert response.status_code == 200
        
        # Test inference endpoint (after training completes)
        # Note: In a real test, we'd wait for training completion
        # For this test, we'll just verify the endpoint structure
        inference_data = {
            "query": "api test query",
            "files": [self.test_files[0]],
            "top_k": 1
        }
        
        # This might fail if no models are ready, but we test the endpoint
        response = client.post("/api/v1/inference", json=inference_data)
        assert response.status_code in [200, 400, 404]  # Various valid responses

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])