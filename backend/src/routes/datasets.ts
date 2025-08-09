import express from 'express';
import { DatasetModel } from '../models/Dataset.js';
import { DatasetService } from '../services/DatasetService.js';
import { authenticate } from '../middleware/auth.js';
import {
  validateDatasetCreate,
  validateDatasetUpdate,
  validateDatasetQuery,
  validateAddFilesToDataset,
  validateUpdateFileLabel,
  validateDatasetExport,
  validateBatchLabelUpdate,
  validateDatasetStatistics,
  validateDatasetId,
  validateFileId
} from '../validation/datasetValidation.js';
import { ApiResponse, Dataset, DatasetLabel } from '../types/index.js';

const router = express.Router();

/**
 * Create a new dataset
 * POST /api/datasets
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const { error, value } = validateDatasetCreate(req.body);
    if (error) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid dataset data',
          details: error.details.map(d => d.message),
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(400).json(response);
    }

    const dataset = await DatasetService.createDataset(value, req.user!.id);

    const response: ApiResponse = {
      success: true,
      data: dataset
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Error creating dataset:', error);
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'DATASET_CREATION_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create dataset',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      }
    };

    res.status(500).json(response);
  }
});

/**
 * Get all datasets for the authenticated user
 * GET /api/datasets
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const { error, value } = validateDatasetQuery(req.query);
    if (error) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: error.details.map(d => d.message),
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(400).json(response);
    }

    const { page, limit, sortBy, sortOrder, ...filters } = value;
    const options = {
      offset: (page - 1) * limit,
      limit,
      orderBy: sortBy,
      orderDirection: sortOrder
    };

    // Add user filter for non-admin users
    const datasetFilters = req.user!.role === 'admin' 
      ? filters 
      : { ...filters, createdBy: req.user!.id };

    const result = await DatasetModel.findAll(datasetFilters, options);

    const response: ApiResponse = {
      success: true,
      data: {
        datasets: result.datasets,
        pagination: result.pagination
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching datasets:', error);
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'DATASET_FETCH_ERROR',
        message: 'Failed to fetch datasets',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      }
    };

    res.status(500).json(response);
  }
});

/**
 * Get dataset by ID
 * GET /api/datasets/:id
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { isValid, error } = validateDatasetId(req.params.id);
    if (!isValid) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_DATASET_ID',
          message: error!,
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(400).json(response);
    }

    const dataset = await DatasetService.getDatasetWithFiles(req.params.id, req.user!.id);
    
    if (!dataset) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'DATASET_NOT_FOUND',
          message: 'Dataset not found',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: dataset
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching dataset:', error);
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'DATASET_FETCH_ERROR',
        message: error instanceof Error ? error.message : 'Failed to fetch dataset',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      }
    };

    const statusCode = error instanceof Error && error.message === 'Access denied' ? 403 : 500;
    res.status(statusCode).json(response);
  }
});

/**
 * Update dataset
 * PUT /api/datasets/:id
 */
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { isValid, error: idError } = validateDatasetId(req.params.id);
    if (!isValid) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_DATASET_ID',
          message: idError!,
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(400).json(response);
    }

    const { error, value } = validateDatasetUpdate(req.body);
    if (error) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid update data',
          details: error.details.map(d => d.message),
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(400).json(response);
    }

    // Check if dataset exists and user has access
    const existingDataset = await DatasetModel.findById(req.params.id);
    if (!existingDataset) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'DATASET_NOT_FOUND',
          message: 'Dataset not found',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(404).json(response);
    }

    if (existingDataset.createdBy !== req.user!.id && req.user!.role !== 'admin') {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: 'You can only update your own datasets',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(403).json(response);
    }

    const dataset = await DatasetModel.update(req.params.id, value);
    
    if (!dataset) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'DATASET_UPDATE_ERROR',
          message: 'Failed to update dataset',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(500).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: dataset
    };

    res.json(response);
  } catch (error) {
    console.error('Error updating dataset:', error);
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'DATASET_UPDATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to update dataset',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      }
    };

    res.status(500).json(response);
  }
});

