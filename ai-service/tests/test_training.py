"""
Unit tests for training functionality.
"""

import pytest
import torch
import numpy as np
from unittest.mock import Mock, patch, AsyncMock
from datetime import datetime

from src.ml.models.cnn_model import CADFeatureExtractorCNN, CADSiameseNetwork, create_cad_model
from src.ml.training.trainer import CADModelTrainer
from src.ml.data.dataset import CADDataset, CADSiameseDataset
from src.ml.data.transforms import get_training_transforms, get_validation_transforms


class TestCADModels:
    """Test CAD model architectures."""
    
    def test_cad_feature_extractor_creation(self):
        """Test CAD feature extractor model creation."""
        model = CADFeatureExtractorCNN(
            input_channels=3,
            num_classes=10,
            feature_dim=512,
            dropout_rate=0.5,
        )
        
        assert model.input_channels == 3
        assert model.num_classes == 10
        assert model.feature_dim == 512
        assert model.dropout_rate == 0.5
    
    def test_cad_feature_extractor_forward(self):
        """Test forward pass of CAD feature extractor."""
        model = CADFeatureExtractorCNN(
            input_channels=3,
            num_classes=10,
            feature_dim=512,
        )
        
        # Test input
        batch_size = 4
        input_tensor = torch.randn(batch_size, 3, 224, 224)
        
        # Forward pass
        output = model(input_tensor)
        
        assert output.shape == (batch_size, 10)
        
        # Test feature extraction
        features = model.extract_features(input_tensor)
        assert features.shape == (batch_size, 512)
    
    def test_cad_siamese_network(self):
        """Test CAD Siamese network."""
        base_model = CADFeatureExtractorCNN(
            input_channels=3,
            num_classes=10,
            feature_dim=512,
        )
        
        siamese_model = CADSiameseNetwork(
            feature_extractor=base_model,
            similarity_dim=128,
        )
        
        # Test input
        batch_size = 4
        input1 = torch.randn(batch_size, 3, 224, 224)
        input2 = torch.randn(batch_size, 3, 224, 224)
        
        # Forward pass
        output1, output2, similarity = siamese_model(input1, input2)
        
        assert output1.shape == (batch_size, 128)
        assert output2.shape == (batch_size, 128)
        assert similarity.shape == (batch_size,)
        
        # Test similarity computation
        similarity_direct = siamese_model.compute_similarity(input1, input2)
        assert torch.allclose(similarity, similarity_direct)
    
    def test_create_cad_model_factory(self):
        """Test model factory function."""
        # Test CNN model creation
        cnn_config = {
            "model_type": "cnn",
            "input_channels": 3,
            "num_classes": 10,
            "feature_dim": 512,
        }
        
        cnn_model = create_cad_model(cnn_config)
        assert isinstance(cnn_model, CADFeatureExtractorCNN)
        
        # Test Siamese model creation
        siamese_config = {
            "model_type": "siamese",
            "input_channels": 3,
            "num_classes": 10,
            "feature_dim": 512,
            "similarity_dim": 128,
        }
        
        siamese_model = create_cad_model(siamese_config)
        assert isinstance(siamese_model, CADSiameseNetwork)
        
        # Test invalid model type
        with pytest.raises(ValueError):
            create_cad_model({"model_type": "invalid"})


class TestDataTransforms:
    """Test data transforms and augmentation."""
    
    def test_training_transforms(self):
        """Test training transforms creation."""
        transforms = get_training_transforms(
            input_size=224,
            augmentation_config={
                "enable_rotation": True,
                "enable_flip": True,
                "rotation_degrees": 15,
                "flip_probability": 0.5,
            }
        )
        
        assert transforms is not None
        
        # Test with PIL image
        from PIL import Image
        test_image = Image.new('RGB', (256, 256), color='white')
        
        transformed = transforms(test_image)
        assert isinstance(transformed, torch.Tensor)
        assert transformed.shape == (3, 224, 224)
    
    def test_validation_transforms(self):
        """Test validation transforms creation."""
        transforms = get_validation_transforms(input_size=224)
        
        assert transforms is not None
        
        # Test with PIL image
        from PIL import Image
        test_image = Image.new('RGB', (256, 256), color='white')
        
        transformed = transforms(test_image)
        assert isinstance(transformed, torch.Tensor)
        assert transformed.shape == (3, 224, 224)


