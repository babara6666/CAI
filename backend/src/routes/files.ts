import express from 'express';
import { Request, Response } from 'express';
import { FileUploadService } from '../services/FileUploadService.js';
import { CADFileModel } from '../models/CADFile.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { 
  uploadSingle, 
  uploadMultiple, 
  handleUploadError,
  cadFileUpload,
  cadMultipleFileUpload
} from '../middleware/upload.js';
import {
  validateFileUpload,
  validateFileReplace,
  validateFileQuery,
  validateFileUpdate,
  validateFileId,
  validateStatisticsQuery
} from '../validation/fileValidation.js';
import { ApiResponse, FileFilters, QueryOptions } from '../types/index.js';

const router = express.Router();
const fileUploadService = new FileUploadService();

/**
 * Upload single CAD file
 * POST /api/files/upload
 */
router.post('/upload', 
  authenticate,
  ...cadFileUpload,
  async (req: Request, res: Response) => {
    try {
      const { error, value } = validateFileUpload(req.body);
      if (error) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid upload parameters',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown',
            details: error.details.map(d => d.message)
          }
        };
        return res.status(400).json(response);
      }

      const file = req.file!;
      const uploadOptions = {
        tags: value.tags,
        projectName: value.projectName,
        partName: value.partName,
        description: value.description,
        generateThumbnail: value.generateThumbnail,
        validateFile: value.validateFile
      };

      const result = await fileUploadService.uploadFile(
        file.buffer,
        file.originalname,
        file.mimetype,
        req.user!.id,
        uploadOptions
      );

      if (!result.success) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'UPLOAD_FAILED',
            message: 'File upload failed',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown',
            details: result.errors,
            suggestions: result.warnings
          }
        };
        return res.status(400).json(response);
      }

      const response: ApiResponse = {
        success: true,
        data: {
          file: result.file,
          warnings: result.warnings,
          validationResult: result.validationResult
        }
      };

      res.status(201).json(response);

    } catch (error) {
      console.error('File upload error:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred during file upload',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Upload multiple CAD files
 * POST /api/files/upload/batch
 */
router.post('/upload/batch',
  authenticate,
  ...cadMultipleFileUpload,
  async (req: Request, res: Response) => {
    try {
      const { error, value } = validateFileUpload(req.body);
      if (error) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid upload parameters',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown',
            details: error.details.map(d => d.message)
          }
        };
        return res.status(400).json(response);
      }

      const files = req.files as Express.Multer.File[];
      const uploadOptions = {
        tags: value.tags,
        projectName: value.projectName,
        partName: value.partName,
        description: value.description,
        generateThumbnail: value.generateThumbnail,
        validateFile: value.validateFile
      };

      const fileData = files.map(file => ({
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype
      }));

      const results = await fileUploadService.uploadMultipleFiles(
        fileData,
        req.user!.id,
        uploadOptions
      );

      const successfulUploads = results.filter(r => r.success);
      const failedUploads = results.filter(r => !r.success);

      const response: ApiResponse = {
        success: failedUploads.length === 0,
        data: {
          totalFiles: files.length,
          successfulUploads: successfulUploads.length,
          failedUploads: failedUploads.length,
          files: successfulUploads.map(r => r.file),
          failures: failedUploads.map((r, index) => ({
            filename: files[results.indexOf(r)].originalname,
            errors: r.errors,
            warnings: r.warnings
          }))
        }
      };

      const statusCode = failedUploads.length === 0 ? 201 : 
                        successfulUploads.length === 0 ? 400 : 207; // Multi-status

      res.status(statusCode).json(response);

    } catch (error) {
      console.error('Batch upload error:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred during batch upload',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Get all files with filtering and pagination
 * GET /api/files
 */
router.get('/',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { error, value } = validateFileQuery(req.query);
      if (error) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown',
            details: error.details.map(d => d.message)
          }
        };
        return res.status(400).json(response);
      }

      const filters: FileFilters = {
        tags: Array.isArray(value.tags) ? value.tags : (value.tags ? value.tags.split(',').map((t: string) => t.trim()) : undefined),
        projectName: value.projectName,
        partName: value.partName,
        uploadedBy: value.uploadedBy,
        dateRange: value.startDate && value.endDate ? {
          startDate: new Date(value.startDate),
          endDate: new Date(value.endDate)
        } : undefined,
        fileSize: (value.minSize || value.maxSize) ? {
          min: value.minSize,
          max: value.maxSize
        } : undefined
      };

      const options: QueryOptions = {
        limit: value.limit,
        offset: (value.page - 1) * value.limit,
        orderBy: value.sortBy,
        orderDirection: value.sortOrder as 'asc' | 'desc'
      };

      let result;
      if (value.search) {
        result = await CADFileModel.search(value.search, filters, options);
      } else {
        result = await CADFileModel.findAll(filters, options);
      }

      const response: ApiResponse = {
        success: true,
        data: {
          files: result.files,
          pagination: result.pagination,
          filters: filters,
          query: value.search
        }
      };

      res.json(response);

    } catch (error) {
      console.error('Get files error:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred while retrieving files',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Get file by ID
 * GET /api/files/:id
 */
router.get('/:id',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { isValid, error } = validateFileId(req.params.id);
      if (!isValid) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'INVALID_FILE_ID',
            message: error!,
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(400).json(response);
      }

      const file = await CADFileModel.findById(req.params.id);
      if (!file) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FILE_NOT_FOUND',
            message: 'File not found',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: true,
        data: { file }
      };

      res.json(response);

    } catch (error) {
      console.error('Get file error:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred while retrieving the file',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Update file metadata
 * PUT /api/files/:id
 */
router.put('/:id',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { isValid, error: idError } = validateFileId(req.params.id);
      if (!isValid) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'INVALID_FILE_ID',
            message: idError!,
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(400).json(response);
      }

      const { error, value } = validateFileUpdate(req.body);
      if (error) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid update parameters',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown',
            details: error.details.map(d => d.message)
          }
        };
        return res.status(400).json(response);
      }

      const updatedFile = await CADFileModel.update(req.params.id, value);
      if (!updatedFile) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FILE_NOT_FOUND',
            message: 'File not found',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: true,
        data: { file: updatedFile }
      };

      res.json(response);

    } catch (error) {
      console.error('Update file error:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred while updating the file',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Replace file (create new version)
 * POST /api/files/:id/replace
 */
router.post('/:id/replace',
  authenticate,
  uploadSingle('file'),
  async (req: Request, res: Response) => {
    try {
      const { isValid, error: idError } = validateFileId(req.params.id);
      if (!isValid) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'INVALID_FILE_ID',
            message: idError!,
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(400).json(response);
      }

      const { error, value } = validateFileReplace(req.body);
      if (error) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid replacement parameters',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown',
            details: error.details.map(d => d.message)
          }
        };
        return res.status(400).json(response);
      }

      const file = req.file!;
      const result = await fileUploadService.replaceFile(
        req.params.id,
        file.buffer,
        file.originalname,
        file.mimetype,
        req.user!.id,
        value.changeDescription,
        {
          generateThumbnail: value.generateThumbnail,
          validateFile: value.validateFile
        }
      );

      if (!result.success) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'REPLACEMENT_FAILED',
            message: 'File replacement failed',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown',
            details: result.errors,
            suggestions: result.warnings
          }
        };
        return res.status(400).json(response);
      }

      const response: ApiResponse = {
        success: true,
        data: {
          file: result.file,
          warnings: result.warnings,
          validationResult: result.validationResult
        }
      };

      res.json(response);

    } catch (error) {
      console.error('File replacement error:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred during file replacement',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Delete file
 * DELETE /api/files/:id
 */
router.delete('/:id',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { isValid, error } = validateFileId(req.params.id);
      if (!isValid) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'INVALID_FILE_ID',
            message: error!,
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(400).json(response);
      }

      const deleted = await fileUploadService.deleteFile(req.params.id, req.user!.id);
      if (!deleted) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FILE_NOT_FOUND',
            message: 'File not found or could not be deleted',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: true,
        data: { message: 'File deleted successfully' }
      };

      res.json(response);

    } catch (error) {
      console.error('Delete file error:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred while deleting the file',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Download file
 * GET /api/files/:id/download
 */
router.get('/:id/download',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { isValid, error } = validateFileId(req.params.id);
      if (!isValid) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'INVALID_FILE_ID',
            message: error!,
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(400).json(response);
      }

      const file = await CADFileModel.findById(req.params.id);
      if (!file) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FILE_NOT_FOUND',
            message: 'File not found',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(404).json(response);
      }

      const fileStream = await fileUploadService.getFileStream(req.params.id, req.user!.id);
      if (!fileStream) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FILE_STREAM_ERROR',
            message: 'Could not retrieve file for download',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(500).json(response);
      }

      // Set download headers
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
      res.setHeader('Content-Length', file.fileSize.toString());

      // Pipe file stream to response
      fileStream.pipe(res);

    } catch (error) {
      console.error('Download file error:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred while downloading the file',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Get file versions
 * GET /api/files/:id/versions
 */
router.get('/:id/versions',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { isValid, error } = validateFileId(req.params.id);
      if (!isValid) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'INVALID_FILE_ID',
            message: error!,
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(400).json(response);
      }

      const versions = await CADFileModel.getFileVersions(req.params.id);
      
      const response: ApiResponse = {
        success: true,
        data: { versions }
      };

      res.json(response);

    } catch (error) {
      console.error('Get file versions error:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred while retrieving file versions',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Advanced search with metadata and content
 * POST /api/files/search/advanced
 */
router.post('/search/advanced',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { error, value } = validateFileQuery({
        ...req.query,
        ...req.body
      });
      
      if (error) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid search parameters',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown',
            details: error.details.map(d => d.message)
          }
        };
        return res.status(400).json(response);
      }

      const filters: FileFilters = {
        tags: Array.isArray(value.tags) ? value.tags : (value.tags ? value.tags.split(',').map((t: string) => t.trim()) : undefined),
        projectName: value.projectName,
        partName: value.partName,
        uploadedBy: value.uploadedBy,
        dateRange: value.startDate && value.endDate ? {
          startDate: new Date(value.startDate),
          endDate: new Date(value.endDate)
        } : undefined,
        fileSize: (value.minSize || value.maxSize) ? {
          min: value.minSize,
          max: value.maxSize
        } : undefined
      };

      const options: QueryOptions = {
        limit: value.limit,
        offset: (value.page - 1) * value.limit,
        orderBy: value.sortBy,
        orderDirection: value.sortOrder as 'asc' | 'desc'
      };

      const result = await CADFileModel.advancedSearch(
        value.search || '',
        filters,
        options
      );

      const response: ApiResponse = {
        success: true,
        data: {
          files: result.files,
          pagination: result.pagination,
          searchStats: result.searchStats,
          filters: filters,
          query: value.search
        }
      };

      res.json(response);

    } catch (error) {
      console.error('Advanced search error:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred during advanced search',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Search by metadata criteria
 * POST /api/files/search/metadata
 */
router.post('/search/metadata',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const metadataFilters = req.body;
      const options: QueryOptions = {
        limit: req.body.limit || 10,
        offset: ((req.body.page || 1) - 1) * (req.body.limit || 10),
        orderBy: req.body.sortBy || 'uploadedAt',
        orderDirection: req.body.sortOrder as 'asc' | 'desc' || 'desc'
      };

      const result = await CADFileModel.searchByMetadata(metadataFilters, options);

      const response: ApiResponse = {
        success: true,
        data: {
          files: result.files,
          pagination: result.pagination,
          filters: metadataFilters
        }
      };

      res.json(response);

    } catch (error) {
      console.error('Metadata search error:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred during metadata search',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Search by tags
 * GET /api/files/search/tags
 */
router.get('/search/tags',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const tags = Array.isArray(req.query.tags) 
        ? req.query.tags as string[]
        : (req.query.tags as string)?.split(',') || [];
      
      const matchType = (req.query.matchType as 'any' | 'all') || 'any';
      
      const options: QueryOptions = {
        limit: parseInt(req.query.limit as string) || 10,
        offset: ((parseInt(req.query.page as string) || 1) - 1) * (parseInt(req.query.limit as string) || 10),
        orderBy: req.query.sortBy as string || 'uploadedAt',
        orderDirection: req.query.sortOrder as 'asc' | 'desc' || 'desc'
      };

      const result = await CADFileModel.findByTags(tags, matchType, options);

      const response: ApiResponse = {
        success: true,
        data: {
          files: result.files,
          pagination: result.pagination,
          searchCriteria: { tags, matchType }
        }
      };

      res.json(response);

    } catch (error) {
      console.error('Tag search error:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred during tag search',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Get popular tags
 * GET /api/files/tags/popular
 */
router.get('/tags/popular',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const tags = await CADFileModel.getPopularTags(limit);

      const response: ApiResponse = {
        success: true,
        data: { tags }
      };

      res.json(response);

    } catch (error) {
      console.error('Get popular tags error:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred while retrieving popular tags',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Get upload statistics
 * GET /api/files/stats
 */
router.get('/stats',
  authenticate,
  authorize(['admin', 'engineer']),
  async (req: Request, res: Response) => {
    try {
      const { error, value } = validateStatisticsQuery(req.query);
      if (error) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid statistics query parameters',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown',
            details: error.details.map(d => d.message)
          }
        };
        return res.status(400).json(response);
      }

      const stats = await fileUploadService.getUploadStatistics(value.userId);
      const fileStats = await CADFileModel.getStatistics();

      const response: ApiResponse = {
        success: true,
        data: {
          ...stats,
          filesByType: fileStats.filesByType,
          query: value
        }
      };

      res.json(response);

    } catch (error) {
      console.error('Get statistics error:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred while retrieving statistics',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * Validate file integrity
 * POST /api/files/:id/validate
 */
router.post('/:id/validate',
  authenticate,
  authorize(['admin', 'engineer']),
  async (req: Request, res: Response) => {
    try {
      const { isValid, error } = validateFileId(req.params.id);
      if (!isValid) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'INVALID_FILE_ID',
            message: error!,
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(400).json(response);
      }

      const validationResult = await fileUploadService.validateFileIntegrity(req.params.id);
      if (!validationResult) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'FILE_NOT_FOUND',
            message: 'File not found or could not be validated',
            timestamp: new Date(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: true,
        data: { validationResult }
      };

      res.json(response);

    } catch (error) {
      console.error('Validate file error:', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred while validating the file',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      res.status(500).json(response);
    }
  }
);

// Apply upload error handling middleware
router.use(handleUploadError);

export default router;