/**
 * Delete dataset
 * DELETE /api/datasets/:id
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { isValid, error } = validateDatasetId(req.params.id);
    if (!isValid) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_DATASET_ID',
          message: error!,
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(400).json(response);
    }

    const success = await DatasetService.deleteDataset(req.params.id, req.user!.id);
    
    if (!success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'DATASET_NOT_FOUND',
          message: 'Dataset not found',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: { deleted: true }
    };

    res.json(response);
  } catch (error) {
    console.error('Error deleting dataset:', error);
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'DATASET_DELETE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to delete dataset',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      }
    };

    const statusCode = error instanceof Error && error.message.includes('Access denied') ? 403 : 500;
    res.status(statusCode).json(response);
  }
});

/**
 * Add files to dataset
 * POST /api/datasets/:id/files
 */
router.post('/:id/files', authenticate, async (req, res) => {
  try {
    const { isValid, error: idError } = validateDatasetId(req.params.id);
    if (!isValid) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_DATASET_ID',
          message: idError!,
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(400).json(response);
    }

    const { error, value } = validateAddFilesToDataset(req.body);
    if (error) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid file data',
          details: error.details.map(d => d.message),
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(400).json(response);
    }

    const labels = await DatasetService.addFilesToDataset(
      req.params.id,
      value.fileIds,
      req.user!.id
    );

    const response: ApiResponse = {
      success: true,
      data: {
        addedFiles: labels.length,
        labels
      }
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Error adding files to dataset:', error);
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'ADD_FILES_ERROR',
        message: error instanceof Error ? error.message : 'Failed to add files to dataset',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      }
    };

    const statusCode = error instanceof Error && error.message.includes('Access denied') ? 403 : 500;
    res.status(statusCode).json(response);
  }
});

/**
 * Remove file from dataset
 * DELETE /api/datasets/:id/files/:fileId
 */
router.delete('/:id/files/:fileId', authenticate, async (req, res) => {
  try {
    const { isValid: datasetIdValid, error: datasetIdError } = validateDatasetId(req.params.id);
    if (!datasetIdValid) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_DATASET_ID',
          message: datasetIdError!,
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(400).json(response);
    }

    const { isValid: fileIdValid, error: fileIdError } = validateFileId(req.params.fileId);
    if (!fileIdValid) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_FILE_ID',
          message: fileIdError!,
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(400).json(response);
    }

    const success = await DatasetService.removeFileFromDataset(
      req.params.id,
      req.params.fileId,
      req.user!.id
    );

    if (!success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'File not found in dataset',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: { removed: true }
    };

    res.json(response);
  } catch (error) {
    console.error('Error removing file from dataset:', error);
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'REMOVE_FILE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to remove file from dataset',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      }
    };

    const statusCode = error instanceof Error && error.message.includes('Access denied') ? 403 : 500;
    res.status(statusCode).json(response);
  }
});

/**
 * Update file label in dataset
 * PUT /api/datasets/:id/files/:fileId/label
 */
router.put('/:id/files/:fileId/label', authenticate, async (req, res) => {
  try {
    const { isValid: datasetIdValid, error: datasetIdError } = validateDatasetId(req.params.id);
    if (!datasetIdValid) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_DATASET_ID',
          message: datasetIdError!,
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(400).json(response);
    }

    const { isValid: fileIdValid, error: fileIdError } = validateFileId(req.params.fileId);
    if (!fileIdValid) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_FILE_ID',
          message: fileIdError!,
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(400).json(response);
    }

    const { error, value } = validateUpdateFileLabel(req.body);
    if (error) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid label data',
          details: error.details.map(d => d.message),
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(400).json(response);
    }

    const label = await DatasetService.updateFileLabel(
      req.params.id,
      req.params.fileId,
      value.label,
      value.confidence,
      req.user!.id
    );

    if (!label) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'File not found in dataset',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: label
    };

    res.json(response);
  } catch (error) {
    console.error('Error updating file label:', error);
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'UPDATE_LABEL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to update file label',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      }
    };

    const statusCode = error instanceof Error && error.message.includes('Access denied') ? 403 : 500;
    res.status(statusCode).json(response);
  }
});