class TestCADDataset:
    """Test CAD dataset functionality."""
    
    @patch('src.ml.data.dataset.Image.open')
    @patch('os.path.exists')
    def test_cad_dataset_creation(self, mock_exists, mock_image_open):
        """Test CAD dataset creation."""
        # Mock file existence and image loading
        mock_exists.return_value = True
        mock_image = Mock()
        mock_image.mode = 'RGB'
        mock_image_open.return_value = mock_image
        
        file_ids = ['file1.jpg', 'file2.jpg', 'file3.jpg']
        labels = {'file1.jpg': 0, 'file2.jpg': 1, 'file3.jpg': 0}
        
        dataset = CADDataset(
            file_ids=file_ids,
            labels=labels,
            transform=None,
        )
        
        assert len(dataset) == 3
        assert dataset.valid_files == file_ids
    
    @patch('src.ml.data.dataset.Image.open')
    @patch('os.path.exists')
    def test_cad_dataset_getitem(self, mock_exists, mock_image_open):
        """Test CAD dataset item retrieval."""
        # Mock file existence and image loading
        mock_exists.return_value = True
        mock_image = Mock()
        mock_image.mode = 'RGB'
        mock_image_open.return_value = mock_image
        
        file_ids = ['file1.jpg', 'file2.jpg']
        labels = {'file1.jpg': 0, 'file2.jpg': 1}
        
        dataset = CADDataset(
            file_ids=file_ids,
            labels=labels,
            transform=None,
        )
        
        # Test item retrieval
        image, label = dataset[0]
        assert label == 0
    
    def test_cad_dataset_class_distribution(self):
        """Test class distribution calculation."""
        file_ids = ['file1.jpg', 'file2.jpg', 'file3.jpg', 'file4.jpg']
        labels = {'file1.jpg': 0, 'file2.jpg': 1, 'file3.jpg': 0, 'file4.jpg': 2}
        
        dataset = CADDataset(
            file_ids=file_ids,
            labels=labels,
            transform=None,
        )
        
        distribution = dataset.get_class_distribution()
        expected = {0: 2, 1: 1, 2: 1}
        assert distribution == expected


class TestCADSiameseDataset:
    """Test CAD Siamese dataset functionality."""
    
    @patch('src.ml.data.dataset.Image.open')
    @patch('os.path.exists')
    def test_siamese_dataset_creation(self, mock_exists, mock_image_open):
        """Test Siamese dataset creation."""
        # Mock file existence and image loading
        mock_exists.return_value = True
        mock_image = Mock()
        mock_image.mode = 'RGB'
        mock_image_open.return_value = mock_image
        
        file_ids = ['file1.jpg', 'file2.jpg', 'file3.jpg', 'file4.jpg']
        labels = {'file1.jpg': 0, 'file2.jpg': 1, 'file3.jpg': 0, 'file4.jpg': 1}
        
        dataset = CADSiameseDataset(
            file_ids=file_ids,
            labels=labels,
            transform=None,
            positive_ratio=0.5,
        )
        
        assert len(dataset) > 0
        assert len(dataset.pairs) > 0
    
    @patch('src.ml.data.dataset.Image.open')
    @patch('os.path.exists')
    def test_siamese_dataset_getitem(self, mock_exists, mock_image_open):
        """Test Siamese dataset item retrieval."""
        # Mock file existence and image loading
        mock_exists.return_value = True
        mock_image = Mock()
        mock_image.mode = 'RGB'
        mock_image_open.return_value = mock_image
        
        file_ids = ['file1.jpg', 'file2.jpg', 'file3.jpg', 'file4.jpg']
        labels = {'file1.jpg': 0, 'file2.jpg': 1, 'file3.jpg': 0, 'file4.jpg': 1}
        
        dataset = CADSiameseDataset(
            file_ids=file_ids,
            labels=labels,
            transform=None,
            positive_ratio=0.5,
        )
        
        if len(dataset) > 0:
            image1, image2, similarity = dataset[0]
            assert similarity in [0, 1]


