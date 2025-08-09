import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatasetService } from '../DatasetService.js';
import { DatasetModel } from '../../models/Dataset.js';
import { CADFileModel } from '../../models/CADFile.js';
import { Dataset, DatasetLabel, DatasetStatus } from '../../types/index.js';

// Mock the models
vi.mock('../../models/Dataset.js');
vi.mock('../../models/CADFile.js');

const mockDatasetModel = vi.mocked(DatasetModel);
const mockCADFileModel = vi.mocked(CADFileModel);

describe('DatasetService', () => {
  const mockUserId = 'user-123';
  const mockDatasetId = 'dataset-123';
  const mockFileId = 'file-123';

  const mockDataset: Dataset = {
    id: mockDatasetId,
    name: 'Test Dataset',
    description: 'Test description',
    createdBy: mockUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
    fileCount: 0,
    status: 'creating' as DatasetStatus,
    tags: ['test'],
    files: [],
    labels: []
  };

  const mockFile = {
    id: mockFileId,
    filename: 'test.dwg',
    originalName: 'test.dwg',
    fileSize: 1024,
    mimeType: 'application/dwg',
    uploadedBy: mockUserId,
    uploadedAt: new Date(),
    tags: [],
    metadata: {},
    currentVersion: 1,
    fileUrl: 'http://example.com/file.dwg'
  };

  const mockLabel: DatasetLabel = {
    fileId: mockFileId,
    label: 'test-label',
    confidence: 0.9,
    createdBy: mockUserId,
    createdAt: new Date()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createDataset', () => {
    it('should create a dataset successfully', async () => {
      // Arrange
      const datasetData = {
        name: 'Test Dataset',
        description: 'Test description',
        tags: ['test']
      };

      mockDatasetModel.findByUser.mockResolvedValue({
        datasets: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 }
      });
      mockDatasetModel.create.mockResolvedValue(mockDataset);

      // Act
      const result = await DatasetService.createDataset(datasetData, mockUserId);

      // Assert
      expect(result).toEqual(mockDataset);
      expect(mockDatasetModel.create).toHaveBeenCalledWith({
        ...datasetData,
        createdBy: mockUserId
      });
    });

    it('should throw error for duplicate dataset name', async () => {
      // Arrange
      const datasetData = {
        name: 'Existing Dataset',
        description: 'Test description'
      };

      mockDatasetModel.findByUser.mockResolvedValue({
        datasets: [{ ...mockDataset, name: 'Existing Dataset' }],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
      });

      // Act & Assert
      await expect(DatasetService.createDataset(datasetData, mockUserId))
        .rejects.toThrow('Dataset name already exists');
    });

    it('should sanitize dataset name', async () => {
      // Arrange
      const datasetData = {
        name: '  Test Dataset  ',
        description: 'Test description'
      };

      mockDatasetModel.findByUser.mockResolvedValue({
        datasets: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 }
      });
      mockDatasetModel.create.mockResolvedValue(mockDataset);

      // Act
      await DatasetService.createDataset(datasetData, mockUserId);

      // Assert
      expect(mockDatasetModel.create).toHaveBeenCalledWith({
        name: 'Test Dataset',
        description: 'Test description',
        createdBy: mockUserId
      });
    });
  });

  describe('addFilesToDataset', () => {
    it('should add files to dataset successfully', async () => {
      // Arrange
      const fileIds = [mockFileId];
      
      mockDatasetModel.findById.mockResolvedValue(mockDataset);
      mockCADFileModel.findById.mockResolvedValue(mockFile);
      mockDatasetModel.addFiles.mockResolvedValue([mockLabel]);
      mockDatasetModel.markAsReady.mockResolvedValue(true);

      // Act
      const result = await DatasetService.addFilesToDataset(mockDatasetId, fileIds, mockUserId);

      // Assert
      expect(result).toEqual([mockLabel]);
      expect(mockDatasetModel.addFiles).toHaveBeenCalledWith(mockDatasetId, fileIds, mockUserId);
      expect(mockDatasetModel.markAsReady).toHaveBeenCalledWith(mockDatasetId);
    });

    it('should throw error if dataset not found', async () => {
      // Arrange
      const fileIds = [mockFileId];
      
      mockDatasetModel.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(DatasetService.addFilesToDataset(mockDatasetId, fileIds, mockUserId))
        .rejects.toThrow('Dataset not found');
    });

    it('should throw error if user does not own dataset', async () => {
      // Arrange
      const fileIds = [mockFileId];
      const otherUserDataset = { ...mockDataset, createdBy: 'other-user' };
      
      mockDatasetModel.findById.mockResolvedValue(otherUserDataset);

      // Act & Assert
      await expect(DatasetService.addFilesToDataset(mockDatasetId, fileIds, mockUserId))
        .rejects.toThrow('Access denied: You can only modify your own datasets');
    });

    it('should throw error if dataset is training', async () => {
      // Arrange
      const fileIds = [mockFileId];
      const trainingDataset = { ...mockDataset, status: 'training' as DatasetStatus };
      
      mockDatasetModel.findById.mockResolvedValue(trainingDataset);

      // Act & Assert
      await expect(DatasetService.addFilesToDataset(mockDatasetId, fileIds, mockUserId))
        .rejects.toThrow('Cannot modify dataset while training is in progress');
    });

    it('should filter out invalid files', async () => {
      // Arrange
      const fileIds = [mockFileId, 'invalid-file-id'];
      
      mockDatasetModel.findById.mockResolvedValue(mockDataset);
      mockCADFileModel.findById.mockImplementation((id) => {
        if (id === mockFileId) return Promise.resolve(mockFile);
        return Promise.resolve(null);
      });
      mockDatasetModel.addFiles.mockResolvedValue([mockLabel]);
      mockDatasetModel.markAsReady.mockResolvedValue(true);

      // Act
      const result = await DatasetService.addFilesToDataset(mockDatasetId, fileIds, mockUserId);

      // Assert
      expect(result).toEqual([mockLabel]);
      expect(mockDatasetModel.addFiles).toHaveBeenCalledWith(mockDatasetId, [mockFileId], mockUserId);
    });

    it('should throw error if no valid files', async () => {
      // Arrange
      const fileIds = ['invalid-file-id'];
      
      mockDatasetModel.findById.mockResolvedValue(mockDataset);
      mockCADFileModel.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(DatasetService.addFilesToDataset(mockDatasetId, fileIds, mockUserId))
        .rejects.toThrow('No valid files to add to dataset');
    });
  });

  describe('removeFileFromDataset', () => {
    it('should remove file from dataset successfully', async () => {
      // Arrange
      mockDatasetModel.findById.mockResolvedValue(mockDataset);
      mockDatasetModel.removeFile.mockResolvedValue(true);

      // Act
      const result = await DatasetService.removeFileFromDataset(mockDatasetId, mockFileId, mockUserId);

      // Assert
      expect(result).toBe(true);
      expect(mockDatasetModel.removeFile).toHaveBeenCalledWith(mockDatasetId, mockFileId);
    });

    it('should throw error if dataset not found', async () => {
      // Arrange
      mockDatasetModel.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(DatasetService.removeFileFromDataset(mockDatasetId, mockFileId, mockUserId))
        .rejects.toThrow('Dataset not found');
    });

    it('should throw error if user does not own dataset', async () => {
      // Arrange
      const otherUserDataset = { ...mockDataset, createdBy: 'other-user' };
      mockDatasetModel.findById.mockResolvedValue(otherUserDataset);

      // Act & Assert
      await expect(DatasetService.removeFileFromDataset(mockDatasetId, mockFileId, mockUserId))
        .rejects.toThrow('Access denied: You can only modify your own datasets');
    });
  });

  describe('updateFileLabel', () => {
    it('should update file label successfully', async () => {
      // Arrange
      const label = 'new-label';
      const confidence = 0.8;
      
      mockDatasetModel.findById.mockResolvedValue(mockDataset);
      mockDatasetModel.updateFileLabel.mockResolvedValue(mockLabel);

      // Act
      const result = await DatasetService.updateFileLabel(
        mockDatasetId, 
        mockFileId, 
        label, 
        confidence, 
        mockUserId
      );

      // Assert
      expect(result).toEqual(mockLabel);
      expect(mockDatasetModel.updateFileLabel).toHaveBeenCalledWith(
        mockDatasetId, 
        mockFileId, 
        label, 
        confidence
      );
    });

    it('should throw error for invalid label', async () => {
      // Arrange
      const invalidLabel = '';
      
      mockDatasetModel.findById.mockResolvedValue(mockDataset);

      // Act & Assert
      await expect(DatasetService.updateFileLabel(
        mockDatasetId, 
        mockFileId, 
        invalidLabel, 
        undefined, 
        mockUserId
      )).rejects.toThrow('Label is required');
    });

    it('should sanitize label', async () => {
      // Arrange
      const label = '  test label  ';
      
      mockDatasetModel.findById.mockResolvedValue(mockDataset);
      mockDatasetModel.updateFileLabel.mockResolvedValue(mockLabel);

      // Act
      await DatasetService.updateFileLabel(mockDatasetId, mockFileId, label, undefined, mockUserId);

      // Assert
      expect(mockDatasetModel.updateFileLabel).toHaveBeenCalledWith(
        mockDatasetId, 
        mockFileId, 
        'test label', 
        undefined
      );
    });
  });

  describe('batchUpdateLabels', () => {
    it('should batch update labels successfully', async () => {
      // Arrange
      const updates = [
        { fileId: mockFileId, label: 'label1', confidence: 0.9 },
        { fileId: 'file-456', label: 'label2', confidence: 0.8 }
      ];
      
      mockDatasetModel.findById.mockResolvedValue(mockDataset);
      mockDatasetModel.updateFileLabel.mockResolvedValue(mockLabel);

      // Act
      const result = await DatasetService.batchUpdateLabels(mockDatasetId, updates, mockUserId);

      // Assert
      expect(result).toHaveLength(2);
      expect(mockDatasetModel.updateFileLabel).toHaveBeenCalledTimes(2);
    });

    it('should handle partial failures in batch update', async () => {
      // Arrange
      const updates = [
        { fileId: mockFileId, label: 'valid-label', confidence: 0.9 },
        { fileId: 'file-456', label: '', confidence: 0.8 } // Invalid label
      ];
      
      mockDatasetModel.findById.mockResolvedValue(mockDataset);
      mockDatasetModel.updateFileLabel.mockResolvedValue(mockLabel);

      // Act
      const result = await DatasetService.batchUpdateLabels(mockDatasetId, updates, mockUserId);

      // Assert
      expect(result).toHaveLength(1); // Only one successful update
      expect(mockDatasetModel.updateFileLabel).toHaveBeenCalledTimes(1);
    });
  });

  describe('validateDataset', () => {
    it('should validate dataset successfully', async () => {
      // Arrange
      const files = [
        { ...mockLabel, label: 'label1' },
        { ...mockLabel, fileId: 'file-456', label: 'label2' }
      ];
      
      mockDatasetModel.findById.mockResolvedValue(mockDataset);
      mockDatasetModel.getDatasetFiles.mockResolvedValue(files);

      // Act
      const result = await DatasetService.validateDataset(mockDatasetId, mockUserId);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.statistics.totalFiles).toBe(2);
      expect(result.statistics.labeledFiles).toBe(2);
      expect(result.statistics.unlabeledFiles).toBe(0);
      expect(result.statistics.uniqueLabels).toEqual(['label1', 'label2']);
    });

    it('should detect empty dataset', async () => {
      // Arrange
      mockDatasetModel.findById.mockResolvedValue(mockDataset);
      mockDatasetModel.getDatasetFiles.mockResolvedValue([]);

      // Act
      const result = await DatasetService.validateDataset(mockDatasetId, mockUserId);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Dataset contains no files');
    });

    it('should detect unlabeled files', async () => {
      // Arrange
      const files = [
        { ...mockLabel, label: 'label1' },
        { ...mockLabel, fileId: 'file-456', label: '' } // Unlabeled
      ];
      
      mockDatasetModel.findById.mockResolvedValue(mockDataset);
      mockDatasetModel.getDatasetFiles.mockResolvedValue(files);

      // Act
      const result = await DatasetService.validateDataset(mockDatasetId, mockUserId);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('1 files are missing labels');
      expect(result.statistics.unlabeledFiles).toBe(1);
    });

    it('should detect label imbalance', async () => {
      // Arrange
      const files = [
        ...Array(20).fill(null).map((_, i) => ({ ...mockLabel, fileId: `file-${i}`, label: 'common' })),
        { ...mockLabel, fileId: 'rare-file', label: 'rare' }
      ];
      
      mockDatasetModel.findById.mockResolvedValue(mockDataset);
      mockDatasetModel.getDatasetFiles.mockResolvedValue(files);

      // Act
      const result = await DatasetService.validateDataset(mockDatasetId, mockUserId);

      // Assert
      expect(result.warnings.some(w => w.includes('label imbalance'))).toBe(true);
    });
  });

  describe('calculateQualityMetrics', () => {
    it('should calculate quality metrics correctly', async () => {
      // Arrange
      const files = [
        { ...mockLabel, label: 'label1', confidence: 0.9 },
        { ...mockLabel, fileId: 'file-456', label: 'label2', confidence: 0.8 },
        { ...mockLabel, fileId: 'file-789', label: '', confidence: undefined } // Unlabeled
      ];
      
      mockDatasetModel.findById.mockResolvedValue(mockDataset);
      mockDatasetModel.getDatasetFiles.mockResolvedValue(files);

      // Act
      const result = await DatasetService.calculateQualityMetrics(mockDatasetId, mockUserId);

      // Assert
      expect(result.completeness).toBe(66.67); // 2/3 files labeled
      expect(result.confidence).toBe(85); // Average of 0.9 and 0.8 * 100
      expect(result.balance).toBeGreaterThan(0); // Should have some balance score
      expect(result.consistency).toBe(85); // Placeholder value
      expect(result.duplicates).toBe(0); // Placeholder value
    });

    it('should handle empty dataset', async () => {
      // Arrange
      mockDatasetModel.findById.mockResolvedValue(mockDataset);
      mockDatasetModel.getDatasetFiles.mockResolvedValue([]);

      // Act
      const result = await DatasetService.calculateQualityMetrics(mockDatasetId, mockUserId);

      // Assert
      expect(result.completeness).toBe(0);
      expect(result.confidence).toBe(0);
      expect(result.balance).toBe(0);
      expect(result.consistency).toBe(0);
      expect(result.duplicates).toBe(0);
    });
  });

  describe('getDatasetWithFiles', () => {
    it('should get dataset with files successfully', async () => {
      // Arrange
      mockDatasetModel.findById.mockResolvedValue(mockDataset);

      // Act
      const result = await DatasetService.getDatasetWithFiles(mockDatasetId, mockUserId);

      // Assert
      expect(result).toEqual(mockDataset);
      expect(mockDatasetModel.findById).toHaveBeenCalledWith(mockDatasetId);
    });

    it('should return null if dataset not found', async () => {
      // Arrange
      mockDatasetModel.findById.mockResolvedValue(null);

      // Act
      const result = await DatasetService.getDatasetWithFiles(mockDatasetId, mockUserId);

      // Assert
      expect(result).toBeNull();
    });

    it('should throw error if user does not own dataset', async () => {
      // Arrange
      const otherUserDataset = { ...mockDataset, createdBy: 'other-user' };
      mockDatasetModel.findById.mockResolvedValue(otherUserDataset);

      // Act & Assert
      await expect(DatasetService.getDatasetWithFiles(mockDatasetId, mockUserId))
        .rejects.toThrow('Access denied');
    });
  });

  describe('deleteDataset', () => {
    it('should delete dataset successfully', async () => {
      // Arrange
      mockDatasetModel.findById.mockResolvedValue(mockDataset);
      mockDatasetModel.delete.mockResolvedValue(true);

      // Act
      const result = await DatasetService.deleteDataset(mockDatasetId, mockUserId);

      // Assert
      expect(result).toBe(true);
      expect(mockDatasetModel.delete).toHaveBeenCalledWith(mockDatasetId);
    });

    it('should throw error if dataset not found', async () => {
      // Arrange
      mockDatasetModel.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(DatasetService.deleteDataset(mockDatasetId, mockUserId))
        .rejects.toThrow('Dataset not found');
    });

    it('should throw error if user does not own dataset', async () => {
      // Arrange
      const otherUserDataset = { ...mockDataset, createdBy: 'other-user' };
      mockDatasetModel.findById.mockResolvedValue(otherUserDataset);

      // Act & Assert
      await expect(DatasetService.deleteDataset(mockDatasetId, mockUserId))
        .rejects.toThrow('Access denied: You can only delete your own datasets');
    });

    it('should throw error if dataset is training', async () => {
      // Arrange
      const trainingDataset = { ...mockDataset, status: 'training' as DatasetStatus };
      mockDatasetModel.findById.mockResolvedValue(trainingDataset);

      // Act & Assert
      await expect(DatasetService.deleteDataset(mockDatasetId, mockUserId))
        .rejects.toThrow('Cannot delete dataset while training is in progress');
    });
  });
});