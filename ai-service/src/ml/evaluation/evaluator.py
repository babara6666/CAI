"""
Model evaluation and performance assessment tools.
"""

import torch
import torch.nn as nn
import numpy as np
from typing import Dict, Any, List, Tuple, Optional
from sklearn.metrics import (
    accuracy_score, precision_recall_fscore_support,
    confusion_matrix, classification_report,
    roc_auc_score, average_precision_score
)
import matplotlib.pyplot as plt
import seaborn as sns
from torch.utils.data import DataLoader
import logging

logger = logging.getLogger(__name__)


class ModelEvaluator:
    """
    Comprehensive model evaluation and performance assessment.
    """
    
    def __init__(self, model: nn.Module, device: torch.device):
        self.model = model
        self.device = device
        self.model.eval()
    
    def evaluate_classification(
        self,
        test_loader: DataLoader,
        class_names: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Evaluate classification model performance.
        
        Args:
            test_loader: Test data loader
            class_names: Optional list of class names
            
        Returns:
            Comprehensive evaluation metrics
        """
        all_predictions = []
        all_targets = []
        all_probabilities = []
        
        with torch.no_grad():
            for data, target in test_loader:
                data, target = data.to(self.device), target.to(self.device)
                
                # Forward pass
                output = self.model(data)
                probabilities = torch.softmax(output, dim=1)
                predictions = output.argmax(dim=1)
                
                all_predictions.extend(predictions.cpu().numpy())
                all_targets.extend(target.cpu().numpy())
                all_probabilities.extend(probabilities.cpu().numpy())
        
        all_predictions = np.array(all_predictions)
        all_targets = np.array(all_targets)
        all_probabilities = np.array(all_probabilities)
        
        # Calculate metrics
        accuracy = accuracy_score(all_targets, all_predictions)
        precision, recall, f1, support = precision_recall_fscore_support(
            all_targets, all_predictions, average=None, zero_division=0
        )
        
        # Weighted averages
        precision_weighted, recall_weighted, f1_weighted, _ = precision_recall_fscore_support(
            all_targets, all_predictions, average='weighted', zero_division=0
        )
        
        # Confusion matrix
        cm = confusion_matrix(all_targets, all_predictions)
        
        # Classification report
        if class_names:
            target_names = class_names
        else:
            target_names = [f"Class_{i}" for i in range(len(np.unique(all_targets)))]
        
        class_report = classification_report(
            all_targets, all_predictions,
            target_names=target_names,
            output_dict=True,
            zero_division=0
        )
        
        # Per-class metrics
        per_class_metrics = {}
        for i, class_name in enumerate(target_names):
            if i < len(precision):
                per_class_metrics[class_name] = {
                    "precision": float(precision[i]),
                    "recall": float(recall[i]),
                    "f1_score": float(f1[i]),
                    "support": int(support[i]),
                }
        
        # ROC AUC for multi-class (if applicable)
        try:
            if len(np.unique(all_targets)) > 2:
                roc_auc = roc_auc_score(
                    all_targets, all_probabilities,
                    multi_class='ovr', average='weighted'
                )
            else:
                roc_auc = roc_auc_score(all_targets, all_probabilities[:, 1])
        except Exception:
            roc_auc = None
        
        # Average precision
        try:
            if len(np.unique(all_targets)) > 2:
                avg_precision = average_precision_score(
                    all_targets, all_probabilities,
                    average='weighted'
                )
            else:
                avg_precision = average_precision_score(all_targets, all_probabilities[:, 1])
        except Exception:
            avg_precision = None
        
        return {
            "accuracy": float(accuracy),
            "precision_weighted": float(precision_weighted),
            "recall_weighted": float(recall_weighted),
            "f1_weighted": float(f1_weighted),
            "roc_auc": float(roc_auc) if roc_auc is not None else None,
            "average_precision": float(avg_precision) if avg_precision is not None else None,
            "confusion_matrix": cm.tolist(),
            "per_class_metrics": per_class_metrics,
            "classification_report": class_report,
            "num_samples": len(all_targets),
            "num_classes": len(np.unique(all_targets)),
        }
    
    def evaluate_similarity(
        self,
        test_pairs: List[Tuple[torch.Tensor, torch.Tensor, int]],
        threshold: float = 0.5,
    ) -> Dict[str, Any]:
        """
        Evaluate similarity model performance.
        
        Args:
            test_pairs: List of (image1, image2, similarity_label) tuples
            threshold: Similarity threshold for binary classification
            
        Returns:
            Similarity evaluation metrics
        """
        all_similarities = []
        all_labels = []
        
        with torch.no_grad():
            for img1, img2, label in test_pairs:
                img1 = img1.unsqueeze(0).to(self.device)
                img2 = img2.unsqueeze(0).to(self.device)
                
                # Compute similarity
                if hasattr(self.model, 'compute_similarity'):
                    similarity = self.model.compute_similarity(img1, img2)
                else:
                    # Fallback: compute cosine similarity of features
                    feat1 = self.model.extract_features(img1)
                    feat2 = self.model.extract_features(img2)
                    similarity = torch.cosine_similarity(feat1, feat2, dim=1)
                
                all_similarities.append(similarity.cpu().item())
                all_labels.append(label)
        
        all_similarities = np.array(all_similarities)
        all_labels = np.array(all_labels)
        
        # Binary classification metrics
        predictions = (all_similarities > threshold).astype(int)
        accuracy = accuracy_score(all_labels, predictions)
        precision, recall, f1, _ = precision_recall_fscore_support(
            all_labels, predictions, average='binary', zero_division=0
        )
        
        # ROC AUC
        try:
            roc_auc = roc_auc_score(all_labels, all_similarities)
        except Exception:
            roc_auc = None
        
        # Average precision
        try:
            avg_precision = average_precision_score(all_labels, all_similarities)
        except Exception:
            avg_precision = None
        
        # Correlation analysis
        correlation = np.corrcoef(all_similarities, all_labels)[0, 1]
        
        return {
            "accuracy": float(accuracy),
            "precision": float(precision),
            "recall": float(recall),
            "f1_score": float(f1),
            "roc_auc": float(roc_auc) if roc_auc is not None else None,
            "average_precision": float(avg_precision) if avg_precision is not None else None,
            "correlation": float(correlation) if not np.isnan(correlation) else None,
            "threshold": threshold,
            "num_pairs": len(test_pairs),
            "similarity_stats": {
                "mean": float(np.mean(all_similarities)),
                "std": float(np.std(all_similarities)),
                "min": float(np.min(all_similarities)),
                "max": float(np.max(all_similarities)),
            }
        }
    
    def compute_feature_statistics(
        self,
        data_loader: DataLoader,
    ) -> Dict[str, Any]:
        """
        Compute statistics of extracted features.
        
        Args:
            data_loader: Data loader for feature extraction
            
        Returns:
            Feature statistics
        """
        all_features = []
        
        with torch.no_grad():
            for data, _ in data_loader:
                data = data.to(self.device)
                features = self.model.extract_features(data)
                all_features.append(features.cpu().numpy())
        
        all_features = np.concatenate(all_features, axis=0)
        
        # Compute statistics
        feature_stats = {
            "num_samples": all_features.shape[0],
            "feature_dimension": all_features.shape[1],
            "mean": np.mean(all_features, axis=0).tolist(),
            "std": np.std(all_features, axis=0).tolist(),
            "min": np.min(all_features, axis=0).tolist(),
            "max": np.max(all_features, axis=0).tolist(),
            "global_stats": {
                "mean": float(np.mean(all_features)),
                "std": float(np.std(all_features)),
                "min": float(np.min(all_features)),
                "max": float(np.max(all_features)),
            }
        }
        
        # Compute feature correlations (sample if too large)
        if all_features.shape[1] <= 100:
            correlation_matrix = np.corrcoef(all_features.T)
            feature_stats["correlation_matrix"] = correlation_matrix.tolist()
        
        return feature_stats
    
    def generate_evaluation_report(
        self,
        test_loader: DataLoader,
        class_names: Optional[List[str]] = None,
        save_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate comprehensive evaluation report.
        
        Args:
            test_loader: Test data loader
            class_names: Optional list of class names
            save_path: Optional path to save visualizations
            
        Returns:
            Complete evaluation report
        """
        logger.info("Generating evaluation report...")
        
        # Classification evaluation
        classification_metrics = self.evaluate_classification(test_loader, class_names)
        
        # Feature statistics
        feature_stats = self.compute_feature_statistics(test_loader)
        
        # Model complexity
        model_complexity = self._compute_model_complexity()
        
        # Inference speed
        inference_speed = self._measure_inference_speed(test_loader)
        
        report = {
            "classification_metrics": classification_metrics,
            "feature_statistics": feature_stats,
            "model_complexity": model_complexity,
            "inference_speed": inference_speed,
            "evaluation_timestamp": torch.utils.data.get_worker_info(),
        }
        
        # Generate visualizations if save path provided
        if save_path:
            self._generate_visualizations(report, save_path)
        
        logger.info("Evaluation report generated successfully")
        return report
    
    def _compute_model_complexity(self) -> Dict[str, Any]:
        """Compute model complexity metrics."""
        total_params = sum(p.numel() for p in self.model.parameters())
        trainable_params = sum(p.numel() for p in self.model.parameters() if p.requires_grad)
        
        # Estimate model size in MB
        param_size = sum(p.numel() * p.element_size() for p in self.model.parameters())
        buffer_size = sum(b.numel() * b.element_size() for b in self.model.buffers())
        model_size_mb = (param_size + buffer_size) / (1024 * 1024)
        
        return {
            "total_parameters": total_params,
            "trainable_parameters": trainable_params,
            "model_size_mb": float(model_size_mb),
            "parameter_efficiency": float(trainable_params / total_params) if total_params > 0 else 0,
        }
    
    def _measure_inference_speed(self, test_loader: DataLoader, num_batches: int = 10) -> Dict[str, Any]:
        """Measure model inference speed."""
        import time
        
        times = []
        batch_sizes = []
        
        with torch.no_grad():
            for i, (data, _) in enumerate(test_loader):
                if i >= num_batches:
                    break
                
                data = data.to(self.device)
                batch_size = data.size(0)
                
                # Warm up
                if i == 0:
                    _ = self.model(data)
                
                # Measure time
                start_time = time.time()
                _ = self.model(data)
                torch.cuda.synchronize() if torch.cuda.is_available() else None
                end_time = time.time()
                
                times.append(end_time - start_time)
                batch_sizes.append(batch_size)
        
        if times:
            avg_batch_time = np.mean(times)
            avg_batch_size = np.mean(batch_sizes)
            avg_sample_time = avg_batch_time / avg_batch_size
            
            return {
                "avg_batch_time_ms": float(avg_batch_time * 1000),
                "avg_sample_time_ms": float(avg_sample_time * 1000),
                "throughput_samples_per_sec": float(1.0 / avg_sample_time),
                "measured_batches": len(times),
            }
        else:
            return {
                "avg_batch_time_ms": None,
                "avg_sample_time_ms": None,
                "throughput_samples_per_sec": None,
                "measured_batches": 0,
            }
    
    def _generate_visualizations(self, report: Dict[str, Any], save_path: str):
        """Generate evaluation visualizations."""
        import os
        os.makedirs(save_path, exist_ok=True)
        
        # Confusion matrix
        if "confusion_matrix" in report["classification_metrics"]:
            cm = np.array(report["classification_metrics"]["confusion_matrix"])
            
            plt.figure(figsize=(10, 8))
            sns.heatmap(cm, annot=True, fmt='d', cmap='Blues')
            plt.title('Confusion Matrix')
            plt.ylabel('True Label')
            plt.xlabel('Predicted Label')
            plt.savefig(os.path.join(save_path, 'confusion_matrix.png'))
            plt.close()
        
        # Per-class metrics
        if "per_class_metrics" in report["classification_metrics"]:
            metrics_data = report["classification_metrics"]["per_class_metrics"]
            
            classes = list(metrics_data.keys())
            precision = [metrics_data[c]["precision"] for c in classes]
            recall = [metrics_data[c]["recall"] for c in classes]
            f1 = [metrics_data[c]["f1_score"] for c in classes]
            
            x = np.arange(len(classes))
            width = 0.25
            
            plt.figure(figsize=(12, 6))
            plt.bar(x - width, precision, width, label='Precision')
            plt.bar(x, recall, width, label='Recall')
            plt.bar(x + width, f1, width, label='F1-Score')
            
            plt.xlabel('Classes')
            plt.ylabel('Score')
            plt.title('Per-Class Performance Metrics')
            plt.xticks(x, classes, rotation=45)
            plt.legend()
            plt.tight_layout()
            plt.savefig(os.path.join(save_path, 'per_class_metrics.png'))
            plt.close()


def evaluate_model_performance(
    model: nn.Module,
    test_loader: DataLoader,
    device: torch.device,
    class_names: Optional[List[str]] = None,
    save_path: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Convenience function for model evaluation.
    
    Args:
        model: Model to evaluate
        test_loader: Test data loader
        device: Device to run evaluation on
        class_names: Optional list of class names
        save_path: Optional path to save visualizations
        
    Returns:
        Evaluation results
    """
    evaluator = ModelEvaluator(model, device)
    return evaluator.generate_evaluation_report(test_loader, class_names, save_path)