class TestCADModelTrainer:
    """Test CAD model trainer functionality."""
    
    def test_trainer_initialization(self):
        """Test trainer initialization."""
        model_config = {
            "model_type": "cnn",
            "input_channels": 3,
            "num_classes": 10,
            "feature_dim": 512,
        }
        
        training_config = {
            "epochs": 10,
            "batch_size": 16,
            "learning_rate": 0.001,
        }
        
        trainer = CADModelTrainer(
            model_config=model_config,
            training_config=training_config,
        )
        
        assert trainer.epochs == 10
        assert trainer.batch_size == 16
        assert trainer.learning_rate == 0.001
        assert trainer.model is not None
        assert trainer.optimizer is not None
    
    @patch('torch.save')
    def test_trainer_save_checkpoint(self, mock_torch_save):
        """Test trainer checkpoint saving."""
        model_config = {
            "model_type": "cnn",
            "input_channels": 3,
            "num_classes": 10,
        }
        
        training_config = {
            "epochs": 10,
            "batch_size": 16,
        }
        
        trainer = CADModelTrainer(
            model_config=model_config,
            training_config=training_config,
        )
        
        trainer.save_checkpoint("test_checkpoint.pth")
        
        # Verify torch.save was called
        mock_torch_save.assert_called_once()
        
        # Check the saved data structure
        saved_data = mock_torch_save.call_args[0][0]
        assert "epoch" in saved_data
        assert "model_state_dict" in saved_data
        assert "optimizer_state_dict" in saved_data
    
    @patch('torch.load')
    def test_trainer_load_checkpoint(self, mock_torch_load):
        """Test trainer checkpoint loading."""
        # Mock checkpoint data
        mock_checkpoint = {
            "epoch": 5,
            "model_state_dict": {},
            "optimizer_state_dict": {},
            "scheduler_state_dict": {},
            "best_val_loss": 0.5,
            "training_history": {"train_loss": [], "val_loss": []},
        }
        mock_torch_load.return_value = mock_checkpoint
        
        model_config = {
            "model_type": "cnn",
            "input_channels": 3,
            "num_classes": 10,
        }
        
        training_config = {
            "epochs": 10,
            "batch_size": 16,
        }
        
        trainer = CADModelTrainer(
            model_config=model_config,
            training_config=training_config,
        )
        
        trainer.load_checkpoint("test_checkpoint.pth")
        
        assert trainer.current_epoch == 5
        assert trainer.best_val_loss == 0.5


@pytest.mark.asyncio
class TestTrainingTasks:
    """Test training Celery tasks."""
    
    @patch('src.tasks.training_tasks.CADModelTrainer')
    @patch('src.tasks.training_tasks.AsyncSessionLocal')
    async def test_train_cad_model_task_success(self, mock_session, mock_trainer):
        """Test successful training task execution."""
        from src.tasks.training_tasks import train_cad_model_task
        
        # Mock database session
        mock_db = AsyncMock()
        mock_session.return_value.__aenter__.return_value = mock_db
        
        # Mock trainer
        mock_trainer_instance = Mock()
        mock_trainer_instance.train.return_value = {
            "model_path": "/path/to/model.pth",
            "final_train_loss": 0.1,
            "final_val_loss": 0.2,
            "final_val_acc": 0.9,
            "detailed_metrics": {"precision": 0.85, "recall": 0.88, "f1_score": 0.86},
        }
        mock_trainer.return_value = mock_trainer_instance
        
        # Mock dataset service and model service
        with patch('src.tasks.training_tasks.DatasetService') as mock_dataset_service, \
             patch('src.tasks.training_tasks.ModelService') as mock_model_service:
            
            # Mock dataset
            mock_dataset = Mock()
            mock_dataset.status = "ready"
            mock_dataset.name = "Test Dataset"
            mock_dataset_service.return_value.get_dataset.return_value = mock_dataset
            
            # Mock model creation
            mock_model = Mock()
            mock_model.id = "test-model-id"
            mock_model_service.return_value.create_model.return_value = mock_model
            
            # Execute task
            result = train_cad_model_task(
                training_job_id="test-job-id",
                dataset_id="test-dataset-id",
                model_config={"model_type": "cnn"},
                training_config={"epochs": 10},
                user_id="test-user-id",
            )
            
            assert result["success"] is True
            assert result["training_job_id"] == "test-job-id"
            assert "model_id" in result
    
    @patch('src.tasks.training_tasks.AsyncSessionLocal')
    async def test_train_cad_model_task_dataset_not_found(self, mock_session):
        """Test training task with dataset not found."""
        from src.tasks.training_tasks import train_cad_model_task
        
        # Mock database session
        mock_db = AsyncMock()
        mock_session.return_value.__aenter__.return_value = mock_db
        
        # Mock dataset service returning None
        with patch('src.tasks.training_tasks.DatasetService') as mock_dataset_service:
            mock_dataset_service.return_value.get_dataset.return_value = None
            
            # Execute task
            result = train_cad_model_task(
                training_job_id="test-job-id",
                dataset_id="nonexistent-dataset-id",
                model_config={"model_type": "cnn"},
                training_config={"epochs": 10},
                user_id="test-user-id",
            )
            
            assert result["success"] is False
            assert "Dataset" in result["error"]


if __name__ == "__main__":
    pytest.main([__file__])