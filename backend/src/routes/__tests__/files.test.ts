import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import fileRoutes from '../files.js';
import { FileUploadService } from '../../services/FileUploadService.js';
import { CADFileModel } from '../../models/CADFile.js';
import { authenticateToken } from '../../middleware/auth.js';

// Mock dependencies
vi.mock('../../services/FileUploadService.js');
vi.mock('../../models/CADFile.js');
vi.mock('../../middleware/auth.js');

// Mock multer middleware
vi.mock('../../middleware/upload.js', () => ({
  uploadSingle: () => [(req: any, res: any, next: any) => {
    req.file = {
      buffer: Buffer.from('test file content'),
      originalname: 'test.dwg',
      mimetype: 'application/dwg',
      size: 1000
    };
    next();
  }],
  uploadMultiple: () => [(req: any, res: any, next: any) => {
    req.files = [
      {
        buffer: Buffer.from('test file 1'),
        originalname: 'test1.dwg',
        mimetype: 'application/dwg',
        size: 1000
      },
      {
        buffer: Buffer.from('test file 2'),
        originalname: 'test2.dwg',
        mimetype: 'application/dwg',
        size: 1000
      }
    ];
    next();
  }],
  handleUploadError: (error: any, req: any, res: any, next: any) => next(error),
  cadFileUpload: [(req: any, res: any, next: any) => {
    req.file = {
      buffer: Buffer.from('test file content'),
      originalname: 'test.dwg',
      mimetype: 'application/dwg',
      size: 1000
    };
    next();
  }],
  cadMultipleFileUpload: [(req: any, res: any, next: any) => {
    req.files = [
      {
        buffer: Buffer.from('test file 1'),
        originalname: 'test1.dwg',
        mimetype: 'application/dwg',
        size: 1000
      }
    ];
    next();
  }]
}));

