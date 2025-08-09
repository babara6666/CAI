"""
Training pipeline for CAD AI models with data preprocessing and augmentation.
"""

import os
import time
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from typing import Dict, Any, Optional, Callable, Tuple
import numpy as np
from sklearn.metrics import accuracy_score, precision_recall_fscore_support
import logging

from src.ml.models.cnn_model import create_cad_model
from src.ml.data.dataset import CADDataset
from src.ml.data.transforms import get_training_transforms, get_validation_transforms
from src.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class CADModelTrainer:
    """
    Trainer class for CAD AI models with comprehensive training pipeline.
    """
    
    def __init__(
        self,
        model_config: Dict[str, Any],
        training_config: Dict[str, Any],
        progress_callback: Optional[Callable] = None,
    ):
        self.model_config = model_config
        self.training_config = training_config
        self.progress_callback = progress_callback
        
        # Training parameters
        self.epochs = training_config.get("epochs", 100)
        self.batch_size = training_config.get("batch_size", 32)
        self.learning_rate = training_config.get("learning_rate", 0.001)
        self.weight_decay = training_config.get("weight_decay", 1e-4)
        self.patience = training_config.get("patience", 10)
        
        # Device configuration
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"Using device: {self.device}")
        
        # Initialize model
        self.model = create_cad_model(model_config).to(self.device)
        
        # Initialize optimizer and scheduler
        self.optimizer = optim.Adam(
            self.model.parameters(),
            lr=self.learning_rate,
            weight_decay=self.weight_decay,
        )
        
        self.scheduler = optim.lr_scheduler.ReduceLROnPlateau(
            self.optimizer,
            mode="min",
            factor=0.5,
            patience=5,
            verbose=True,
        )
        
        # Loss function
        self.criterion = nn.CrossEntropyLoss()
        
        # Training state
        self.current_epoch = 0
        self.best_val_loss = float("inf")
        self.best_model_state = None
        self.training_history = {
            "train_loss": [],
            "val_loss": [],
            "train_acc": [],
            "val_acc": [],
            "learning_rate": [],
        }
        
        # Early stopping
        self.early_stopping_counter = 0
        self.should_stop = False
    
    def prepare_data(self, dataset_config: Dict[str, Any]) -> Tuple[DataLoader, DataLoader]:
        """
        Prepare training and validation data loaders.
        
        Args:
            dataset_config: Dataset configuration
            
        Returns:
            Tuple of (train_loader, val_loader)
        """
        # Get transforms
        train_transforms = get_training_transforms(
            input_size=self.model_config.get("input_size", 224),
            augmentation_config=dataset_config.get("augmentation", {}),
        )
        
        val_transforms = get_validation_transforms(
            input_size=self.model_config.get("input_size", 224),
        )
        
        # Create datasets
        train_dataset = CADDataset(
            file_ids=dataset_config["train_files"],
            labels=dataset_config["train_labels"],
            transform=train_transforms,
        )
        
        val_dataset = CADDataset(
            file_ids=dataset_config["val_files"],
            labels=dataset_config["val_labels"],
            transform=val_transforms,
        )
        
        # Create data loaders
        train_loader = DataLoader(
            train_dataset,
            batch_size=self.batch_size,
            shuffle=True,
            num_workers=4,
            pin_memory=True,
        )
        
        val_loader = DataLoader(
            val_dataset,
            batch_size=self.batch_size,
            shuffle=False,
            num_workers=4,
            pin_memory=True,
        )
        
        logger.info(f"Training samples: {len(train_dataset)}")
        logger.info(f"Validation samples: {len(val_dataset)}")
        
        return train_loader, val_loader
    
    def train_epoch(self, train_loader: DataLoader) -> Tuple[float, float]:
        """
        Train for one epoch.
        
        Args:
            train_loader: Training data loader
            
        Returns:
            Tuple of (average_loss, accuracy)
        """
        self.model.train()
        total_loss = 0.0
        all_predictions = []
        all_targets = []
        
        for batch_idx, (data, target) in enumerate(train_loader):
            data, target = data.to(self.device), target.to(self.device)
            
            # Zero gradients
            self.optimizer.zero_grad()
            
            # Forward pass
            output = self.model(data)
            loss = self.criterion(output, target)
            
            # Backward pass
            loss.backward()
            self.optimizer.step()
            
            # Track metrics
            total_loss += loss.item()
            predictions = output.argmax(dim=1).cpu().numpy()
            all_predictions.extend(predictions)
            all_targets.extend(target.cpu().numpy())
            
            # Progress callback
            if self.progress_callback and batch_idx % 10 == 0:
                progress = (batch_idx / len(train_loader)) * 100
                self.progress_callback({
                    "epoch": self.current_epoch,
                    "batch": batch_idx,
                    "batch_progress": progress,
                    "loss": loss.item(),
                })
        
        avg_loss = total_loss / len(train_loader)
        accuracy = accuracy_score(all_targets, all_predictions)
        
        return avg_loss, accuracy
    
    def validate_epoch(self, val_loader: DataLoader) -> Tuple[float, float, Dict[str, float]]:
        """
        Validate for one epoch.
        
        Args:
            val_loader: Validation data loader
            
        Returns:
            Tuple of (average_loss, accuracy, detailed_metrics)
        """
        self.model.eval()
        total_loss = 0.0
        all_predictions = []
        all_targets = []
        
        with torch.no_grad():
            for data, target in val_loader:
                data, target = data.to(self.device), target.to(self.device)
                
                # Forward pass
                output = self.model(data)
                loss = self.criterion(output, target)
                
                # Track metrics
                total_loss += loss.item()
                predictions = output.argmax(dim=1).cpu().numpy()
                all_predictions.extend(predictions)
                all_targets.extend(target.cpu().numpy())
        
        avg_loss = total_loss / len(val_loader)
        accuracy = accuracy_score(all_targets, all_predictions)
        
        # Detailed metrics
        precision, recall, f1, _ = precision_recall_fscore_support(
            all_targets, all_predictions, average="weighted", zero_division=0
        )
        
        detailed_metrics = {
            "precision": precision,
            "recall": recall,
            "f1_score": f1,
        }
        
        return avg_loss, accuracy, detailed_metrics
    
    def save_checkpoint(self, filepath: str, is_best: bool = False):
        """Save model checkpoint."""
        checkpoint = {
            "epoch": self.current_epoch,
            "model_state_dict": self.model.state_dict(),
            "optimizer_state_dict": self.optimizer.state_dict(),
            "scheduler_state_dict": self.scheduler.state_dict(),
            "best_val_loss": self.best_val_loss,
            "training_history": self.training_history,
            "model_config": self.model_config,
            "training_config": self.training_config,
        }
        
        torch.save(checkpoint, filepath)
        
        if is_best:
            best_filepath = filepath.replace(".pth", "_best.pth")
            torch.save(checkpoint, best_filepath)
    
    def load_checkpoint(self, filepath: str):
        """Load model checkpoint."""
        checkpoint = torch.load(filepath, map_location=self.device)
        
        self.model.load_state_dict(checkpoint["model_state_dict"])
        self.optimizer.load_state_dict(checkpoint["optimizer_state_dict"])
        self.scheduler.load_state_dict(checkpoint["scheduler_state_dict"])
        self.current_epoch = checkpoint["epoch"]
        self.best_val_loss = checkpoint["best_val_loss"]
        self.training_history = checkpoint["training_history"]
    
    def train(self, dataset_config: Dict[str, Any], save_dir: str) -> Dict[str, Any]:
        """
        Main training loop.
        
        Args:
            dataset_config: Dataset configuration
            save_dir: Directory to save model checkpoints
            
        Returns:
            Training results and metrics
        """
        logger.info("Starting training...")
        start_time = time.time()
        
        # Prepare data
        train_loader, val_loader = self.prepare_data(dataset_config)
        
        # Create save directory
        os.makedirs(save_dir, exist_ok=True)
        
        # Training loop
        for epoch in range(self.epochs):
            self.current_epoch = epoch
            
            # Train epoch
            train_loss, train_acc = self.train_epoch(train_loader)
            
            # Validate epoch
            val_loss, val_acc, detailed_metrics = self.validate_epoch(val_loader)
            
            # Update learning rate
            self.scheduler.step(val_loss)
            current_lr = self.optimizer.param_groups[0]["lr"]
            
            # Update history
            self.training_history["train_loss"].append(train_loss)
            self.training_history["val_loss"].append(val_loss)
            self.training_history["train_acc"].append(train_acc)
            self.training_history["val_acc"].append(val_acc)
            self.training_history["learning_rate"].append(current_lr)
            
            # Check for best model
            is_best = val_loss < self.best_val_loss
            if is_best:
                self.best_val_loss = val_loss
                self.best_model_state = self.model.state_dict().copy()
                self.early_stopping_counter = 0
            else:
                self.early_stopping_counter += 1
            
            # Save checkpoint
            checkpoint_path = os.path.join(save_dir, f"checkpoint_epoch_{epoch}.pth")
            self.save_checkpoint(checkpoint_path, is_best)
            
            # Progress callback
            if self.progress_callback:
                progress = ((epoch + 1) / self.epochs) * 100
                self.progress_callback({
                    "epoch": epoch,
                    "total_epochs": self.epochs,
                    "progress": progress,
                    "train_loss": train_loss,
                    "val_loss": val_loss,
                    "train_acc": train_acc,
                    "val_acc": val_acc,
                    "learning_rate": current_lr,
                    "detailed_metrics": detailed_metrics,
                })
            
            logger.info(
                f"Epoch {epoch}/{self.epochs} - "
                f"Train Loss: {train_loss:.4f}, Train Acc: {train_acc:.4f}, "
                f"Val Loss: {val_loss:.4f}, Val Acc: {val_acc:.4f}, "
                f"LR: {current_lr:.6f}"
            )
            
            # Early stopping
            if self.early_stopping_counter >= self.patience:
                logger.info(f"Early stopping triggered after {epoch + 1} epochs")
                break
        
        # Load best model
        if self.best_model_state is not None:
            self.model.load_state_dict(self.best_model_state)
        
        # Save final model
        final_model_path = os.path.join(save_dir, "final_model.pth")
        torch.save({
            "model_state_dict": self.model.state_dict(),
            "model_config": self.model_config,
            "training_config": self.training_config,
            "training_history": self.training_history,
        }, final_model_path)
        
        training_time = time.time() - start_time
        
        # Final evaluation
        final_val_loss, final_val_acc, final_metrics = self.validate_epoch(val_loader)
        
        results = {
            "training_time": training_time,
            "final_train_loss": self.training_history["train_loss"][-1],
            "final_val_loss": final_val_loss,
            "final_train_acc": self.training_history["train_acc"][-1],
            "final_val_acc": final_val_acc,
            "best_val_loss": self.best_val_loss,
            "epochs_trained": self.current_epoch + 1,
            "model_path": final_model_path,
            "detailed_metrics": final_metrics,
            "training_history": self.training_history,
        }
        
        logger.info(f"Training completed in {training_time:.2f} seconds")
        logger.info(f"Best validation loss: {self.best_val_loss:.4f}")
        logger.info(f"Final validation accuracy: {final_val_acc:.4f}")
        
        return results