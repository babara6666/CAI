import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import datasetRoutes from '../datasets.js';
import { DatasetService } from '../../services/DatasetService.js';
import { DatasetModel } from '../../models/Dataset.js';
import { Dataset, DatasetLabel, DatasetStatus } from '../../types/index.js';

// Mock the services and models
vi.mock('../../services/DatasetService.js');
vi.mock('../../models/Dataset.js');

const mockDatasetService = vi.mocked(DatasetService);
const mockDatasetModel = vi.mocked(DatasetModel);

// Mock auth middleware
vi.mock('../../middleware/auth.js', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.user = { id: '123e4567-e89b-12d3-a456-426614174000', role: 'engineer' };
    next();
  },
  requireRole: (roles: string[]) => (req: any, res: any, next: any) => {
    if (roles.includes(req.user.role)) {
      next();
    } else {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }
  }
}));

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.headers['x-request-id'] = 'test-request-id';
  next();
});
app.use('/api/datasets', datasetRoutes);

describe('Dataset Routes', () => {
  const mockUserId = '123e4567-e89b-12d3-a456-426614174000';
  const mockDatasetId = '123e4567-e89b-12d3-a456-426614174001';
  const mockFileId = '123e4567-e89b-12d3-a456-426614174002';

  const mockDataset: Dataset = {
    id: mockDatasetId,
    name: 'Test Dataset',
    description: 'Test description',
    createdBy: mockUserId,
    createdAt: new Date('2025-08-06T02:20:10.480Z'),
    updatedAt: new Date('2025-08-06T02:20:10.480Z'),
    fileCount: 0,
    status: 'creating' as DatasetStatus,
    tags: ['test'],
    files: [],
    labels: []
  };

  const mockLabel: DatasetLabel = {
    fileId: mockFileId,
    label: 'test-label',
    confidence: 0.9,
    createdBy: mockUserId,
    createdAt: new Date('2025-08-06T02:20:10.480Z')
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/datasets', () => {
    it('should create dataset successfully', async () => {
      // Arrange
      const datasetData = {
        name: 'Test Dataset',
        description: 'Test description',
        tags: ['test']
      };

      mockDatasetService.createDataset.mockResolvedValue(mockDataset);

      // Act
      const response = await request(app)
        .post('/api/datasets')
        .send(datasetData);

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        ...mockDataset,
        createdAt: mockDataset.createdAt.toISOString(),
        updatedAt: mockDataset.updatedAt.toISOString()
      });
      expect(mockDatasetService.createDataset).toHaveBeenCalledWith(datasetData, mockUserId);
    });

    it('should return validation error for invalid data', async () => {
      // Arrange
      const invalidData = {
        name: '', // Empty name
        description: 'Test description'
      };

      // Act
      const response = await request(app)
        .post('/api/datasets')
        .send(invalidData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle service errors', async () => {
      // Arrange
      const datasetData = {
        name: 'Test Dataset',
        description: 'Test description'
      };

      mockDatasetService.createDataset.mockRejectedValue(new Error('Service error'));

      // Act
      const response = await request(app)
        .post('/api/datasets')
        .send(datasetData);

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('DATASET_CREATION_ERROR');
    });
  });

  describe('GET /api/datasets', () => {
    it('should get datasets successfully', async () => {
      // Arrange
      const mockResult = {
        datasets: [mockDataset],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
      };

      mockDatasetModel.findAll.mockResolvedValue(mockResult);

      // Act
      const response = await request(app)
        .get('/api/datasets')
        .query({ page: 1, limit: 10 });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        ...mockResult,
        datasets: mockResult.datasets.map(d => ({
          ...d,
          createdAt: d.createdAt.toISOString(),
          updatedAt: d.updatedAt.toISOString()
        }))
      });
    });

    it('should handle query validation errors', async () => {
      // Act
      const response = await request(app)
        .get('/api/datasets')
        .query({ page: 0 }); // Invalid page

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should filter by user for non-admin users', async () => {
      // Arrange
      const mockResult = {
        datasets: [mockDataset],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
      };

      mockDatasetModel.findAll.mockResolvedValue(mockResult);

      // Act
      const response = await request(app)
        .get('/api/datasets');

      // Assert
      expect(response.status).toBe(200);
      expect(mockDatasetModel.findAll).toHaveBeenCalledWith(
        { createdBy: mockUserId },
        expect.any(Object)
      );
    });
  });

  describe('GET /api/datasets/:id', () => {
    it('should get dataset by ID successfully', async () => {
      // Arrange
      mockDatasetService.getDatasetWithFiles.mockResolvedValue(mockDataset);

      // Act
      const response = await request(app)
        .get(`/api/datasets/${mockDatasetId}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        ...mockDataset,
        createdAt: mockDataset.createdAt.toISOString(),
        updatedAt: mockDataset.updatedAt.toISOString()
      });
      expect(mockDatasetService.getDatasetWithFiles).toHaveBeenCalledWith(mockDatasetId, mockUserId);
    });

    it('should return 404 if dataset not found', async () => {
      // Arrange
      mockDatasetService.getDatasetWithFiles.mockResolvedValue(null);

      // Act
      const response = await request(app)
        .get(`/api/datasets/${mockDatasetId}`);

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('DATASET_NOT_FOUND');
    });

    it('should return 400 for invalid dataset ID', async () => {
      // Act
      const response = await request(app)
        .get('/api/datasets/invalid-id');

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_DATASET_ID');
    });

    it('should return 403 for access denied', async () => {
      // Arrange
      mockDatasetService.getDatasetWithFiles.mockRejectedValue(new Error('Access denied'));

      // Act
      const response = await request(app)
        .get(`/api/datasets/${mockDatasetId}`);

      // Assert
      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/datasets/:id', () => {
    it('should update dataset successfully', async () => {
      // Arrange
      const updateData = {
        name: 'Updated Dataset',
        description: 'Updated description'
      };

      mockDatasetModel.findById.mockResolvedValue({
        ...mockDataset,
        createdBy: mockUserId
      });
      mockDatasetModel.update.mockResolvedValue({ ...mockDataset, ...updateData });

      // Act
      const response = await request(app)
        .put(`/api/datasets/${mockDatasetId}`)
        .send(updateData);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockDatasetModel.update).toHaveBeenCalledWith(mockDatasetId, updateData);
    });

    it('should return 404 if dataset not found', async () => {
      // Arrange
      const updateData = { name: 'Updated Dataset' };
      mockDatasetModel.findById.mockResolvedValue(null);

      // Act
      const response = await request(app)
        .put(`/api/datasets/${mockDatasetId}`)
        .send(updateData);

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('DATASET_NOT_FOUND');
    });

    it('should return 403 if user does not own dataset', async () => {
      // Arrange
      const updateData = { name: 'Updated Dataset' };
      const otherUserDataset = { ...mockDataset, createdBy: 'other-user' };
      mockDatasetModel.findById.mockResolvedValue(otherUserDataset);

      // Act
      const response = await request(app)
        .put(`/api/datasets/${mockDatasetId}`)
        .send(updateData);

      // Assert
      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ACCESS_DENIED');
    });
  });

  describe('DELETE /api/datasets/:id', () => {
    it('should delete dataset successfully', async () => {
      // Arrange
      mockDatasetService.deleteDataset.mockResolvedValue(true);

      // Act
      const response = await request(app)
        .delete(`/api/datasets/${mockDatasetId}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.deleted).toBe(true);
      expect(mockDatasetService.deleteDataset).toHaveBeenCalledWith(mockDatasetId, mockUserId);
    });

    it('should return 404 if dataset not found', async () => {
      // Arrange
      mockDatasetService.deleteDataset.mockResolvedValue(false);

      // Act
      const response = await request(app)
        .delete(`/api/datasets/${mockDatasetId}`);

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('DATASET_NOT_FOUND');
    });
  });

  describe('POST /api/datasets/:id/files', () => {
    it('should add files to dataset successfully', async () => {
      // Arrange
      const fileIds = [mockFileId];
      const requestData = { fileIds };

      mockDatasetService.addFilesToDataset.mockResolvedValue([mockLabel]);

      // Act
      const response = await request(app)
        .post(`/api/datasets/${mockDatasetId}/files`)
        .send(requestData);

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.addedFiles).toBe(1);
      expect(response.body.data.labels).toEqual([{
        ...mockLabel,
        createdAt: mockLabel.createdAt.toISOString()
      }]);
      expect(mockDatasetService.addFilesToDataset).toHaveBeenCalledWith(
        mockDatasetId,
        fileIds,
        mockUserId
      );
    });

    it('should return validation error for invalid file IDs', async () => {
      // Arrange
      const requestData = { fileIds: ['invalid-id'] };

      // Act
      const response = await request(app)
        .post(`/api/datasets/${mockDatasetId}/files`)
        .send(requestData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /api/datasets/:id/files/:fileId', () => {
    it('should remove file from dataset successfully', async () => {
      // Arrange
      mockDatasetService.removeFileFromDataset.mockResolvedValue(true);

      // Act
      const response = await request(app)
        .delete(`/api/datasets/${mockDatasetId}/files/${mockFileId}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.removed).toBe(true);
      expect(mockDatasetService.removeFileFromDataset).toHaveBeenCalledWith(
        mockDatasetId,
        mockFileId,
        mockUserId
      );
    });

    it('should return 404 if file not found in dataset', async () => {
      // Arrange
      mockDatasetService.removeFileFromDataset.mockResolvedValue(false);

      // Act
      const response = await request(app)
        .delete(`/api/datasets/${mockDatasetId}/files/${mockFileId}`);

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FILE_NOT_FOUND');
    });
  });

  describe('PUT /api/datasets/:id/files/:fileId/label', () => {
    it('should update file label successfully', async () => {
      // Arrange
      const labelData = { label: 'new-label', confidence: 0.8 };
      mockDatasetService.updateFileLabel.mockResolvedValue(mockLabel);

      // Act
      const response = await request(app)
        .put(`/api/datasets/${mockDatasetId}/files/${mockFileId}/label`)
        .send(labelData);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        ...mockLabel,
        createdAt: mockLabel.createdAt.toISOString()
      });
      expect(mockDatasetService.updateFileLabel).toHaveBeenCalledWith(
        mockDatasetId,
        mockFileId,
        labelData.label,
        labelData.confidence,
        mockUserId
      );
    });

    it('should return validation error for invalid label', async () => {
      // Arrange
      const labelData = { label: '' }; // Empty label

      // Act
      const response = await request(app)
        .put(`/api/datasets/${mockDatasetId}/files/${mockFileId}/label`)
        .send(labelData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /api/datasets/:id/labels', () => {
    it('should batch update labels successfully', async () => {
      // Arrange
      const updates = [
        { fileId: mockFileId, label: 'label1', confidence: 0.9 }
      ];
      const requestData = { updates };

      mockDatasetService.batchUpdateLabels.mockResolvedValue([mockLabel]);

      // Act
      const response = await request(app)
        .put(`/api/datasets/${mockDatasetId}/labels`)
        .send(requestData);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.updatedLabels).toBe(1);
      expect(response.body.data.labels).toEqual([{
        ...mockLabel,
        createdAt: mockLabel.createdAt.toISOString()
      }]);
      expect(mockDatasetService.batchUpdateLabels).toHaveBeenCalledWith(
        mockDatasetId,
        updates,
        mockUserId
      );
    });
  });

  describe('POST /api/datasets/:id/validate', () => {
    it('should validate dataset successfully', async () => {
      // Arrange
      const validationResult = {
        isValid: true,
        errors: [],
        warnings: [],
        statistics: {
          totalFiles: 10,
          labeledFiles: 8,
          unlabeledFiles: 2,
          uniqueLabels: ['label1', 'label2'],
          averageConfidence: 0.85
        }
      };

      mockDatasetService.validateDataset.mockResolvedValue(validationResult);

      // Act
      const response = await request(app)
        .post(`/api/datasets/${mockDatasetId}/validate`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(validationResult);
      expect(mockDatasetService.validateDataset).toHaveBeenCalledWith(mockDatasetId, mockUserId);
    });
  });

  describe('GET /api/datasets/:id/metrics', () => {
    it('should get dataset quality metrics successfully', async () => {
      // Arrange
      const metrics = {
        completeness: 80,
        consistency: 85,
        balance: 75,
        confidence: 90,
        duplicates: 0
      };

      mockDatasetService.calculateQualityMetrics.mockResolvedValue(metrics);

      // Act
      const response = await request(app)
        .get(`/api/datasets/${mockDatasetId}/metrics`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(metrics);
      expect(mockDatasetService.calculateQualityMetrics).toHaveBeenCalledWith(mockDatasetId, mockUserId);
    });
  });

  describe('POST /api/datasets/:id/export', () => {
    it('should export dataset successfully', async () => {
      // Arrange
      const exportOptions = {
        format: 'json' as const,
        includeMetadata: true,
        includeImages: false,
        compressionLevel: 6
      };

      const mockStream = {
        pipe: vi.fn((res) => {
          // Simulate immediate completion
          setTimeout(() => res.end(), 0);
          return res;
        })
      };

      const exportResult = {
        stream: mockStream,
        filename: 'dataset_export.zip',
        mimeType: 'application/zip'
      };

      mockDatasetService.exportDataset.mockResolvedValue(exportResult as any);

      // Act
      const response = await request(app)
        .post(`/api/datasets/${mockDatasetId}/export`)
        .send(exportOptions);

      // Assert
      expect(mockDatasetService.exportDataset).toHaveBeenCalledWith(
        mockDatasetId,
        exportOptions,
        mockUserId
      );
      expect(mockStream.pipe).toHaveBeenCalled();
    });

    it('should return validation error for invalid export format', async () => {
      // Arrange
      const exportOptions = {
        format: 'invalid-format',
        includeMetadata: true
      };

      // Act
      const response = await request(app)
        .post(`/api/datasets/${mockDatasetId}/export`)
        .send(exportOptions);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});