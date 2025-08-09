import { DatasetModel, DatasetCreateData, DatasetFileData, DatasetFilters } from '../models/Dataset.js';
import { CADFileModel } from '../models/CADFile.js';
import { Dataset, DatasetLabel, DatasetStatus, Pagination, QueryOptions } from '../types/index.js';
import { validateDatasetName, validateLabel } from '../validation/datasetValidation.js';
import archiver from 'archiver';
import { Readable } from 'stream';
import fs from 'fs/promises';
import path from 'path';

export interface DatasetValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  statistics: {
    totalFiles: number;
    labeledFiles: number;
    unlabeledFiles: number;
    uniqueLabels: string[];
    averageConfidence: number;
  };
}

export interface DatasetExportOptions {
  format: 'json' | 'csv' | 'coco' | 'yolo';
  includeMetadata: boolean;
  includeImages: boolean;
  splitRatio?: {
    train: number;
    validation: number;
    test: number;
  };
  compressionLevel: number;
}

export interface DatasetQualityMetrics {
  completeness: number; // Percentage of files with labels
  consistency: number; // Label consistency score
  balance: number; // Label distribution balance
  confidence: number; // Average confidence score
  duplicates: number; // Number of duplicate files
}

export class DatasetService {
  /**
   * Create a new dataset with validation
   */
  static async createDataset(
    datasetData: DatasetCreateData,
    userId: string
  ): Promise<Dataset> {
    try {
      // Validate dataset name uniqueness
      const existingDatasets = await DatasetModel.findByUser(userId);
      const existingNames = existingDatasets.datasets.map(d => d.name);
      
      const nameValidation = validateDatasetName(datasetData.name, existingNames);
      if (!nameValidation.isValid) {
        throw new Error(nameValidation.error);
      }

      // Create dataset with sanitized name
      const createData: DatasetCreateData = {
        ...datasetData,
        name: nameValidation.sanitizedName!,
        createdBy: userId
      };

      const dataset = await DatasetModel.create(createData);
      
      // Log dataset creation
      console.log(`Dataset created: ${dataset.id} by user ${userId}`);
      
      return dataset;
    } catch (error) {
      console.error('Error creating dataset:', error);
      throw error;
    }
  }

  /**
   * Add files to dataset with validation
   */
  static async addFilesToDataset(
    datasetId: string,
    fileIds: string[],
    userId: string
  ): Promise<DatasetLabel[]> {
    try {
      // Verify dataset exists and user has access
      const dataset = await DatasetModel.findById(datasetId);
      if (!dataset) {
        throw new Error('Dataset not found');
      }

      if (dataset.createdBy !== userId) {
        throw new Error('Access denied: You can only modify your own datasets');
      }

      if (dataset.status === 'training') {
        throw new Error('Cannot modify dataset while training is in progress');
      }

      // Verify all files exist and user has access
      const validFileIds: string[] = [];
      for (const fileId of fileIds) {
        const file = await CADFileModel.findById(fileId);
        if (!file) {
          console.warn(`File not found: ${fileId}`);
          continue;
        }
        
        if (file.uploadedBy !== userId) {
          console.warn(`Access denied for file: ${fileId}`);
          continue;
        }
        
        validFileIds.push(fileId);
      }

      if (validFileIds.length === 0) {
        throw new Error('No valid files to add to dataset');
      }

      // Add files to dataset
      const labels = await DatasetModel.addFiles(datasetId, validFileIds, userId);
      
      // Update dataset status to ready if it was creating
      if (dataset.status === 'creating') {
        await DatasetModel.markAsReady(datasetId);
      }

      console.log(`Added ${labels.length} files to dataset ${datasetId}`);
      
      return labels;
    } catch (error) {
      console.error('Error adding files to dataset:', error);
      throw error;
    }
  }

  /**
   * Remove file from dataset
   */
  static async removeFileFromDataset(
    datasetId: string,
    fileId: string,
    userId: string
  ): Promise<boolean> {
    try {
      // Verify dataset exists and user has access
      const dataset = await DatasetModel.findById(datasetId);
      if (!dataset) {
        throw new Error('Dataset not found');
      }

      if (dataset.createdBy !== userId) {
        throw new Error('Access denied: You can only modify your own datasets');
      }

      if (dataset.status === 'training') {
        throw new Error('Cannot modify dataset while training is in progress');
      }

      const success = await DatasetModel.removeFile(datasetId, fileId);
      
      if (success) {
        console.log(`Removed file ${fileId} from dataset ${datasetId}`);
      }
      
      return success;
    } catch (error) {
      console.error('Error removing file from dataset:', error);
      throw error;
    }
  }