/**
 * Batch update file labels
 * PUT /api/datasets/:id/labels
 */
router.put('/:id/labels', authenticate, async (req, res) => {
  try {
    const { isValid, error: idError } = validateDatasetId(req.params.id);
    if (!isValid) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_DATASET_ID',
          message: idError!,
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(400).json(response);
    }

    const { error, value } = validateBatchLabelUpdate(req.body);
    if (error) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid batch update data',
          details: error.details.map(d => d.message),
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(400).json(response);
    }

    const labels = await DatasetService.batchUpdateLabels(
      req.params.id,
      value.updates,
      req.user!.id
    );

    const response: ApiResponse = {
      success: true,
      data: {
        updatedLabels: labels.length,
        labels
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error batch updating labels:', error);
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'BATCH_UPDATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to batch update labels',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      }
    };

    const statusCode = error instanceof Error && error.message.includes('Access denied') ? 403 : 500;
    res.status(statusCode).json(response);
  }
});

/**
 * Validate dataset
 * POST /api/datasets/:id/validate
 */
router.post('/:id/validate', authenticate, async (req, res) => {
  try {
    const { isValid, error } = validateDatasetId(req.params.id);
    if (!isValid) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_DATASET_ID',
          message: error!,
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(400).json(response);
    }

    const validation = await DatasetService.validateDataset(req.params.id, req.user!.id);

    const response: ApiResponse = {
      success: true,
      data: validation
    };

    res.json(response);
  } catch (error) {
    console.error('Error validating dataset:', error);
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error instanceof Error ? error.message : 'Failed to validate dataset',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      }
    };

    const statusCode = error instanceof Error && error.message.includes('Access denied') ? 403 : 500;
    res.status(statusCode).json(response);
  }
});

/**
 * Get dataset quality metrics
 * GET /api/datasets/:id/metrics
 */
router.get('/:id/metrics', authenticate, async (req, res) => {
  try {
    const { isValid, error } = validateDatasetId(req.params.id);
    if (!isValid) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_DATASET_ID',
          message: error!,
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(400).json(response);
    }

    const metrics = await DatasetService.calculateQualityMetrics(req.params.id, req.user!.id);

    const response: ApiResponse = {
      success: true,
      data: metrics
    };

    res.json(response);
  } catch (error) {
    console.error('Error calculating dataset metrics:', error);
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'METRICS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to calculate dataset metrics',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      }
    };

    const statusCode = error instanceof Error && error.message.includes('Access denied') ? 403 : 500;
    res.status(statusCode).json(response);
  }
});

/**
 * Export dataset
 * POST /api/datasets/:id/export
 */
router.post('/:id/export', authenticate, async (req, res) => {
  try {
    const { isValid, error: idError } = validateDatasetId(req.params.id);
    if (!isValid) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_DATASET_ID',
          message: idError!,
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(400).json(response);
    }

    const { error, value } = validateDatasetExport(req.body);
    if (error) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid export options',
          details: error.details.map(d => d.message),
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        }
      };
      return res.status(400).json(response);
    }

    const exportResult = await DatasetService.exportDataset(
      req.params.id,
      value,
      req.user!.id
    );

    res.setHeader('Content-Type', exportResult.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
    
    exportResult.stream.pipe(res);
  } catch (error) {
    console.error('Error exporting dataset:', error);
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'EXPORT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to export dataset',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      }
    };

    const statusCode = error instanceof Error && error.message.includes('Access denied') ? 403 : 500;
    res.status(statusCode).json(response);
  }
});

/**
 * Get dataset statistics
 * GET /api/datasets/statistics
 */
router.get('/statistics', authenticate, async (req, res) => {
  try {
    const statistics = await DatasetModel.getStatistics();

    const response: ApiResponse = {
      success: true,
      data: statistics
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching dataset statistics:', error);
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'STATISTICS_ERROR',
        message: 'Failed to fetch dataset statistics',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      }
    };

    res.status(500).json(response);
  }
});

export default router;