describe('File Routes', () => {
  let app: express.Application;
  let mockFileUploadService: any;
  let mockUser: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup Express app
    app = express();
    app.use(express.json());
    app.use('/api/files', fileRoutes);

    // Mock user for authentication
    mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      role: 'engineer'
    };

    // Mock authentication middleware
    (authenticateToken as any).mockImplementation((req: any, res: any, next: any) => {
      req.user = mockUser;
      next();
    });

    // Mock FileUploadService
    mockFileUploadService = {
      uploadFile: vi.fn(),
      uploadMultipleFiles: vi.fn(),
      replaceFile: vi.fn(),
      deleteFile: vi.fn(),
      getFileStream: vi.fn(),
      validateFileIntegrity: vi.fn(),
      getUploadStatistics: vi.fn()
    };

    (FileUploadService as any).mockImplementation(() => mockFileUploadService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /upload', () => {
    it('should upload file successfully', async () => {
      const mockFile = {
        id: 'file-123',
        filename: 'test-file.dwg',
        originalName: 'test.dwg',
        fileSize: 1000,
        uploadedBy: mockUser.id
      };

      mockFileUploadService.uploadFile.mockResolvedValue({
        success: true,
        file: mockFile,
        errors: [],
        warnings: []
      });

      const response = await request(app)
        .post('/api/files/upload')
        .field('tags', 'test,cad')
        .field('projectName', 'Test Project')
        .attach('file', Buffer.from('test content'), 'test.dwg');

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.file).toEqual(mockFile);

      expect(mockFileUploadService.uploadFile).toHaveBeenCalledWith(
        expect.any(Buffer),
        'test.dwg',
        'application/dwg',
        mockUser.id,
        expect.objectContaining({
          tags: ['test', 'cad'],
          projectName: 'Test Project'
        })
      );
    });

    it('should return error when upload fails', async () => {
      mockFileUploadService.uploadFile.mockResolvedValue({
        success: false,
        errors: ['File validation failed'],
        warnings: []
      });

      const response = await request(app)
        .post('/api/files/upload')
        .attach('file', Buffer.from('test content'), 'test.dwg');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.details).toContain('File validation failed');
    });

    it('should return validation error for invalid parameters', async () => {
      const response = await request(app)
        .post('/api/files/upload')
        .field('tags', 'a'.repeat(60)) // Too long tag
        .attach('file', Buffer.from('test content'), 'test.dwg');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /upload/batch', () => {
    it('should upload multiple files successfully', async () => {
      const mockResults = [
        {
          success: true,
          file: { id: 'file-1', originalName: 'test1.dwg' },
          errors: [],
          warnings: []
        },
        {
          success: true,
          file: { id: 'file-2', originalName: 'test2.dwg' },
          errors: [],
          warnings: []
        }
      ];

      mockFileUploadService.uploadMultipleFiles.mockResolvedValue(mockResults);

      const response = await request(app)
        .post('/api/files/upload/batch')
        .field('projectName', 'Batch Project')
        .attach('files', Buffer.from('test content 1'), 'test1.dwg')
        .attach('files', Buffer.from('test content 2'), 'test2.dwg');

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalFiles).toBe(1); // Based on mock files array
      expect(response.body.data.successfulUploads).toBe(2);
      expect(response.body.data.failedUploads).toBe(0);
    });

    it('should handle mixed success and failure results', async () => {
      const mockResults = [
        {
          success: true,
          file: { id: 'file-1', originalName: 'test1.dwg' },
          errors: [],
          warnings: []
        },
        {
          success: false,
          errors: ['Validation failed'],
          warnings: []
        }
      ];

      mockFileUploadService.uploadMultipleFiles.mockResolvedValue(mockResults);

      const response = await request(app)
        .post('/api/files/upload/batch')
        .attach('files', Buffer.from('test content'), 'test.dwg');

      expect(response.status).toBe(207); // Multi-status
      expect(response.body.data.successfulUploads).toBe(1);
      expect(response.body.data.failedUploads).toBe(1);
    });
  });

  describe('GET /', () => {
    it('should get files with default parameters', async () => {
      const mockFiles = [
        { id: 'file-1', originalName: 'test1.dwg' },
        { id: 'file-2', originalName: 'test2.dwg' }
      ];

      const mockPagination = {
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1
      };

      (CADFileModel.findAll as any).mockResolvedValue({
        files: mockFiles,
        pagination: mockPagination
      });

      const response = await request(app)
        .get('/api/files');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.files).toEqual(mockFiles);
      expect(response.body.data.pagination).toEqual(mockPagination);
    });

    it('should get files with search query', async () => {
      const mockFiles = [{ id: 'file-1', originalName: 'searched.dwg' }];
      const mockPagination = { page: 1, limit: 10, total: 1, totalPages: 1 };

      (CADFileModel.search as any).mockResolvedValue({
        files: mockFiles,
        pagination: mockPagination
      });

      const response = await request(app)
        .get('/api/files')
        .query({ search: 'test query' });

      expect(response.status).toBe(200);
      expect(CADFileModel.search).toHaveBeenCalledWith(
        'test query',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should get files with filters', async () => {
      const mockFiles = [{ id: 'file-1', originalName: 'filtered.dwg' }];
      const mockPagination = { page: 1, limit: 10, total: 1, totalPages: 1 };

      (CADFileModel.findAll as any).mockResolvedValue({
        files: mockFiles,
        pagination: mockPagination
      });

      const response = await request(app)
        .get('/api/files')
        .query({
          tags: 'cad,design',
          projectName: 'Test Project',
          page: 2,
          limit: 5
        });

      expect(response.status).toBe(200);
      expect(CADFileModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['cad', 'design'],
          projectName: 'Test Project'
        }),
        expect.objectContaining({
          limit: 5,
          offset: 5 // (page - 1) * limit
        })
      );
    });

    it('should return validation error for invalid query parameters', async () => {
      const response = await request(app)
        .get('/api/files')
        .query({ page: -1 }); // Invalid page number

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /:id', () => {
    it('should get file by ID successfully', async () => {
      const mockFile = {
        id: 'file-123',
        originalName: 'test.dwg',
        fileSize: 1000
      };

      (CADFileModel.findById as any).mockResolvedValue(mockFile);

      const response = await request(app)
        .get('/api/files/file-123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.file).toEqual(mockFile);
    });

    it('should return 404 when file not found', async () => {
      (CADFileModel.findById as any).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/files/nonexistent-file');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FILE_NOT_FOUND');
    });

    it('should return validation error for invalid file ID', async () => {
      const response = await request(app)
        .get('/api/files/invalid-id');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_FILE_ID');
    });
  });

  describe('PUT /:id', () => {
    it('should update file metadata successfully', async () => {
      const updatedFile = {
        id: 'file-123',
        originalName: 'test.dwg',
        tags: ['updated', 'cad'],
        projectName: 'Updated Project'
      };

      (CADFileModel.update as any).mockResolvedValue(updatedFile);

      const response = await request(app)
        .put('/api/files/file-123')
        .send({
          tags: ['updated', 'cad'],
          projectName: 'Updated Project'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.file).toEqual(updatedFile);

      expect(CADFileModel.update).toHaveBeenCalledWith(
        'file-123',
        expect.objectContaining({
          tags: ['updated', 'cad'],
          projectName: 'Updated Project'
        })
      );
    });

    it('should return 404 when file not found for update', async () => {
      (CADFileModel.update as any).mockResolvedValue(null);

      const response = await request(app)
        .put('/api/files/nonexistent-file')
        .send({ tags: ['test'] });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FILE_NOT_FOUND');
    });
  });

  describe('POST /:id/replace', () => {
    it('should replace file successfully', async () => {
      const replacedFile = {
        id: 'file-123',
        originalName: 'test.dwg',
        currentVersion: 2
      };

      mockFileUploadService.replaceFile.mockResolvedValue({
        success: true,
        file: replacedFile,
        errors: [],
        warnings: []
      });

      const response = await request(app)
        .post('/api/files/file-123/replace')
        .field('changeDescription', 'Updated design')
        .attach('file', Buffer.from('new content'), 'test.dwg');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.file).toEqual(replacedFile);

      expect(mockFileUploadService.replaceFile).toHaveBeenCalledWith(
        'file-123',
        expect.any(Buffer),
        'test.dwg',
        'application/dwg',
        mockUser.id,
        'Updated design',
        expect.any(Object)
      );
    });

    it('should return error when replacement fails', async () => {
      mockFileUploadService.replaceFile.mockResolvedValue({
        success: false,
        errors: ['Original file not found'],
        warnings: []
      });

      const response = await request(app)
        .post('/api/files/nonexistent-file/replace')
        .attach('file', Buffer.from('new content'), 'test.dwg');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.details).toContain('Original file not found');
    });
  });

  describe('DELETE /:id', () => {
    it('should delete file successfully', async () => {
      mockFileUploadService.deleteFile.mockResolvedValue(true);

      const response = await request(app)
        .delete('/api/files/file-123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('File deleted successfully');

      expect(mockFileUploadService.deleteFile).toHaveBeenCalledWith(
        'file-123',
        mockUser.id
      );
    });

    it('should return 404 when file not found for deletion', async () => {
      mockFileUploadService.deleteFile.mockResolvedValue(false);

      const response = await request(app)
        .delete('/api/files/nonexistent-file');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FILE_NOT_FOUND');
    });
  });

  describe('GET /:id/download', () => {
    it('should download file successfully', async () => {
      const mockFile = {
        id: 'file-123',
        originalName: 'test.dwg',
        mimeType: 'application/dwg',
        fileSize: 1000
      };

      const mockStream = {
        pipe: vi.fn()
      };

      (CADFileModel.findById as any).mockResolvedValue(mockFile);
      mockFileUploadService.getFileStream.mockResolvedValue(mockStream);

      const response = await request(app)
        .get('/api/files/file-123/download');

      expect(mockFileUploadService.getFileStream).toHaveBeenCalledWith(
        'file-123',
        mockUser.id
      );
      expect(mockStream.pipe).toHaveBeenCalled();
    });

    it('should return 404 when file not found for download', async () => {
      (CADFileModel.findById as any).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/files/nonexistent-file/download');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FILE_NOT_FOUND');
    });

    it('should return error when file stream cannot be retrieved', async () => {
      const mockFile = { id: 'file-123', originalName: 'test.dwg' };

      (CADFileModel.findById as any).mockResolvedValue(mockFile);
      mockFileUploadService.getFileStream.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/files/file-123/download');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FILE_STREAM_ERROR');
    });
  });

  describe('GET /:id/versions', () => {
    it('should get file versions successfully', async () => {
      const mockVersions = [
        { id: 'v1', versionNumber: 1, filename: 'test-v1.dwg' },
        { id: 'v2', versionNumber: 2, filename: 'test-v2.dwg' }
      ];

      (CADFileModel.getFileVersions as any).mockResolvedValue(mockVersions);

      const response = await request(app)
        .get('/api/files/file-123/versions');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.versions).toEqual(mockVersions);
    });
  });

  describe('GET /stats', () => {
    it('should get upload statistics successfully', async () => {
      const mockStats = {
        totalUploads: 100,
        totalSize: 1000000,
        recentUploads: 10,
        failureRate: 5.0
      };

      const mockFileStats = {
        filesByType: { 'application/dwg': 50, 'application/dxf': 50 }
      };

      mockFileUploadService.getUploadStatistics.mockResolvedValue(mockStats);
      (CADFileModel.getStatistics as any).mockResolvedValue(mockFileStats);

      const response = await request(app)
        .get('/api/files/stats');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        ...mockStats,
        filesByType: mockFileStats.filesByType,
        query: expect.any(Object)
      });
    });
  });

  describe('POST /:id/validate', () => {
    it('should validate file integrity successfully', async () => {
      const mockValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
        metadata: { units: 'mm' }
      };

      mockFileUploadService.validateFileIntegrity.mockResolvedValue(mockValidationResult);

      const response = await request(app)
        .post('/api/files/file-123/validate');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.validationResult).toEqual(mockValidationResult);
    });

    it('should return 404 when file not found for validation', async () => {
      mockFileUploadService.validateFileIntegrity.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/files/nonexistent-file/validate');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FILE_NOT_FOUND');
    });
  });

  describe('Error Handling', () => {
    it('should handle internal server errors', async () => {
      (CADFileModel.findAll as any).mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/files');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    });

    it('should include request ID in error responses', async () => {
      (CADFileModel.findById as any).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/files/nonexistent-file')
        .set('x-request-id', 'test-request-123');

      expect(response.status).toBe(404);
      expect(response.body.error.requestId).toBe('test-request-123');
    });
  });
});