  /**
   * Update file label in dataset
   */
  static async updateFileLabel(
    datasetId: string,
    fileId: string,
    label: string,
    confidence: number | undefined,
    userId: string
  ): Promise<DatasetLabel | null> {
    try {
      // Verify dataset exists and user has access
      const dataset = await DatasetModel.findById(datasetId);
      if (!dataset) {
        throw new Error('Dataset not found');
      }

      if (dataset.createdBy !== userId) {
        throw new Error('Access denied: You can only modify your own datasets');
      }

      // Validate label
      const labelValidation = validateLabel(label);
      if (!labelValidation.isValid) {
        throw new Error(labelValidation.error);
      }

      const updatedLabel = await DatasetModel.updateFileLabel(
        datasetId,
        fileId,
        labelValidation.sanitizedLabel!,
        confidence
      );

      if (updatedLabel) {
        console.log(`Updated label for file ${fileId} in dataset ${datasetId}`);
      }

      return updatedLabel;
    } catch (error) {
      console.error('Error updating file label:', error);
      throw error;
    }
  }

  /**
   * Batch update file labels
   */
  static async batchUpdateLabels(
    datasetId: string,
    updates: Array<{ fileId: string; label: string; confidence?: number }>,
    userId: string
  ): Promise<DatasetLabel[]> {
    try {
      // Verify dataset exists and user has access
      const dataset = await DatasetModel.findById(datasetId);
      if (!dataset) {
        throw new Error('Dataset not found');
      }

      if (dataset.createdBy !== userId) {
        throw new Error('Access denied: You can only modify your own datasets');
      }

      const updatedLabels: DatasetLabel[] = [];
      const errors: string[] = [];

      for (const update of updates) {
        try {
          const labelValidation = validateLabel(update.label);
          if (!labelValidation.isValid) {
            errors.push(`File ${update.fileId}: ${labelValidation.error}`);
            continue;
          }

          const updatedLabel = await DatasetModel.updateFileLabel(
            datasetId,
            update.fileId,
            labelValidation.sanitizedLabel!,
            update.confidence
          );

          if (updatedLabel) {
            updatedLabels.push(updatedLabel);
          }
        } catch (error) {
          errors.push(`File ${update.fileId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      if (errors.length > 0) {
        console.warn(`Batch update errors for dataset ${datasetId}:`, errors);
      }

      console.log(`Batch updated ${updatedLabels.length} labels in dataset ${datasetId}`);
      
      return updatedLabels;
    } catch (error) {
      console.error('Error batch updating labels:', error);
      throw error;
    }
  }

  /**
   * Validate dataset quality and completeness
   */
  static async validateDataset(datasetId: string, userId: string): Promise<DatasetValidationResult> {
    try {
      // Verify dataset exists and user has access
      const dataset = await DatasetModel.findById(datasetId);
      if (!dataset) {
        throw new Error('Dataset not found');
      }

      if (dataset.createdBy !== userId) {
        throw new Error('Access denied: You can only validate your own datasets');
      }

      const files = await DatasetModel.getDatasetFiles(datasetId);
      const errors: string[] = [];
      const warnings: string[] = [];

      // Basic validation
      if (files.length === 0) {
        errors.push('Dataset contains no files');
      }

      if (files.length < 10) {
        warnings.push('Dataset has fewer than 10 files, which may not be sufficient for training');
      }

      // Label validation
      const labeledFiles = files.filter(f => f.label && f.label.trim().length > 0);
      const unlabeledFiles = files.filter(f => !f.label || f.label.trim().length === 0);

      if (unlabeledFiles.length > 0) {
        warnings.push(`${unlabeledFiles.length} files are missing labels`);
      }

      // Label distribution analysis
      const labelCounts: Record<string, number> = {};
      const confidenceScores: number[] = [];

      labeledFiles.forEach(file => {
        if (file.label) {
          labelCounts[file.label] = (labelCounts[file.label] || 0) + 1;
        }
        if (file.confidence !== undefined) {
          confidenceScores.push(file.confidence);
        }
      });

      const uniqueLabels = Object.keys(labelCounts);
      
      if (uniqueLabels.length < 2) {
        warnings.push('Dataset should have at least 2 different labels for classification tasks');
      }

      // Check for label imbalance
      if (uniqueLabels.length > 1) {
        const counts = Object.values(labelCounts);
        const maxCount = Math.max(...counts);
        const minCount = Math.min(...counts);
        const imbalanceRatio = maxCount / minCount;

        if (imbalanceRatio > 10) {
          warnings.push('Dataset has significant label imbalance (ratio > 10:1)');
        }
      }

      // Calculate average confidence
      const averageConfidence = confidenceScores.length > 0 
        ? confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length
        : 0;

      if (averageConfidence < 0.7 && confidenceScores.length > 0) {
        warnings.push('Average confidence score is below 0.7, consider reviewing labels');
      }

      const statistics = {
        totalFiles: files.length,
        labeledFiles: labeledFiles.length,
        unlabeledFiles: unlabeledFiles.length,
        uniqueLabels,
        averageConfidence
      };

      const isValid = errors.length === 0;

      console.log(`Dataset validation completed for ${datasetId}: ${isValid ? 'VALID' : 'INVALID'}`);

      return {
        isValid,
        errors,
        warnings,
        statistics
      };
    } catch (error) {
      console.error('Error validating dataset:', error);
      throw error;
    }
  }

  /**
   * Calculate dataset quality metrics
   */
  static async calculateQualityMetrics(datasetId: string, userId: string): Promise<DatasetQualityMetrics> {
    try {
      const dataset = await DatasetModel.findById(datasetId);
      if (!dataset) {
        throw new Error('Dataset not found');
      }

      if (dataset.createdBy !== userId) {
        throw new Error('Access denied');
      }

      const files = await DatasetModel.getDatasetFiles(datasetId);
      
      if (files.length === 0) {
        return {
          completeness: 0,
          consistency: 0,
          balance: 0,
          confidence: 0,
          duplicates: 0
        };
      }

      // Completeness: percentage of files with labels
      const labeledFiles = files.filter(f => f.label && f.label.trim().length > 0);
      const completeness = (labeledFiles.length / files.length) * 100;

      // Confidence: average confidence score
      const confidenceScores = files
        .filter(f => f.confidence !== undefined)
        .map(f => f.confidence!);
      const confidence = confidenceScores.length > 0
        ? (confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length) * 100
        : 0;

      // Label distribution for balance calculation
      const labelCounts: Record<string, number> = {};
      labeledFiles.forEach(file => {
        if (file.label) {
          labelCounts[file.label] = (labelCounts[file.label] || 0) + 1;
        }
      });

      // Balance: measure of label distribution evenness
      const counts = Object.values(labelCounts);
      let balance = 0;
      if (counts.length > 1) {
        const totalLabeled = counts.reduce((sum, count) => sum + count, 0);
        const expectedCount = totalLabeled / counts.length;
        const variance = counts.reduce((sum, count) => sum + Math.pow(count - expectedCount, 2), 0) / counts.length;
        const standardDeviation = Math.sqrt(variance);
        balance = Math.max(0, 100 - (standardDeviation / expectedCount) * 100);
      } else if (counts.length === 1) {
        balance = 0; // Single label = no balance
      }

      // Consistency: placeholder for future implementation
      // Could measure label consistency across similar files
      const consistency = 85; // Placeholder value

      // Duplicates: placeholder for future implementation
      // Would require file content comparison
      const duplicates = 0;

      return {
        completeness: Math.round(completeness * 100) / 100,
        consistency: Math.round(consistency * 100) / 100,
        balance: Math.round(balance * 100) / 100,
        confidence: Math.round(confidence * 100) / 100,
        duplicates
      };
    } catch (error) {
      console.error('Error calculating quality metrics:', error);
      throw error;
    }
  }

  /**
   * Export dataset in specified format
   */
  static async exportDataset(
    datasetId: string,
    options: DatasetExportOptions,
    userId: string
  ): Promise<{ stream: Readable; filename: string; mimeType: string }> {
    try {
      const dataset = await DatasetModel.findById(datasetId);
      if (!dataset) {
        throw new Error('Dataset not found');
      }

      if (dataset.createdBy !== userId) {
        throw new Error('Access denied');
      }

      const files = await DatasetModel.getDatasetFiles(datasetId);
      
      if (files.length === 0) {
        throw new Error('Dataset is empty');
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${dataset.name}_${timestamp}.zip`;

      // Create archive stream
      const archive = archiver('zip', {
        zlib: { level: options.compressionLevel }
      });

      // Export based on format
      switch (options.format) {
        case 'json':
          await this.exportAsJSON(archive, dataset, files, options);
          break;
        case 'csv':
          await this.exportAsCSV(archive, dataset, files, options);
          break;
        case 'coco':
          await this.exportAsCOCO(archive, dataset, files, options);
          break;
        case 'yolo':
          await this.exportAsYOLO(archive, dataset, files, options);
          break;
        default:
          throw new Error(`Unsupported export format: ${options.format}`);
      }

      archive.finalize();

      console.log(`Dataset ${datasetId} exported as ${options.format}`);

      return {
        stream: archive,
        filename,
        mimeType: 'application/zip'
      };
    } catch (error) {
      console.error('Error exporting dataset:', error);
      throw error;
    }
  }

  /**
   * Export dataset as JSON format
   */
  private static async exportAsJSON(
    archive: archiver.Archiver,
    dataset: Dataset,
    files: DatasetLabel[],
    options: DatasetExportOptions
  ): Promise<void> {
    const exportData = {
      dataset: {
        id: dataset.id,
        name: dataset.name,
        description: dataset.description,
        createdAt: dataset.createdAt,
        fileCount: dataset.fileCount,
        ...(options.includeMetadata && { tags: dataset.tags })
      },
      files: files.map(file => ({
        fileId: file.fileId,
        label: file.label,
        confidence: file.confidence,
        createdAt: file.createdAt,
        ...(options.includeMetadata && {
          // Additional metadata would be included here
        })
      }))
    };

    archive.append(JSON.stringify(exportData, null, 2), { name: 'dataset.json' });
  }

  /**
   * Export dataset as CSV format
   */
  private static async exportAsCSV(
    archive: archiver.Archiver,
    dataset: Dataset,
    files: DatasetLabel[],
    options: DatasetExportOptions
  ): Promise<void> {
    const headers = ['file_id', 'label', 'confidence', 'created_at'];
    const rows = files.map(file => [
      file.fileId,
      file.label || '',
      file.confidence || '',
      file.createdAt.toISOString()
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    archive.append(csvContent, { name: 'dataset.csv' });
  }

  /**
   * Export dataset as COCO format
   */
  private static async exportAsCOCO(
    archive: archiver.Archiver,
    dataset: Dataset,
    files: DatasetLabel[],
    options: DatasetExportOptions
  ): Promise<void> {
    // COCO format implementation
    const cocoData = {
      info: {
        description: dataset.description || dataset.name,
        version: "1.0",
        year: new Date().getFullYear(),
        contributor: "CAD AI Platform",
        date_created: new Date().toISOString()
      },
      licenses: [],
      images: files.map((file, index) => ({
        id: index + 1,
        file_name: file.fileId,
        width: 0, // Would need to be extracted from actual image
        height: 0, // Would need to be extracted from actual image
        date_captured: file.createdAt.toISOString()
      })),
      annotations: files.filter(f => f.label).map((file, index) => ({
        id: index + 1,
        image_id: files.indexOf(file) + 1,
        category_id: 1, // Would need proper category mapping
        bbox: [0, 0, 0, 0], // Would need actual bounding box data
        area: 0,
        iscrowd: 0
      })),
      categories: Array.from(new Set(files.map(f => f.label).filter(Boolean))).map((label, index) => ({
        id: index + 1,
        name: label,
        supercategory: "object"
      }))
    };

    archive.append(JSON.stringify(cocoData, null, 2), { name: 'annotations.json' });
  }

  /**
   * Export dataset as YOLO format
   */
  private static async exportAsYOLO(
    archive: archiver.Archiver,
    dataset: Dataset,
    files: DatasetLabel[],
    options: DatasetExportOptions
  ): Promise<void> {
    // YOLO format implementation
    const labels = Array.from(new Set(files.map(f => f.label).filter(Boolean)));
    const classesContent = labels.join('\n');
    
    archive.append(classesContent, { name: 'classes.txt' });

    // Create data.yaml for YOLO
    const yamlContent = `
train: train/images
val: val/images
test: test/images

nc: ${labels.length}
names: [${labels.map(l => `'${l}'`).join(', ')}]
`.trim();

    archive.append(yamlContent, { name: 'data.yaml' });
  }

  /**
   * Get dataset with files and labels
   */
  static async getDatasetWithFiles(datasetId: string, userId: string): Promise<Dataset | null> {
    try {
      const dataset = await DatasetModel.findById(datasetId);
      if (!dataset) {
        return null;
      }

      if (dataset.createdBy !== userId) {
        throw new Error('Access denied');
      }

      return dataset;
    } catch (error) {
      console.error('Error getting dataset with files:', error);
      throw error;
    }
  }

  /**
   * Delete dataset
   */
  static async deleteDataset(datasetId: string, userId: string): Promise<boolean> {
    try {
      const dataset = await DatasetModel.findById(datasetId);
      if (!dataset) {
        throw new Error('Dataset not found');
      }

      if (dataset.createdBy !== userId) {
        throw new Error('Access denied: You can only delete your own datasets');
      }

      if (dataset.status === 'training') {
        throw new Error('Cannot delete dataset while training is in progress');
      }

      const success = await DatasetModel.delete(datasetId);
      
      if (success) {
        console.log(`Dataset deleted: ${datasetId} by user ${userId}`);
      }
      
      return success;
    } catch (error) {
      console.error('Error deleting dataset:', error);
      throw error;
    }
  }
}